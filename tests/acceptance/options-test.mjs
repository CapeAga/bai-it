/**
 * Options 页面验收测试
 *
 * 覆盖 docs/testing.md 第 9 步验收标准：
 * 1. 共享导航 — 导航栏渲染 / Tab 切换 / Tab 高亮
 * 2. 总览 — 统计卡片 / 空状态 / CTA
 * 3. 每日回味 — 空状态 / 断句交互 / 看答案 / 周统计
 * 4. 难句集 — 空状态 / 筛选栏
 * 5. 设置 — Provider 切换 / 模型选择 / 显示偏好 / 危险操作 / 保存反馈
 * 6. 视觉还原 — 关键 token 样式断言 + 4 Tab 截图
 */
import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import { getPuppeteerLaunchOptions } from "../../scripts/puppeteer-launch.mjs";

const extensionPath = path.resolve("dist");
const screenshotDir = path.resolve("tests/screenshots");

let passed = 0;
let failed = 0;

function ok(msg) { passed++; console.log(`  ✓ ${msg}`); }
function fail(msg) { failed++; console.log(`  ✗ ${msg}`); }

// Ensure screenshots dir exists
fs.mkdirSync(screenshotDir, { recursive: true });

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

  // 等 Service Worker 就绪，获取扩展 ID
  const swTarget = await browser.waitForTarget(
    t => t.type() === "service_worker" && t.url().includes("background.js"),
    { timeout: 10000 },
  );
  const extensionId = swTarget.url().split("/")[2];
  ok(`Service Worker 启动 (ID: ${extensionId})`);

  // 打开 Options 页
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: "domcontentloaded",
  });
  // 等 React render + 字体加载
  await new Promise(r => setTimeout(r, 3000));

  // ──────────────────────────────────────────────
  // 1. 共享导航
  // ──────────────────────────────────────────────
  console.log("\n[共享导航]");

  // Helper: check element is visually visible (not just in DOM)
  async function isVisible(selector) {
    return page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { exists: false, visible: false };
      const s = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        exists: true,
        visible: s.opacity !== "0" && s.visibility !== "hidden" && s.display !== "none" && rect.height > 0,
        opacity: s.opacity,
        display: s.display,
        visibility: s.visibility,
        height: rect.height,
      };
    }, selector);
  }

  // 导航栏渲染 + 可见性
  const nav = await page.evaluate(() => {
    const logoZh = document.querySelector(".logo .zh")?.textContent;
    const logoEn = document.querySelector(".logo .en")?.textContent;
    const navItems = Array.from(document.querySelectorAll(".nav-item")).map(n => n.textContent);
    return { logoZh, logoEn, navItems };
  });

  nav.logoZh === "掰" && nav.logoEn === "it"
    ? ok("Logo「掰it」显示正确")
    : fail(`Logo 异常: ${nav.logoZh}${nav.logoEn}`);

  const navVisible = await isVisible(".nav-bar");
  navVisible.visible
    ? ok("NavBar 视觉可见 ✓")
    : fail(`NavBar 不可见! opacity=${navVisible.opacity} display=${navVisible.display} height=${navVisible.height}`);

  const logoVisible = await isVisible(".logo");
  logoVisible.visible
    ? ok("Logo 视觉可见 ✓")
    : fail(`Logo 不可见! opacity=${logoVisible.opacity}`);

  nav.navItems.length === 4 && nav.navItems.join(",") === "总览,每日回味,难句集,设置"
    ? ok("4 个 Tab 名称正确")
    : fail(`Tab 异常: ${nav.navItems}`);

  // Tab 高亮
  const dashboardActive = await page.evaluate(() =>
    document.querySelector(".nav-item.active")?.textContent
  );
  dashboardActive === "总览"
    ? ok("默认「总览」Tab 高亮")
    : fail(`默认高亮异常: ${dashboardActive}`);

  // Tab 高亮样式
  const activeStyle = await page.evaluate(() => {
    const el = document.querySelector(".nav-item.active");
    if (!el) return null;
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, color: s.color };
  });
  if (activeStyle) {
    // rgba(239,68,68,0.12) → 检查 color 包含 fca5a5 对应的 rgb
    const colorOk = activeStyle.color.includes("252") && activeStyle.color.includes("165");
    colorOk
      ? ok("活跃 Tab 颜色 #fca5a5 正确")
      : fail(`活跃 Tab 颜色异常: ${activeStyle.color}`);
  }

  // Tab 切换
  const tabNames = ["总览", "每日回味", "难句集", "设置"];
  const tabKeys = ["dashboard", "review", "sentences", "settings"];

  for (let i = 0; i < tabNames.length; i++) {
    await page.evaluate((name) => {
      const items = Array.from(document.querySelectorAll(".nav-item"));
      const target = items.find(el => el.textContent === name);
      if (target) target.click();
    }, tabNames[i]);
    await new Promise(r => setTimeout(r, 500));

    const hash = await page.evaluate(() => window.location.hash);
    hash === `#${tabKeys[i]}`
      ? ok(`切换到「${tabNames[i]}」→ hash 正确 (${hash})`)
      : fail(`「${tabNames[i]}」hash 异常: ${hash}`);
  }

  // ──────────────────────────────────────────────
  // 2. 总览 (Dashboard) — 空数据状态
  // ──────────────────────────────────────────────
  console.log("\n[总览 - Dashboard]");

  // 切回总览
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".nav-item"));
    items.find(el => el.textContent === "总览")?.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const dashResult = await page.evaluate(() => {
    const statNums = Array.from(document.querySelectorAll(".stat-num")).map(el => el.textContent);
    const statLabels = Array.from(document.querySelectorAll(".stat-label")).map(el => el.textContent);
    const ctaBtn = document.querySelector(".cta-btn");
    const emptyState = document.querySelector(".empty-state");
    return { statNums, statLabels, ctaBtnText: ctaBtn?.textContent, hasEmpty: emptyState !== null };
  });

  if (dashResult.statNums.length === 3) {
    ok(`统计卡片 3 列渲染 (${dashResult.statLabels.join("/")})`);
    // Verify stats row is visually visible (not stuck at opacity:0)
    const statsVisible = await isVisible(".stats-row");
    statsVisible.visible
      ? ok("统计卡片视觉可见 ✓")
      : fail(`统计卡片不可见! opacity=${statsVisible.opacity}`);
  } else if (dashResult.hasEmpty) {
    ok("空数据时显示空状态引导文案");
  } else {
    fail(`Dashboard 渲染异常: statNums=${dashResult.statNums.length}, hasEmpty=${dashResult.hasEmpty}`);
  }

  if (dashResult.ctaBtnText?.includes("每日回味")) {
    ok("CTA 按钮「每日回味 →」显示");
  }

  // CTA 点击跳转
  const ctaExists = await page.evaluate(() => document.querySelector(".cta-btn") !== null);
  if (ctaExists) {
    await page.click(".cta-btn");
    await new Promise(r => setTimeout(r, 500));
    const hashAfterCta = await page.evaluate(() => window.location.hash);
    hashAfterCta === "#review"
      ? ok("CTA 点击跳转到每日回味")
      : fail(`CTA 跳转异常: ${hashAfterCta}`);
  }

  // ──────────────────────────────────────────────
  // 3. 每日回味
  // ──────────────────────────────────────────────
  console.log("\n[每日回味 - DailyReview]");

  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".nav-item"));
    items.find(el => el.textContent === "每日回味")?.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const reviewResult = await page.evaluate(() => {
    const emptyState = document.querySelector(".empty-state");
    const weeklyStat = document.querySelector(".weekly-stat");
    const breakPoints = document.querySelectorAll(".break-point");
    const ctaBtn = document.querySelector(".cta-btn");
    const subLabels = Array.from(document.querySelectorAll(".sub-label")).map(el => el.textContent);
    return {
      hasEmpty: emptyState !== null,
      emptyText: emptyState?.textContent ?? "",
      weeklyStatText: weeklyStat?.textContent ?? "",
      breakPointCount: breakPoints.length,
      hasCta: ctaBtn !== null,
      subLabels,
    };
  });

  if (reviewResult.hasEmpty) {
    ok(`空数据显示引导文案: "${reviewResult.emptyText.slice(0, 20)}..."`);
  } else {
    // 有数据的情况
    reviewResult.weeklyStatText.includes("这周掰了")
      ? ok(`周统计显示: "${reviewResult.weeklyStatText}"`)
      : fail(`周统计异常: ${reviewResult.weeklyStatText}`);

    if (reviewResult.breakPointCount > 0) {
      ok(`断句练习：${reviewResult.breakPointCount} 个可断点位置`);

      // 断点点击交互
      const breakBefore = await page.evaluate(() =>
        document.querySelectorAll(".break-point.selected").length
      );
      await page.click(".break-point");
      await new Promise(r => setTimeout(r, 200));
      const breakAfter = await page.evaluate(() =>
        document.querySelectorAll(".break-point.selected").length
      );
      breakAfter > breakBefore
        ? ok("点击断点 → 断点被选中")
        : fail("断点点击未生效");

      // 再点一次取消
      await page.click(".break-point.selected");
      await new Promise(r => setTimeout(r, 200));
      const breakDeselected = await page.evaluate(() =>
        document.querySelectorAll(".break-point.selected").length
      );
      breakDeselected < breakAfter
        ? ok("再次点击 → 断点取消")
        : fail("断点取消未生效");
    }

    // 看答案按钮
    const answerBtnExists = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".cta-btn"));
      return btns.some(b => b.textContent?.includes("看答案"));
    });
    if (answerBtnExists) {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll(".cta-btn"));
        const btn = btns.find(b => b.textContent?.includes("看答案"));
        btn?.click();
      });
      await new Promise(r => setTimeout(r, 500));
      const answerVisible = await page.evaluate(() =>
        document.querySelector(".answer-section") !== null
      );
      answerVisible
        ? ok("点击「看答案」→ AI 分块答案显示")
        : fail("答案区域未显示");
    }
  }

  // ──────────────────────────────────────────────
  // 4. 难句集
  // ──────────────────────────────────────────────
  console.log("\n[难句集 - Sentences]");

  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".nav-item"));
    items.find(el => el.textContent === "难句集")?.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const sentResult = await page.evaluate(() => {
    const emptyState = document.querySelector(".empty-state");
    const filterChips = Array.from(document.querySelectorAll(".filter-chip")).map(el => el.textContent);
    const sentItems = document.querySelectorAll(".sent-item");
    return {
      hasEmpty: emptyState !== null,
      emptyText: emptyState?.textContent ?? "",
      filterChips,
      sentItemCount: sentItems.length,
    };
  });

  if (sentResult.hasEmpty) {
    ok(`空数据显示引导文案: "${sentResult.emptyText.slice(0, 20)}..."`);
  } else {
    sentResult.filterChips.length > 0
      ? ok(`筛选栏渲染 ${sentResult.filterChips.length} 个 chip (${sentResult.filterChips.join(",")})`)
      : fail("筛选栏未渲染");

    sentResult.sentItemCount > 0
      ? ok(`${sentResult.sentItemCount} 张收起态卡片`)
      : fail("无卡片渲染");

    // 点击展开
    if (sentResult.sentItemCount > 0) {
      await page.click(".sent-item");
      await new Promise(r => setTimeout(r, 300));
      const expanded = await page.evaluate(() =>
        document.querySelector(".sent-expanded") !== null
      );
      expanded
        ? ok("点击卡片 → 展开态显示")
        : fail("卡片展开失败");

      if (expanded) {
        const layers = await page.evaluate(() => {
          const labels = Array.from(document.querySelectorAll(".sent-section-label")).map(el => el.textContent);
          return labels;
        });
        ok(`展开态内容层: ${layers.join(" / ") || "(无 section-label)"}`);
      }
    }
  }

  // ──────────────────────────────────────────────
  // 5. 设置
  // ──────────────────────────────────────────────
  console.log("\n[设置 - Settings]");

  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".nav-item"));
    items.find(el => el.textContent === "设置")?.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Provider 按钮渲染
  const settingsResult = await page.evaluate(() => {
    const providerBtns = Array.from(document.querySelectorAll(".settings-provider-btn")).map(el => ({
      text: el.textContent,
      active: el.classList.contains("active"),
    }));
    const keyInput = document.querySelector(".settings-input");
    const modelSelect = document.querySelector(".settings-select");
    const sectionTitles = Array.from(document.querySelectorAll(".settings-section-title")).map(el => el.textContent);
    const dangerBtns = Array.from(document.querySelectorAll(".settings-danger-btn")).map(el => el.textContent);
    const saveBtn = document.querySelector(".settings-save-btn");
    return {
      providerBtns,
      hasKeyInput: keyInput !== null,
      hasModelSelect: modelSelect !== null,
      sectionTitles,
      dangerBtns,
      saveBtnText: saveBtn?.textContent,
    };
  });

  settingsResult.providerBtns.length === 5
    ? ok(`5 个 Provider 按钮: ${settingsResult.providerBtns.map(b => b.text).join("/")}`)
    : fail(`Provider 按钮数异常: ${settingsResult.providerBtns.length}`);

  settingsResult.hasKeyInput
    ? ok("API Key 输入框存在")
    : fail("API Key 输入框缺失");

  settingsResult.hasModelSelect
    ? ok("模型下拉框存在")
    : fail("模型下拉框缺失");

  // 3 个 section
  settingsResult.sectionTitles.includes("API Key") && settingsResult.sectionTitles.includes("显示") && settingsResult.sectionTitles.includes("数据")
    ? ok(`3 个设置分区: ${settingsResult.sectionTitles.join("/")}`)
    : fail(`设置分区异常: ${settingsResult.sectionTitles}`);

  // 危险操作按钮
  settingsResult.dangerBtns.length === 2
    ? ok(`危险操作: ${settingsResult.dangerBtns.join(" / ")}`)
    : fail(`危险操作按钮异常: ${settingsResult.dangerBtns}`);

  // Provider 切换
  const providerSwitchResult = await page.evaluate(() => {
    // 点击 DeepSeek
    const btns = Array.from(document.querySelectorAll(".settings-provider-btn"));
    const dsBtn = btns.find(b => b.textContent === "DeepSeek");
    dsBtn?.click();
    return { clicked: dsBtn !== null };
  });
  await new Promise(r => setTimeout(r, 300));

  if (providerSwitchResult.clicked) {
    const afterSwitch = await page.evaluate(() => {
      const activeBtn = document.querySelector(".settings-provider-btn.active")?.textContent;
      // 第一个 .settings-select 是模型选择，第二个是母语
      const selects = document.querySelectorAll(".settings-select");
      const modelSelect = selects[0];
      const modelOptions = modelSelect
        ? Array.from(modelSelect.querySelectorAll("option")).map(el => el.textContent)
        : [];
      return { activeBtn, modelOptions };
    });
    afterSwitch.activeBtn === "DeepSeek"
      ? ok("切换到 DeepSeek → 按钮高亮正确")
      : fail(`Provider 切换后高亮异常: ${afterSwitch.activeBtn}`);

    afterSwitch.modelOptions.some(m => m?.includes("deepseek"))
      ? ok(`DeepSeek 模型列表显示: ${afterSwitch.modelOptions.join(",")}`)
      : fail(`模型列表异常: ${afterSwitch.modelOptions}`);
  }

  // 保存按钮反馈
  settingsResult.saveBtnText === "保存"
    ? ok("保存按钮显示")
    : fail(`保存按钮异常: ${settingsResult.saveBtnText}`);

  await page.click(".settings-save-btn");
  await new Promise(r => setTimeout(r, 300));
  const savedMsg = await page.evaluate(() =>
    document.querySelector(".settings-saved-msg")?.textContent
  );
  savedMsg?.includes("已保存")
    ? ok("点保存 → 显示「✓ 已保存」反馈")
    : fail(`保存反馈异常: ${savedMsg}`);

  // SegmentedControl 验证
  const segResult = await page.evaluate(() => {
    const segs = document.querySelectorAll(".seg-control");
    return { count: segs.length };
  });
  segResult.count === 2
    ? ok("2 个分段选择器（掰句力度 + 显示方式）")
    : fail(`分段选择器数量异常: ${segResult.count}`);

  // ──────────────────────────────────────────────
  // 6. 视觉还原 — 关键 token 样式断言
  // ──────────────────────────────────────────────
  console.log("\n[视觉还原 - 样式断言]");

  // 切回总览做样式检查
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".nav-item"));
    items.find(el => el.textContent === "总览")?.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // 6a. 页面底色
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // #09090b → rgb(9, 9, 11)
  bodyBg.includes("9") && bodyBg.includes("11")
    ? ok(`页面底色: ${bodyBg}`)
    : fail(`页面底色异常: ${bodyBg} (期望 rgb(9, 9, 11))`);

  // 6b. 字体族
  const fonts = await page.evaluate(() => {
    const body = getComputedStyle(document.body).fontFamily;
    // Check stat-num for Syne
    const statNum = document.querySelector(".stat-num");
    const statFont = statNum ? getComputedStyle(statNum).fontFamily : "";
    // Check logo for ZCOOL
    const logoZh = document.querySelector(".logo .zh");
    const zhFont = logoZh ? getComputedStyle(logoZh).fontFamily : "";
    const logoEn = document.querySelector(".logo .en");
    const enFont = logoEn ? getComputedStyle(logoEn).fontFamily : "";
    return { body, statFont, zhFont, enFont };
  });

  fonts.body.includes("Space Grotesk")
    ? ok(`正文字体: Space Grotesk ✓`)
    : fail(`正文字体异常: ${fonts.body}`);

  fonts.statFont.includes("Syne")
    ? ok(`统计数字字体: Syne ✓`)
    : fail(`统计数字字体异常: ${fonts.statFont}`);

  fonts.zhFont.includes("ZCOOL")
    ? ok(`Logo「掰」字体: ZCOOL KuaiLe ✓`)
    : fail(`Logo「掰」字体异常: ${fonts.zhFont}`);

  fonts.enFont.includes("Nunito")
    ? ok(`Logo「it」字体: Nunito ✓`)
    : fail(`Logo「it」字体异常: ${fonts.enFont}`);

  // 6c. CTA 按钮红色
  const ctaStyle = await page.evaluate(() => {
    const btn = document.querySelector(".cta-btn");
    if (!btn) return null;
    return getComputedStyle(btn).backgroundColor;
  });
  if (ctaStyle) {
    // #ef4444 → rgb(239, 68, 68)
    ctaStyle.includes("239") && ctaStyle.includes("68")
      ? ok(`CTA 按钮背景: ${ctaStyle} (#ef4444) ✓`)
      : fail(`CTA 按钮颜色异常: ${ctaStyle}`);
  }

  // 6d. 统计数字 42px Syne 800
  const statStyle = await page.evaluate(() => {
    const el = document.querySelector(".stat-num");
    if (!el) return null;
    const s = getComputedStyle(el);
    return { fontSize: s.fontSize, fontWeight: s.fontWeight };
  });
  if (statStyle) {
    statStyle.fontSize === "42px"
      ? ok(`统计数字 font-size: 42px ✓`)
      : fail(`统计数字 font-size 异常: ${statStyle.fontSize}`);

    statStyle.fontWeight === "800"
      ? ok(`统计数字 font-weight: 800 ✓`)
      : fail(`统计数字 font-weight 异常: ${statStyle.fontWeight}`);
  }

  // ──────────────────────────────────────────────
  // 7. 4 Tab 截图
  // ──────────────────────────────────────────────
  console.log("\n[截图]");

  for (let i = 0; i < tabNames.length; i++) {
    await page.evaluate((name) => {
      const items = Array.from(document.querySelectorAll(".nav-item"));
      items.find(el => el.textContent === name)?.click();
    }, tabNames[i]);
    await new Promise(r => setTimeout(r, 1000));

    const filename = `options-${tabKeys[i]}.png`;
    await page.screenshot({
      path: path.join(screenshotDir, filename),
      fullPage: true,
    });
    ok(`${tabNames[i]} → ${filename}`);
  }

  // ──────────────────────────────────────────────
  // 完成
  // ──────────────────────────────────────────────
  await browser.close();

  console.log(`\n════════════════════════════════════`);
  console.log(`结果: ${passed} 通过, ${failed} 失败`);
  console.log(`截图: tests/screenshots/options-*.png`);
  console.log(`════════════════════════════════════`);

  if (failed > 0) {
    console.log("\n[需要关注的失败项]");
    console.log("  注意：字体断言可能因 Google Fonts 加载延迟而失败");
    console.log("  空数据时 Dashboard/Review/Sentences 显示空状态是预期行为");
  }

  console.log("\n[人工确认项]");
  console.log("  1. 对比 tests/screenshots/ 截图与 playground-pages.html 原型");
  console.log("  2. 动效体感：入场动画、Tab 切换、hover 效果流畅自然");
  console.log("  3. 每日回味一屏完事，不需要翻页，10 秒能看完");

  process.exit(failed > 0 ? 1 : 0);
} catch (err) {
  console.error("测试出错:", err.message);
  process.exit(1);
}
