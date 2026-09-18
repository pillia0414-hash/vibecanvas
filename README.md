# Canvas AI

基于 Next.js、Supabase 与 Kie AI 的自由画布式 AI 生图应用。用户可以创建多个项目，在共享画布上整理图片，并在每个项目内使用多个独立对话调用 GPT Image2 或 Nano Banana2。

## 功能

- Supabase Auth 登录与会话管理
- 项目创建、重命名、删除、最近项目与分页加载
- 基于 `@xyflow/react` 的自由图片白板
- 多对话共享项目画布，画布自动保存
- 本地参考图上传、从画布选择参考图
- GPT Image2、Nano Banana2 独立模型配置
- Kie AI 异步任务创建、轮询、结果转存与失败重试
- 私有 Supabase Storage、RLS 与服务端频率限制

产品规格和本地接口资料分别位于 [docs/prd.md](docs/prd.md) 与 [docs/API](docs/API)。

## 本地运行

1. 安装依赖：

   ```bash
   npm install
   ```

2. 从 `.env.example` 创建 `.env.local`，并填写：

   ```env
   NEXT_PUBLIC_SUPABASE_URL=你的 Supabase 项目地址
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=你的 Supabase Publishable 或 Anon Key
   SUPABASE_STORAGE_BUCKET=project-assets
   KIE_API_BASE_URL=https://api.kie.ai
   KIE_API_KEY=你的 Kie AI API Key
   DEEPSEEK_API_KEY=你的 DeepSeek API Key
   DEEPSEEK_BASE_URL=https://api.deepseek.com
   DEEPSEEK_MODEL=deepseek-flash
   ```

   `KIE_API_KEY` 和 `DEEPSEEK_API_KEY` 只能配置在服务端环境中，不能增加 `NEXT_PUBLIC_` 前缀。

3. 将 `supabase/migrations/` 下的迁移按顺序应用到 Supabase 项目。迁移会创建业务表、RLS 策略和私有 `project-assets` Bucket。

4. 启动开发服务器：

   ```bash
   npm run dev
   ```

应用默认入口为 `http://localhost:3000/protected`，未登录用户会跳转到登录页。

## 质量检查

```bash
npm run lint
npx tsc --noEmit
npm run build
```
