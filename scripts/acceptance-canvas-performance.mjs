import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = "http://127.0.0.1:3100";
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const uploadPath = path.join(root, "docs", "images", "canvas-done.png");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase 验收环境变量不完整");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const email = `codex-canvas-${Date.now()}@example.com`;
const password = `Aa1!${crypto.randomUUID()}`;
let userId;
let projectId;
let browser;
let server;
const networkFailures = [];

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/auth/login`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("生产服务器未在 30 秒内启动");
}

async function waitForCanvasImages(page) {
  try {
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll(".react-flow__node img")];
      return images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0);
    }, undefined, { timeout: 45_000 });
  } catch (caught) {
    const state = await page.evaluate(() => ({
      nodeCount: document.querySelectorAll(".react-flow__node").length,
      images: [...document.querySelectorAll(".react-flow__node img")].map((image) => ({
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        path: (() => { try { return new URL(image.currentSrc || image.src).pathname; } catch { return "invalid"; } })(),
      })),
      visibleError: document.body.innerText.includes("图片加载失败"),
    }));
    throw new Error(`等待画布图片超时：${JSON.stringify({ state, networkFailures })}`, { cause: caught });
  }
}

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error || new Error("创建验收用户失败");
  userId = created.data.user.id;

  server = spawn(process.execPath, [
    path.join(root, "node_modules", "next", "dist", "bin", "next"),
    "start",
    "-p",
    "3100",
  ], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let serverErrors = "";
  server.stderr.on("data", (chunk) => { serverErrors += String(chunk); });
  await waitForServer();

  browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes("preview.webp") || url.pathname.includes("/api/")) {
      networkFailures.push({ type: "requestfailed", path: url.pathname, error: request.failure()?.errorText });
    }
  });
  page.on("response", (response) => {
    if (response.ok()) return;
    const url = new URL(response.url());
    if (url.pathname.includes("preview.webp") || url.pathname.includes("/api/")) {
      networkFailures.push({ type: "response", path: url.pathname, status: response.status() });
    }
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");

  await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForURL("**/protected", { timeout: 20_000 }),
    page.getByRole("button", { name: "Login" }).click(),
  ]);

  const project = await page.evaluate(async () => {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Canvas preview acceptance" }),
    });
    return { ok: response.ok, body: await response.json() };
  });
  if (!project.ok || !project.body?.project?.id) throw new Error(project.body?.error || "创建验收项目失败");
  projectId = project.body.project.id;

  await page.goto(`${baseUrl}/canvas?projectId=${projectId}`, { waitUntil: "domcontentloaded" });
  const uploadResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/projects/${projectId}/assets`) && response.request().method() === "POST",
  );
  await page.locator('input[type="file"]').setInputFiles(uploadPath);
  const uploaded = await uploadResponse;
  if (!uploaded.ok()) throw new Error(`上传验收图片失败：HTTP ${uploaded.status()}`);
  await waitForCanvasImages(page);

  await page.goto(`${baseUrl}/projects`, { waitUntil: "domcontentloaded" });
  await cdp.send("Network.clearBrowserCache");
  let workspaceRequests = 0;
  let previewResponses = 0;
  let originalStorageResponses = 0;
  let previewBytes = 0;
  const onRequest = (request) => {
    if (request.url().includes(`/api/projects/${projectId}/workspace`)) workspaceRequests += 1;
  };
  const onResponse = (response) => {
    const url = response.url();
    if (url.includes(".preview.webp")) {
      previewResponses += 1;
      previewBytes += Number(response.headers()["content-length"] || 0);
    } else if (/\/storage\/v1\/object\/sign\/.*\.(?:png|jpe?g|webp)(?:\?|$)/i.test(url)) {
      originalStorageResponses += 1;
    }
  };
  page.on("request", onRequest);
  page.on("response", onResponse);

  const coldStarted = performance.now();
  await page.goto(`${baseUrl}/canvas?projectId=${projectId}`, { waitUntil: "domcontentloaded" });
  await waitForCanvasImages(page);
  const coldMs = Math.round(performance.now() - coldStarted);
  const imageSources = await page.locator(".react-flow__node img").evaluateAll((images) => images.map((image) => image.currentSrc || image.src));

  await page.goto(`${baseUrl}/projects`, { waitUntil: "domcontentloaded" });
  const warmStarted = performance.now();
  await page.goto(`${baseUrl}/canvas?projectId=${projectId}`, { waitUntil: "domcontentloaded" });
  await waitForCanvasImages(page);
  const warmMs = Math.round(performance.now() - warmStarted);

  if (workspaceRequests !== 0) throw new Error(`首次进入仍触发 ${workspaceRequests} 次 workspace 客户端请求`);
  if (!imageSources.length || imageSources.some((source) => !source.includes(".preview.webp"))) {
    throw new Error("画布没有统一使用 WebP 预览图");
  }
  if (previewResponses < 1) throw new Error("冷启动没有请求预览图");
  if (originalStorageResponses > 0) throw new Error("画布冷启动仍请求了原图");

  console.log(JSON.stringify({
    coldMs,
    warmMs,
    workspaceRequests,
    previewResponses,
    previewBytes,
    canvasImages: imageSources.length,
    usesPreviewWebp: true,
  }, null, 2));

  const cleanup = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    return response.ok;
  }, projectId);
  if (!cleanup) throw new Error("清理验收项目失败");
  projectId = undefined;

  if (serverErrors) process.stderr.write(serverErrors);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (projectId && userId) {
    const { data: assets } = await admin.from("assets").select("bucket,object_path,metadata").eq("project_id", projectId);
    for (const asset of assets || []) {
      const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
      const paths = [asset.object_path, metadata.previewObjectPath].filter(Boolean);
      await admin.storage.from(asset.bucket).remove(paths);
    }
  }
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  if (server && !server.killed) server.kill();
}
