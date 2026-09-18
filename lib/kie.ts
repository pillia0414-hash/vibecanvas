import type { GenerationConfig, GenerationModel, JobStatus } from "@/lib/app-types";

const BASE_URL = process.env.KIE_API_BASE_URL || "https://api.kie.ai";

export class KieError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string | number,
  ) {
    super(message);
  }
}

function headers() {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new KieError("服务端尚未配置 KIE_API_KEY", 503, "missing_api_key");
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

function providerError(responseStatus: number, payload: Record<string, unknown> | null, fallback: string) {
  const rawCode = payload?.code;
  const numericCode = Number(rawCode || responseStatus);
  const messages: Record<number, string> = {
    401: "Kie AI 鉴权失败，请检查服务端 API Key 配置",
    402: "Kie AI 账户余额不足，请充值后重试",
    422: "生图参数无效，请调整模型配置后重试",
    429: "Kie AI 请求过于频繁，请稍后重新生成",
    455: "Kie AI 服务暂时不可用，请稍后重新生成",
    500: "Kie AI 服务异常，请稍后重新生成",
    501: "Kie AI 服务异常，请稍后重新生成",
  };
  const providerMessage = typeof payload?.msg === "string"
    ? payload.msg
    : typeof payload?.message === "string"
      ? payload.message
      : undefined;
  const status = numericCode >= 400 && numericCode < 600
    ? numericCode
    : responseStatus >= 400 && responseStatus < 600
      ? responseStatus
      : 502;
  return new KieError(messages[numericCode] || providerMessage || fallback, status, rawCode as string | number | undefined);
}

export async function createKieTask(input: {
  model: GenerationModel;
  prompt: string;
  config: GenerationConfig;
  referenceUrl?: string;
}) {
  const { model, prompt, config, referenceUrl } = input;
  const providerModel =
    model === "nano-banana-2"
      ? "nano-banana-2"
      : referenceUrl
        ? "gpt-image-2-image-to-image"
        : "gpt-image-2-text-to-image";

  const providerInput: Record<string, unknown> = {
    prompt,
    aspect_ratio: config.aspectRatio,
    resolution: config.resolution,
  };

  if (model === "nano-banana-2") {
    providerInput.image_input = referenceUrl ? [referenceUrl] : [];
    providerInput.output_format = config.outputFormat || "jpg";
  } else {
    if (referenceUrl) providerInput.input_urls = [referenceUrl];
    if (config.resolution === "1K") {
      providerInput.background = config.background || "auto";
    }
  }

  const response = await fetch(`${BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model: providerModel, input: providerInput }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  const taskId = payload?.data?.taskId as string | undefined;
  if (!response.ok || payload?.code !== 200 || !taskId) {
    throw providerError(response.status, payload, "创建生图任务失败");
  }
  return { taskId, providerModel, providerInput };
}

export async function getKieTask(taskId: string) {
  const response = await fetch(
    `${BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { headers: headers(), cache: "no-store" },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.code !== 200 || !payload?.data) {
    throw providerError(response.status, payload, "查询生图任务失败");
  }
  return payload.data as {
    state: JobStatus;
    resultJson?: string | null;
    failCode?: string | null;
    failMsg?: string | null;
  };
}

export function resultUrls(resultJson?: string | null) {
  if (!resultJson) return [];
  try {
    const parsed = JSON.parse(resultJson);
    const urls = parsed?.resultUrls;
    return Array.isArray(urls) ? urls.filter((url): url is string => typeof url === "string") : [];
  } catch {
    return [];
  }
}
