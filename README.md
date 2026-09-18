# Canvas AI

基于 Next.js、Supabase 与 Kie AI 的自由画布式 AI 生图应用。用户可以创建多个项目，在共享画布上整理图片，并在每个项目内使用多个独立对话调用 GPT Image2 或 Nano Banana2；同一个输入框也可以切换到 Agent 模式，由 Pi Agent + DeepSeek 规划并调用真实工具完成多张图的创作。

## 功能

- Supabase Auth 登录与会话管理
- 项目创建、重命名、删除、最近项目与分页加载
- 基于 `@xyflow/react` 的自由图片白板
- 多对话共享项目画布，画布自动保存
- 本地参考图上传、从画布选择参考图
- GPT Image2、Nano Banana2 独立模型配置
- Kie AI 异步任务创建、轮询、结果转存与失败重试
- 私有 Supabase Storage、RLS 与服务端频率限制
- Agent 模式：Pi Agent + DeepSeek 规划，通过真实工具读取素材、理解画布并调用 KIE GPT Image 2.5 Flare；文本、思考与工具事件实时流式展示并持久化
- 图片与 Markdown 统一附件入口：图片可作为有序画布引用，Markdown 由服务端安全读取供 Agent 使用
- Agent Skill：上传标准 `SKILL.md` 并按用户与项目隔离，`docs/skills/` 下的技能作为内置技能默认可用

产品规格和本地接口资料分别位于 [docs/prd.md](docs/prd.md) 与 [docs/API](docs/API)。

## Skill

Agent 输入框的「Skill」入口用来选择本次使用的技能。技能是一份带 YAML frontmatter 的 `SKILL.md`：`name` 只能是小写字母、数字和连字符，`description` 用于列表展示，正文是完整规则。

- 上传的技能保存在当前用户的当前项目下，可自行移除。
- `docs/skills/<name>/SKILL.md` 是内置技能，每个项目默认可见、标记「内置」、不可删除；上传同名 `SKILL.md` 会以项目自己的版本覆盖，删除后内置版本恢复。
- 已内置 [wechat-cover](docs/skills/wechat-cover/SKILL.md)：给它一篇 Markdown 文章，它会提炼主题与短标题，先让你从五种风格中选一种，再在同一轮生成 4 张同风格、不同构图的公众号封面。

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

   `KIE_API_KEY` 和 `DEEPSEEK_API_KEY` 只能配置在服务端环境中，不能增加 `NEXT_PUBLIC_` 前缀。`SUPABASE_SERVICE_ROLE_KEY` 只在需要运行 `scripts/` 下的维护脚本时配置。

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
