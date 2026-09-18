# DeepSeek Agent 接入

来源：DeepSeek 官方文档 [首次调用 API](https://api-docs.deepseek.com/)。

## 官方参数

| PARAM | VALUE |
| --- | --- |
| base_url (OpenAI) | `https://api.deepseek.com` |
| base_url (Anthropic) | `https://api.deepseek.com/anthropic` |
| api_key | 在 DeepSeek 开放平台申请 |
| model | `deepseek-flash`、`deepseek-v4-pro` |

本项目 Agent 使用 OpenAI 兼容地址 `https://api.deepseek.com`，默认模型为 `deepseek-flash`。密钥只保存在服务端环境变量 `DEEPSEEK_API_KEY`。

## 模型说明

- 模型名必须使用 `deepseek-flash`。旧模型名 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 仍可调用，但对应模型已下线，请求由 DeepSeek-V4.1-Flash 提供服务，并按 Flash 价格计费。
- `deepseek-flash` 具备原生视觉能力，可用于 Agent 的 `view_image` 看图。
- `deepseek-v4-pro` 继续提供 API 服务。本项目默认不使用 Pro。

## 环境变量

```env
DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
```
