/**
 * Server-side adapter for KIE GPT Image 2.5 Flare.
 *
 * This module deliberately does not share the legacy GPT Image 2 model
 * mapping in `lib/kie.ts`: an Agent request must never silently fall back to
 * an older KIE model.
 */

const DEFAULT_BASE_URL = "https://api.kie.ai";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_TIMEOUT_MS = 12 * 60_000;

export const KIE_FLARE_TEXT_TO_IMAGE_MODEL =
  "gpt-image-2-5-flare-text-to-image" as const;
export const KIE_FLARE_IMAGE_TO_IMAGE_MODEL =
  "gpt-image-2-5-flare-image-to-image" as const;

export const KIE_FLARE_ASPECT_RATIOS = [
  "auto",
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "21:9",
  "27:16",
  "16:27",
  "9:8",
  "8:9",
] as const;

export const KIE_FLARE_ONE_K_ONLY_ASPECT_RATIOS = [
  "27:16",
  "16:27",
  "9:8",
  "8:9",
] as const;

export const KIE_FLARE_RESOLUTIONS = ["1K", "2K", "4K"] as const;
export const KIE_FLARE_BACKGROUNDS = ["transparent", "opaque", "auto"] as const;
export const KIE_FLARE_TASK_STATES = [
  "waiting",
  "queuing",
  "generating",
  "success",
  "fail",
] as const;

export type KieFlareModel =
  | typeof KIE_FLARE_TEXT_TO_IMAGE_MODEL
  | typeof KIE_FLARE_IMAGE_TO_IMAGE_MODEL;
export type KieFlareAspectRatio = (typeof KIE_FLARE_ASPECT_RATIOS)[number];
export type KieFlareResolution = (typeof KIE_FLARE_RESOLUTIONS)[number];
export type KieFlareBackground = (typeof KIE_FLARE_BACKGROUNDS)[number];
export type KieFlareTaskState = (typeof KIE_FLARE_TASK_STATES)[number];

export interface KieFlareCreateInput {
  prompt: string;
  /** Ordered reference URLs. Empty/omitted means text-to-image; maximum 16. */
  referenceUrls?: readonly string[];
  aspectRatio?: KieFlareAspectRatio;
  resolution?: KieFlareResolution;
  background?: KieFlareBackground;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
}

export interface KieFlareProviderTextInput {
  prompt: string;
  aspect_ratio: KieFlareAspectRatio;
  resolution: KieFlareResolution;
  background: KieFlareBackground;
}

export interface KieFlareProviderImageInput extends KieFlareProviderTextInput {
  input_urls: string[];
}

export type KieFlareProviderInput =
  | KieFlareProviderTextInput
  | KieFlareProviderImageInput;

export interface KieFlareCreatedTask {
  taskId: string;
  providerModel: KieFlareModel;
  /** Exact validated input sent to KIE, suitable for persistence/auditing. */
  providerInput: KieFlareProviderInput;
}

export interface KieFlareTaskRecord {
  taskId?: string;
  model?: string;
  state: KieFlareTaskState;
  resultJson?: string | null;
  failCode?: string | null;
  failMsg?: string | null;
  createTime?: number | null;
  updateTime?: number | null;
  completeTime?: number | null;
  [key: string]: unknown;
}

export interface KieFlareCompletedTask extends KieFlareTaskRecord {
  state: "success";
  resultUrls: string[];
}

export interface KieFlareWaitOptions {
  /** Total polling deadline. Defaults to 12 minutes. */
  timeoutMs?: number;
  /** First delay between pending responses. Defaults to 2.5 seconds. */
  initialDelayMs?: number;
  /** Maximum delay between polls. Defaults to 10 seconds. */
  maxDelayMs?: number;
  /** Multiplier applied after every pending/transient response. Defaults to 1.5. */
  backoffFactor?: number;
  /** Timeout for each individual query request. Defaults to 30 seconds. */
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  onPoll?: (record: KieFlareTaskRecord) => void | Promise<void>;
}

export class KieFlareError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string | number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "KieFlareError";
  }
}

const aspectRatios = new Set<string>(KIE_FLARE_ASPECT_RATIOS);
const oneKOnlyAspectRatios = new Set<string>(KIE_FLARE_ONE_K_ONLY_ASPECT_RATIOS);
const resolutions = new Set<string>(KIE_FLARE_RESOLUTIONS);
const backgrounds = new Set<string>(KIE_FLARE_BACKGROUNDS);
const taskStates = new Set<string>(KIE_FLARE_TASK_STATES);

function requireServerConfiguration() {
  const apiKey = process.env.KIE_API_KEY?.trim();
  if (!apiKey) {
    throw new KieFlareError(
      "服务端尚未配置 KIE_API_KEY",
      503,
      "missing_api_key",
    );
  }

  const baseUrl = (process.env.KIE_API_BASE_URL || DEFAULT_BASE_URL).trim();
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new KieFlareError(
      "KIE_API_BASE_URL 不是有效 URL",
      500,
      "invalid_base_url",
    );
  }
  if (parsedBaseUrl.protocol !== "https:" && parsedBaseUrl.protocol !== "http:") {
    throw new KieFlareError(
      "KIE_API_BASE_URL 必须使用 HTTP 或 HTTPS",
      500,
      "invalid_base_url",
    );
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
  };
}

function positiveFiniteNumber(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new KieFlareError(`${name} 必须是正数`, 400, "invalid_input");
  }
  return value;
}

function validatePrompt(prompt: string) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new KieFlareError("生图提示词不能为空", 400, "invalid_prompt");
  }
  if (prompt.length > 20_000) {
    throw new KieFlareError(
      "生图提示词不能超过 20000 个字符",
      400,
      "invalid_prompt",
    );
  }
  return prompt;
}

function validateReferenceUrls(referenceUrls: readonly string[] | undefined) {
  if (referenceUrls === undefined) return [];
  if (!Array.isArray(referenceUrls)) {
    throw new KieFlareError("参考图必须是 URL 数组", 400, "invalid_reference_urls");
  }
  if (referenceUrls.length > 16) {
    throw new KieFlareError(
      "GPT Image 2.5 Flare 最多支持 16 张参考图",
      400,
      "too_many_reference_urls",
    );
  }

  // Map without sorting or deduplicating: order is semantically meaningful
  // (图一、图二…) and must match message_assets.position.
  return referenceUrls.map((rawUrl, index) => {
    if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
      throw new KieFlareError(
        `第 ${index + 1} 张参考图 URL 无效`,
        400,
        "invalid_reference_url",
      );
    }
    const url = rawUrl.trim();
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      throw new KieFlareError(
        `第 ${index + 1} 张参考图 URL 必须是 HTTP 或 HTTPS 地址`,
        400,
        "invalid_reference_url",
      );
    }
    return url;
  });
}

/** Validate and construct the exact provider model/input pair sent to KIE. */
export function buildKieFlareRequest(input: KieFlareCreateInput): {
  model: KieFlareModel;
  input: KieFlareProviderInput;
} {
  const prompt = validatePrompt(input.prompt);
  const referenceUrls = validateReferenceUrls(input.referenceUrls);
  const aspectRatio = input.aspectRatio ?? "auto";
  const resolution = input.resolution ?? "1K";
  const background = input.background ?? "auto";

  if (!aspectRatios.has(aspectRatio)) {
    throw new KieFlareError("GPT Image 2.5 Flare 不支持该图片比例", 400, "invalid_aspect_ratio");
  }
  if (!resolutions.has(resolution)) {
    throw new KieFlareError("GPT Image 2.5 Flare 不支持该分辨率", 400, "invalid_resolution");
  }
  if (!backgrounds.has(background)) {
    throw new KieFlareError("GPT Image 2.5 Flare 不支持该背景模式", 400, "invalid_background");
  }
  if (resolution !== "1K" && oneKOnlyAspectRatios.has(aspectRatio)) {
    throw new KieFlareError(
      `${aspectRatio} 比例仅支持 1K 分辨率`,
      400,
      "unsupported_resolution_for_aspect_ratio",
    );
  }

  const baseInput: KieFlareProviderTextInput = {
    prompt,
    aspect_ratio: aspectRatio,
    resolution,
    background,
  };

  if (referenceUrls.length > 0) {
    return {
      model: KIE_FLARE_IMAGE_TO_IMAGE_MODEL,
      input: { ...baseInput, input_urls: referenceUrls },
    };
  }

  return { model: KIE_FLARE_TEXT_TO_IMAGE_MODEL, input: baseInput };
}

type KieResponsePayload = {
  code?: unknown;
  msg?: unknown;
  message?: unknown;
  data?: unknown;
};

function providerError(
  responseStatus: number,
  payload: KieResponsePayload | null,
  fallback: string,
) {
  const rawCode = payload?.code;
  const numericCode = Number(rawCode || responseStatus);
  const messages: Record<number, string> = {
    401: "Kie AI 鉴权失败，请检查服务端 API Key 配置",
    402: "Kie AI 账户余额不足，请充值后重试",
    422: "Kie AI 拒绝了生图参数，请检查输入后重试",
    429: "Kie AI 请求过于频繁，请稍后重试",
    455: "Kie AI 服务暂时不可用，请稍后重试",
    500: "Kie AI 服务异常，请稍后重试",
    501: "Kie AI 服务异常，请稍后重试",
  };
  const providerMessage =
    typeof payload?.msg === "string"
      ? payload.msg
      : typeof payload?.message === "string"
        ? payload.message
        : undefined;
  const status =
    numericCode >= 400 && numericCode < 600
      ? numericCode
      : responseStatus >= 400 && responseStatus < 600
        ? responseStatus
        : 502;

  return new KieFlareError(
    messages[numericCode] || providerMessage || fallback,
    status,
    typeof rawCode === "string" || typeof rawCode === "number" ? rawCode : undefined,
  );
}

async function fetchJson(
  url: string,
  init: RequestInit,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
) {
  const timeoutMs = positiveFiniteNumber(
    options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    "requestTimeoutMs",
  );
  if (options.signal?.aborted) {
    throw new KieFlareError("KIE 请求已取消", 499, "aborted");
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort("request_timeout"), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as KieResponsePayload | null;
    return { response, payload };
  } catch (error) {
    if (options.signal?.aborted) {
      throw new KieFlareError("KIE 请求已取消", 499, "aborted", { cause: error });
    }
    if (controller.signal.aborted) {
      throw new KieFlareError("KIE 请求超时", 504, "request_timeout", { cause: error });
    }
    throw new KieFlareError("无法连接 Kie AI 服务", 502, "network_error", {
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

/** Create a GPT Image 2.5 Flare task. Model selection depends only on references. */
export async function createKieFlareTask(
  input: KieFlareCreateInput,
): Promise<KieFlareCreatedTask> {
  const { apiKey, baseUrl } = requireServerConfiguration();
  const providerRequest = buildKieFlareRequest(input);
  const { response, payload } = await fetchJson(
    `${baseUrl}/api/v1/jobs/createTask`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(providerRequest),
    },
    { signal: input.signal, timeoutMs: input.requestTimeoutMs },
  );

  const data = payload?.data;
  const taskId =
    data && typeof data === "object" && typeof (data as { taskId?: unknown }).taskId === "string"
      ? (data as { taskId: string }).taskId.trim()
      : "";
  if (!response.ok || Number(payload?.code) !== 200 || !taskId) {
    throw providerError(response.status, payload, "创建 GPT Image 2.5 Flare 任务失败");
  }

  return {
    taskId,
    providerModel: providerRequest.model,
    providerInput: providerRequest.input,
  };
}

/** Query the unified KIE task endpoint and validate its documented state. */
export async function getKieFlareTask(
  taskId: string,
  options: { signal?: AbortSignal; requestTimeoutMs?: number } = {},
): Promise<KieFlareTaskRecord> {
  if (typeof taskId !== "string" || taskId.trim().length === 0) {
    throw new KieFlareError("KIE taskId 不能为空", 400, "invalid_task_id");
  }
  const normalizedTaskId = taskId.trim();
  const { apiKey, baseUrl } = requireServerConfiguration();
  const { response, payload } = await fetchJson(
    `${baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(normalizedTaskId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
    options,
  );

  const data = payload?.data;
  if (!response.ok || Number(payload?.code) !== 200 || !data || typeof data !== "object") {
    throw providerError(response.status, payload, "查询 GPT Image 2.5 Flare 任务失败");
  }

  const record = data as Record<string, unknown>;
  if (typeof record.state !== "string" || !taskStates.has(record.state)) {
    throw new KieFlareError(
      "Kie AI 返回了未知的任务状态",
      502,
      "invalid_task_state",
    );
  }

  return record as unknown as KieFlareTaskRecord;
}

/** Parse the documented `{ resultUrls: string[] }` resultJson payload safely. */
export function getKieFlareResultUrls(resultJson?: string | null) {
  if (!resultJson) return [];
  try {
    const parsed = JSON.parse(resultJson) as { resultUrls?: unknown };
    if (!Array.isArray(parsed.resultUrls)) return [];
    return parsed.resultUrls.filter(
      (url): url is string => typeof url === "string" && url.length > 0,
    );
  } catch {
    return [];
  }
}

function retryable(error: unknown) {
  return (
    error instanceof KieFlareError &&
    (error.status === 429 ||
      error.status === 455 ||
      error.status === 500 ||
      error.status === 501 ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504)
  );
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new KieFlareError("KIE 任务等待已取消", 499, "aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new KieFlareError("KIE 任务等待已取消", 499, "aborted"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Poll until success/failure with bounded exponential backoff.
 *
 * Transient 429/5xx/network errors are retried within the same total timeout;
 * authentication, validation, malformed responses and provider task failures
 * are surfaced immediately.
 */
export async function waitForKieFlareTask(
  taskId: string,
  options: KieFlareWaitOptions = {},
): Promise<KieFlareCompletedTask> {
  const timeoutMs = positiveFiniteNumber(
    options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS,
    "timeoutMs",
  );
  const initialDelayMs = positiveFiniteNumber(
    options.initialDelayMs ?? 2_500,
    "initialDelayMs",
  );
  const maxDelayMs = positiveFiniteNumber(options.maxDelayMs ?? 10_000, "maxDelayMs");
  const backoffFactor = positiveFiniteNumber(
    options.backoffFactor ?? 1.5,
    "backoffFactor",
  );
  const requestTimeoutMs = positiveFiniteNumber(
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    "requestTimeoutMs",
  );
  if (maxDelayMs < initialDelayMs) {
    throw new KieFlareError(
      "maxDelayMs 不能小于 initialDelayMs",
      400,
      "invalid_polling_options",
    );
  }

  const deadline = Date.now() + timeoutMs;
  let delayMs = initialDelayMs;
  let lastTransientError: unknown;

  while (Date.now() < deadline) {
    if (options.signal?.aborted) {
      throw new KieFlareError("KIE 任务等待已取消", 499, "aborted");
    }

    let record: KieFlareTaskRecord | undefined;
    try {
      const remainingMs = deadline - Date.now();
      record = await getKieFlareTask(taskId, {
        signal: options.signal,
        requestTimeoutMs: Math.max(1, Math.min(requestTimeoutMs, remainingMs)),
      });
      lastTransientError = undefined;
    } catch (error) {
      if (!retryable(error)) throw error;
      lastTransientError = error;
    }

    // Provider task failures and malformed success responses must not enter the
    // transient HTTP retry path above.
    if (record) {
      await options.onPoll?.(record);
      if (record.state === "success") {
        const resultUrls = getKieFlareResultUrls(record.resultJson);
        if (resultUrls.length === 0) {
          throw new KieFlareError(
            "Kie AI 任务成功但未返回结果图片",
            502,
            "missing_result_urls",
          );
        }
        return { ...record, state: "success", resultUrls };
      }
      if (record.state === "fail") {
        throw new KieFlareError(
          record.failMsg || "GPT Image 2.5 Flare 生图任务失败",
          502,
          record.failCode || "generation_failed",
        );
      }
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(delayMs, remainingMs), options.signal);
    delayMs = Math.min(maxDelayMs, Math.ceil(delayMs * backoffFactor));
  }

  throw new KieFlareError(
    "等待 GPT Image 2.5 Flare 任务超时",
    504,
    "poll_timeout",
    lastTransientError === undefined ? undefined : { cause: lastTransientError },
  );
}
