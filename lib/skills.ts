export const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const MAX_SKILL_SOURCE_BYTES = 100 * 1024;

export interface ParsedSkillFile {
  name: string;
  description: string;
  body: string;
  source: string;
}

export interface ProjectSkillRecord {
  id: string;
  project_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  builtin?: boolean;
}

// 内置技能没有 assets 记录，用带冒号的前缀和用户技能（isSafeSkillName 禁止冒号）区分。
export const BUILTIN_SKILL_ID_PREFIX = "builtin:";

export function builtinSkillId(name: string) {
  return `${BUILTIN_SKILL_ID_PREFIX}${name}`;
}

export function isBuiltinSkillId(id: string) {
  return id.startsWith(BUILTIN_SKILL_ID_PREFIX);
}

export function builtinSkillName(id: string) {
  return isBuiltinSkillId(id) ? id.slice(BUILTIN_SKILL_ID_PREFIX.length) : "";
}

export class SkillParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillParseError";
  }
}

export function isSafeSkillName(name: string) {
  if (!name || name.length > 64) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("\0") || name.includes("..")) return false;
  if (name.includes(".") || name.includes(":")) return false;
  return SKILL_NAME_PATTERN.test(name);
}

export function parseSkillMarkdown(raw: string): ParsedSkillFile {
  const source = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!source.startsWith("---\n")) {
    throw new SkillParseError("SKILL.md 必须以 YAML frontmatter 开头");
  }
  const close = source.indexOf("\n---\n", 4);
  const closeAtEnd = close < 0 && source.endsWith("\n---") ? source.length - 4 : -1;
  if (close < 0 && closeAtEnd < 0) {
    throw new SkillParseError("SKILL.md 的 YAML frontmatter 未正确结束");
  }
  const fmEnd = close >= 0 ? close : closeAtEnd;
  const frontmatter = source.slice(4, fmEnd);
  const body = (close >= 0 ? source.slice(close + 5) : "").replace(/^\n+/, "").trimEnd();
  const fields = parseSimpleFrontmatter(frontmatter);
  const name = String(fields.name || "").trim();
  const description = String(fields.description || "").replace(/\s+/g, " ").trim();
  if (!isSafeSkillName(name)) {
    throw new SkillParseError("技能名无效：只能使用小写字母、数字和连字符，且不能包含路径分隔符");
  }
  if (!description) throw new SkillParseError("SKILL.md frontmatter 必须包含 description");
  if (description.length > 500) throw new SkillParseError("技能简介不能超过 500 个字符");
  if (!body.trim()) throw new SkillParseError("SKILL.md 正文不能为空");
  if (body.length > 100_000) throw new SkillParseError("SKILL.md 正文过长");
  return { name, description, body, source };
}

function parseSimpleFrontmatter(input: string) {
  const result: Record<string, string> = {};
  const lines = input.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!match) throw new SkillParseError("SKILL.md frontmatter 格式无效");
    const key = match[1];
    const rawValue = match[2];
    if (rawValue === "|" || rawValue === "|-" || rawValue === ">" || rawValue === ">-") {
      const block: string[] = [];
      while (index + 1 < lines.length && (/^ {2,}/.test(lines[index + 1]) || lines[index + 1] === "")) {
        index += 1;
        block.push(lines[index].replace(/^ {2}/, ""));
      }
      result[key] = unquote(block.join("\n").trim());
      continue;
    }
    result[key] = unquote(rawValue.trim());
  }
  return result;
}

function unquote(value: string) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function isSkillMetadata(metadata: unknown) {
  return Boolean(metadata && typeof metadata === "object" && (metadata as { skill?: unknown }).skill === true);
}

export function skillSummaryFromAsset(asset: {
  id: string;
  project_id: string;
  metadata?: unknown;
  created_at: string;
}): ProjectSkillRecord | null {
  const metadata = (asset.metadata || {}) as Record<string, unknown>;
  if (!isSkillMetadata(metadata)) return null;
  const name = typeof metadata.skillName === "string" ? metadata.skillName : "";
  const description = typeof metadata.description === "string" ? metadata.description : "";
  if (!isSafeSkillName(name) || !description) return null;
  return {
    id: asset.id,
    project_id: asset.project_id,
    name,
    description,
    created_at: asset.created_at,
    updated_at: asset.created_at,
  };
}

export function isSkillMarkdownFileName(fileName: string) {
  const base = fileName.replace(/\\/g, "/").split("/").pop() || "";
  return base.toLowerCase() === "skill.md";
}
