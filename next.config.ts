import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // 内置技能在运行时从 docs/skills 读取 SKILL.md，部署时需要一起打包。
  outputFileTracingIncludes: {
    "/**": ["./docs/skills/**/SKILL.md"],
  },
};

export default nextConfig;
