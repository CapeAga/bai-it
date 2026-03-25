/**
 * 扩展加载冒烟测试
 *
 * 验证：
 * 1. 扩展能被 Chrome 加载
 * 2. Content Script 正常注入（styles + tooltip）
 * 3. Service Worker 正常启动
 */
import puppeteer from "puppeteer";
import path from "path";
import { getPuppeteerLaunchOptions } from "../../scripts/puppeteer-launch.mjs";

const extensionPath = path.resolve("dist");

let passed = 0;
let failed = 0;

function ok(msg) { passed++; console.log(`  ✓ ${msg}`); }
function fail(msg) { failed++; console.log(`  ✗ ${msg}`); }

try {
  console.log("启动 Chrome + 加载扩展...");

  const browser = await puppeteer.launch(
    getPuppeteerLaunchOptions({
      headless: false,
      extensionPath,
    }),
  );

  // 1. 检查 Service Worker 是否启动
  console.log("\n[Service Worker]");
  try {
    const swTarget = await browser.waitForTarget(
      t => t.type() === "service_worker" && t.url().includes("background.js"),
      { timeout: 5000 }
    );
    if (swTarget) {
      ok("Service Worker 启动成功");
    }
  } catch {
    fail("Service Worker 未启动（5 秒超时）");
  }

  // 2. 导航到英文页面，检查 Content Script
  console.log("\n[Content Script]");
  const page = await browser.newPage();
  await page.goto("https://example.com", { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2000)); // 等 content script 执行

  const hasStyles = await page.evaluate(() =>
    document.getElementById("enlearn-styles") !== null
  );
  hasStyles ? ok("CSS 样式已注入") : fail("CSS 样式未注入");

  const hasTooltip = await page.evaluate(() =>
    document.querySelector(".enlearn-tooltip") !== null
  );
  hasTooltip ? ok("Tooltip 元素已创建") : fail("Tooltip 元素未创建");

  const paragraphs = await page.evaluate(() =>
    document.querySelectorAll("p").length
  );
  console.log(`  (页面有 ${paragraphs} 个段落)`);

  const triggers = await page.evaluate(() =>
    document.querySelectorAll("[data-enlearn-trigger]").length
  );
  if (triggers > 0) {
    ok(`${triggers} 个段落添加了手动触发按钮`);
  } else {
    console.log("  - 无手动触发按钮（可能因为段落太短或非英文）");
  }

  // 3. 关闭
  await browser.close();

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
} catch (err) {
  console.error("测试出错:", err.message);
  process.exit(1);
}
