/**
 * Popup 验收测试
 *
 * 验证：
 * 1. Popup 能正常打开渲染
 * 2. LLM 配置能保存和持久化
 * 3. 站点开关功能
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

  // 等 Service Worker 就绪，获取扩展 ID
  const swTarget = await browser.waitForTarget(
    t => t.type() === "service_worker" && t.url().includes("background.js"),
    { timeout: 10000 },
  );
  const extensionId = swTarget.url().split("/")[2];
  ok(`Service Worker 启动 (ID: ${extensionId})`);

  // 打开 Popup 页面（通过直接导航到 popup.html）
  console.log("\n[Popup 渲染]");
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: "domcontentloaded",
  });
  await new Promise(r => setTimeout(r, 1000));

  // 检查 1：关键元素存在
  const elements = await page.evaluate(() => ({
    logo: document.querySelector(".logo")?.textContent,
    statusBadge: document.getElementById("status-badge")?.textContent,
    modeBadge: document.getElementById("mode-badge")?.textContent,
    btnToggle: document.getElementById("btn-toggle") !== null,
    btnPause: document.getElementById("btn-pause") !== null,
    configToggle: document.getElementById("config-toggle") !== null,
    llmFormat: document.getElementById("llm-format") !== null,
    llmKey: document.getElementById("llm-key") !== null,
    btnSave: document.getElementById("btn-save") !== null,
  }));

  elements.logo === "掰it" ? ok("Logo 显示") : fail(`Logo 异常: ${elements.logo}`);
  elements.btnToggle ? ok("站点开关按钮存在") : fail("站点开关按钮缺失");
  elements.btnPause ? ok("暂停按钮存在") : fail("暂停按钮缺失");
  elements.configToggle ? ok("配置面板入口存在") : fail("配置面板入口缺失");

  // 检查 2：未配置 key 时自动展开配置面板
  const configVisible = await page.evaluate(() =>
    document.getElementById("config-form")?.classList.contains("visible"),
  );
  configVisible ? ok("未配置 Key 时自动展开配置面板") : fail("配置面板未自动展开");

  // 检查 3：LLM 配置保存
  console.log("\n[LLM 配置]");
  await page.select("#llm-format", "gemini");
  await page.type("#llm-key", "test-api-key-12345");
  await page.type("#llm-model", "gemini-2.0-flash");
  await page.click("#btn-save");
  await new Promise(r => setTimeout(r, 500));

  // 验证保存成功消息
  const saveMsgVisible = await page.evaluate(() =>
    document.getElementById("save-msg")?.classList.contains("show"),
  );
  saveMsgVisible ? ok("保存成功提示显示") : fail("保存成功提示未显示");

  // 检查 4：重新打开 Popup，配置仍在
  const page2 = await browser.newPage();
  await page2.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: "domcontentloaded",
  });
  await new Promise(r => setTimeout(r, 1000));

  const persistedConfig = await page2.evaluate(() => ({
    format: document.getElementById("llm-format")?.value,
    key: document.getElementById("llm-key")?.value,
    model: document.getElementById("llm-model")?.value,
  }));

  persistedConfig.key === "test-api-key-12345"
    ? ok("API Key 持久化成功")
    : fail(`API Key 未持久化: "${persistedConfig.key}"`);

  persistedConfig.format === "gemini"
    ? ok("API 格式持久化成功")
    : fail(`API 格式未持久化: "${persistedConfig.format}"`);

  // 检查 5：OpenAI 格式切换显示 Base URL
  console.log("\n[格式切换]");
  await page2.select("#llm-format", "openai-compatible");
  await new Promise(r => setTimeout(r, 200));

  const urlVisible = await page2.evaluate(() =>
    document.getElementById("url-group")?.classList.contains("visible"),
  );
  urlVisible ? ok("切换 OpenAI 格式后 Base URL 显示") : fail("Base URL 未显示");

  // 清理测试数据
  const swWorker = await swTarget.worker();
  if (swWorker) {
    await swWorker.evaluate(() =>
      chrome.storage.sync.set({ llm: { format: "gemini", apiKey: "", baseUrl: "", model: "gemini-2.0-flash" } }),
    );
  }

  await browser.close();

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
} catch (err) {
  console.error("测试出错:", err.message);
  process.exit(1);
}
