/**
 * 引导态截图脚本
 * 对三种状态 × 四个 Tab 截图，供人工对比 playground-onboarding.html
 */
import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import { getPuppeteerLaunchOptions } from "../../scripts/puppeteer-launch.mjs";

const extensionPath = path.resolve("dist");
const screenshotDir = path.resolve("tests/screenshots/onboarding");
fs.mkdirSync(screenshotDir, { recursive: true });

const STATES = ["no-key", "has-key-no-data", "has-data"];
const TABS = ["dashboard", "review", "sentences", "settings"];
const TAB_LABELS = { dashboard: "总览", review: "每日回味", sentences: "难句集", settings: "设置" };

try {
  console.log("启动 Chrome + 加载扩展...\n");

  const browser = await puppeteer.launch(
    getPuppeteerLaunchOptions({
      headless: false,
      extensionPath,
      defaultViewport: { width: 1280, height: 900 },
      extraArgs: ["--window-size=1280,900"],
    }),
  );

  const swTarget = await browser.waitForTarget(
    t => t.type() === "service_worker" && t.url().includes("background.js"),
    { timeout: 10000 },
  );
  const extensionId = swTarget.url().split("/")[2];
  console.log(`扩展 ID: ${extensionId}\n`);

  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: "domcontentloaded",
  });
  await new Promise(r => setTimeout(r, 3000));

  for (const state of STATES) {
    console.log(`\n━━━ 状态: ${state} ━━━`);

    // 切换状态
    await page.evaluate((s) => {
      window.__forceOnboarding(s);
    }, state);
    await new Promise(r => setTimeout(r, 800));

    for (const tab of TABS) {
      // 点击 Tab
      await page.evaluate((tabName) => {
        const labels = { dashboard: "总览", review: "每日回味", sentences: "难句集", settings: "设置" };
        const buttons = document.querySelectorAll(".nav-item");
        for (const btn of buttons) {
          if (btn.textContent.trim() === labels[tabName]) {
            btn.click();
            break;
          }
        }
      }, tab);
      await new Promise(r => setTimeout(r, 1200));

      const filename = `${state}_${tab}.png`;
      await page.screenshot({
        path: path.join(screenshotDir, filename),
        fullPage: true,
      });
      console.log(`  ✓ ${filename}`);
    }
  }

  // 恢复真实状态
  await page.evaluate(() => window.__forceOnboarding(null));

  console.log(`\n截图保存在: ${screenshotDir}/`);
  console.log("共 " + (STATES.length * TABS.length) + " 张截图\n");

  await browser.close();
} catch (err) {
  console.error("截图失败:", err);
  process.exit(1);
}
