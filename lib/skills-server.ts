import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  builtinSkillId,
  builtinSkillName,
  isBuiltinSkillId,
  isSafeSkillName,
  parseSkillMarkdown,
  type ParsedSkillFile,
  type ProjectSkillRecord,
} from "@/lib/skills";

export interface BuiltinSkill extends ParsedSkillFile {
  id: string;
}

const BUILTIN_SKILL_ROOT = path.join(process.cwd(), "docs", "skills");

let cached: Promise<BuiltinSkill[]> | null = null;

export function loadBuiltinSkills() {
  if (!cached) cached = readBuiltinSkills();
  return cached;
}

async function readBuiltinSkills(): Promise<BuiltinSkill[]> {
  let entries;
  try {
    entries = await readdir(BUILTIN_SKILL_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills: BuiltinSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeSkillName(entry.name)) continue;
    let source: string;
    try {
      source = await readFile(path.join(BUILTIN_SKILL_ROOT, entry.name, "SKILL.md"), "utf8");
    } catch {
      continue;
    }
    try {
      const parsed = parseSkillMarkdown(source);
      if (parsed.name !== entry.name) continue;
      skills.push({ ...parsed, id: builtinSkillId(parsed.name) });
    } catch {
      continue;
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export async function findBuiltinSkill(id: string) {
  if (!isBuiltinSkillId(id)) return null;
  const name = builtinSkillName(id);
  if (!isSafeSkillName(name)) return null;
  const skills = await loadBuiltinSkills();
  return skills.find((skill) => skill.name === name) || null;
}

/**
 * 项目自己上传的同名技能会覆盖内置技能，内置技能排在列表末尾。
 */
export async function withBuiltinSkills(projectId: string, projectSkills: ProjectSkillRecord[]) {
  const builtins = await loadBuiltinSkills();
  const taken = new Set(projectSkills.map((skill) => skill.name));
  const extra = builtins
    .filter((skill) => !taken.has(skill.name))
    .map<ProjectSkillRecord>((skill) => ({
      id: skill.id,
      project_id: projectId,
      name: skill.name,
      description: skill.description,
      created_at: "",
      updated_at: "",
      builtin: true,
    }));
  return [...projectSkills, ...extra];
}
