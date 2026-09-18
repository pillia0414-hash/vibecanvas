import "server-only";

import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

const OFFICIAL_DEEPSEEK_MODELS = new Set(["deepseek-flash", "deepseek-v4-pro"]);

function requiredEnv(name: "DEEPSEEK_API_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`服务端尚未配置 ${name}`);
  return value;
}

function catalogTemplate(modelId: string) {
  const catalog = deepseekProvider().getModels();
  if (modelId === "deepseek-v4-pro") {
    return catalog.find((candidate) => candidate.id === "deepseek-v4-pro");
  }
  return (
    catalog.find((candidate) => candidate.id === "deepseek-v4-flash-vision-exp") ||
    catalog.find((candidate) => candidate.id === "deepseek-v4-flash")
  );
}

export function createAgentRuntime() {
  requiredEnv("DEEPSEEK_API_KEY");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, "");
  const modelId = process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL;
  if (!OFFICIAL_DEEPSEEK_MODELS.has(modelId)) {
    throw new Error(`不支持的 DeepSeek 模型：${modelId}。请使用 deepseek-flash 或 deepseek-v4-pro`);
  }

  const template = catalogTemplate(modelId);
  if (!template) throw new Error("Pi 中缺少可用的 DeepSeek 模型模板");

  const model = {
    ...template,
    id: modelId,
    name: modelId === "deepseek-v4-pro" ? "DeepSeek V4 Pro" : "DeepSeek Flash",
    baseUrl,
    input: modelId === "deepseek-flash" ? ["text", "image"] : template.input,
  } satisfies Model<"openai-completions">;

  const provider = createProvider<"openai-completions">({
    id: "deepseek",
    name: "DeepSeek",
    baseUrl,
    auth: { apiKey: envApiKeyAuth("DeepSeek API key", ["DEEPSEEK_API_KEY"]) },
    models: [model],
    api: openAICompletionsApi(),
  });
  const models = createModels();
  models.setProvider(provider);
  return { models, model };
}
