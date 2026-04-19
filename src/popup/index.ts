/**
 * Popup — 弹出窗口
 *
 * 职责：
 * 1. 大按钮：当前页面开关（显示原文 / 拆分显示）
 * 2. 站点级 toggle：控制整个域名是否启用
 * 3. 辅助力度滑杆（1-5），合并 chunkGranularity + sensitivity
 * 4. 显示方式分段选择器（详细/简洁/轻微）+ 实时预览
 */

import type { Message, BaitConfig } from "../shared/types.ts";

// ========== DOM 元素 ==========

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const siteName = $("site-name");
const siteDomain = $("site-domain");
const actionBtn = $<HTMLButtonElement>("action-btn");
const actionText = $("action-text");
const siteToggle = $<HTMLInputElement>("site-toggle");
const content = $("content");
const sliderContainer = $("assist-slider");
const sliderFill = $("slider-fill");
const sliderThumb = $("slider-thumb");
const assistHint = $("assist-hint");
const segControl = $("seg-control");
const segPill = $("seg-pill");
const modeDesc = $("mode-desc");
const preview = $("preview");
const linkOptions = $<HTMLAnchorElement>("link-options");

// ========== 常量 ==========

const ASSIST_HINTS: Record<number, string> = {
  1: "只掰最难的句子",
  2: "复杂句才掰",
  3: "复杂句自动掰，简单句不打扰",
  4: "大部分长句都会掰",
  5: "尽量都掰开",
};

/** 辅助力度 → 底层配置映射 */
const ASSIST_TO_CONFIG: Record<number, { chunkGranularity: "coarse" | "medium" | "fine"; scanThreshold: "short" | "medium" | "long"; sensitivity: number }> = {
  1: { chunkGranularity: "coarse", scanThreshold: "long", sensitivity: 5 },
  2: { chunkGranularity: "coarse", scanThreshold: "long", sensitivity: 4 },
  3: { chunkGranularity: "medium", scanThreshold: "medium", sensitivity: 3 },
  4: { chunkGranularity: "fine", scanThreshold: "short", sensitivity: 2 },
  5: { chunkGranularity: "fine", scanThreshold: "short", sensitivity: 1 },
};

/** 显示方式配置 */
const DISPLAY_MODES: Record<string, { desc: string; intensity: number; html: string }> = {
  structure: {
    desc: "掰成段，缩进显示主从关系",
    intensity: 5,
    html: `
      <span class="line line-main">She finished the project</span>
      <span class="line line-sub1">that no one thought was possible,</span>
      <span class="line line-sub2">before the deadline.</span>
    `,
  },
  lines: {
    desc: "只分行，不加额外标记",
    intensity: 3,
    html: `
      <span class="line">She finished the project</span>
      <span class="line">that no one thought was possible,</span>
      <span class="line">before the deadline.</span>
    `,
  },
  light: {
    desc: "不分行，次要部分变淡",
    intensity: 1,
    html: `<span class="line line-main">She finished the project</span><span class="dot"> · </span><span class="line line-sub">that no one thought was possible,</span><span class="dot"> · </span><span class="line line-sub">before the deadline.</span>`,
  },
};

// ========== 滑杆 ==========

const SLIDER_MIN = 1;
const SLIDER_MAX = 5;
let currentLevel = 3;

function updateSliderVisuals(level: number): void {
  const pct = ((level - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
  sliderFill.style.width = pct + "%";
  sliderThumb.style.left = pct + "%";
}

function getSliderLevelFromX(clientX: number): number {
  const rect = sliderContainer.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return Math.round(ratio * (SLIDER_MAX - SLIDER_MIN) + SLIDER_MIN);
}

// ========== 状态 ==========

let currentTab: chrome.tabs.Tab | null = null;
let currentHostname = "";
let isChunking = false; // 大按钮状态
let siteEnabled = true; // 站点级开关

// ========== 通信 ==========

function sendMessage(message: Message): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

// ========== 辅助力度：config → slider 值 ==========

function configToAssistLevel(config: BaitConfig): number {
  const s = config.sensitivity;
  if (s >= 5) return 1;
  if (s >= 4) return 2;
  if (s >= 3) return 3;
  if (s >= 2) return 4;
  return 5;
}

// ========== 显示方式：chunkIntensity → mode key ==========

function intensityToMode(intensity: number): string {
  if (intensity >= 4) return "structure";
  if (intensity >= 2) return "lines";
  return "light";
}

// ========== UI 更新 ==========

function updateActionButton(): void {
  if (isChunking) {
    actionBtn.className = "action-btn is-on";
    actionText.textContent = "显示原文";
  } else {
    actionBtn.className = "action-btn is-off";
    actionText.textContent = "掰it";
  }

  // 站点禁用时，大按钮灰掉不可点
  if (!siteEnabled) {
    actionBtn.style.opacity = "0.4";
    actionBtn.style.pointerEvents = "none";
  } else {
    actionBtn.style.opacity = "1";
    actionBtn.style.pointerEvents = "auto";
  }
}

function updateContentArea(): void {
  // 站点禁用或拆分关闭时，设置区域变淡
  content.classList.toggle("disabled", !siteEnabled || !isChunking);
}

function setDisplayMode(modeKey: string): void {
  const mode = DISPLAY_MODES[modeKey];
  if (!mode) return;

  // 更新分段按钮 + 定位 pill
  const btns = segControl.querySelectorAll(".seg-btn");
  let activeIndex = 0;
  btns.forEach((btn, i) => {
    const isActive = (btn as HTMLElement).dataset.mode === modeKey;
    btn.classList.toggle("active", isActive);
    if (isActive) activeIndex = i;
  });
  segPill.style.transform = `translateX(${activeIndex * 100}%)`;

  // 更新描述和预览
  modeDesc.textContent = mode.desc;
  preview.className = "display-preview mode-" + modeKey;
  preview.innerHTML = mode.html;
}

// ========== 初始化 ==========

async function init(): Promise<void> {
  // 获取当前 tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab ?? null;

  if (currentTab?.url) {
    try {
      currentHostname = new URL(currentTab.url).hostname;
    } catch {
      currentHostname = "";
    }
  }

  // 显示站点名
  siteName.textContent = currentHostname || "—";
  siteDomain.textContent = currentHostname || "—";

  // 获取当前状态
  if (currentTab?.id && currentHostname) {
    const result = (await sendMessage({
      type: "getTabState",
      tabId: currentTab.id,
      hostname: currentHostname,
    })) as { state: "active" | "inactive" };

    siteEnabled = true;
    isChunking = result.state === "active";
  }

  // 获取配置
  const config = (await sendMessage({ type: "getConfig" })) as BaitConfig;

  // 设置站点 toggle
  siteToggle.checked = siteEnabled;

  // 设置辅助力度滑杆
  const assistLevel = configToAssistLevel(config);
  currentLevel = assistLevel;
  updateSliderVisuals(currentLevel);
  assistHint.textContent = ASSIST_HINTS[assistLevel];

  // 设置显示方式
  const currentMode = intensityToMode(config.chunkIntensity);
  setDisplayMode(currentMode);

  // 更新 UI 状态
  updateActionButton();
  updateContentArea();

  // 初始设置完成后开启动画（避免加载时闪动）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sliderContainer.classList.remove("no-transition");
      segControl.classList.remove("no-transition");
    });
  });

  // ===== 事件绑定 =====

  // 大按钮：切换当前页面拆分
  actionBtn.addEventListener("click", async () => {
    if (!currentTab?.id) return;

    const result = (await sendMessage({
      type: "toggleTab",
      tabId: currentTab.id,
    })) as { active: boolean };

    isChunking = result.active;

    updateActionButton();
    updateContentArea();
  });

  // 站点级 toggle
  siteToggle.addEventListener("change", async () => {
    if (!currentHostname) return;

    const result = (await sendMessage({
      type: "toggleSite",
      hostname: currentHostname,
    })) as { enabled: boolean };

    siteEnabled = result.enabled;

    if (!siteEnabled) {
      isChunking = false;
    } else {
      // 站点重新启用时，恢复为活跃
      isChunking = true;
    }

    updateActionButton();
    updateContentArea();
  });

  // 辅助力度滑杆 — 点击 & 拖拽
  let isDragging = false;

  sliderContainer.addEventListener("pointerdown", (e) => {
    isDragging = true;
    sliderContainer.setPointerCapture(e.pointerId);
    const level = getSliderLevelFromX(e.clientX);
    if (level !== currentLevel) {
      currentLevel = level;
      updateSliderVisuals(currentLevel);
      assistHint.textContent = ASSIST_HINTS[currentLevel];
    }
  });

  sliderContainer.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const level = getSliderLevelFromX(e.clientX);
    if (level !== currentLevel) {
      currentLevel = level;
      updateSliderVisuals(currentLevel);
      assistHint.textContent = ASSIST_HINTS[currentLevel];
    }
  });

  sliderContainer.addEventListener("pointerup", async () => {
    if (!isDragging) return;
    isDragging = false;
    const mapping = ASSIST_TO_CONFIG[currentLevel];
    await sendMessage({ type: "updateConfig", config: mapping });
  });

  // 显示方式分段选择器
  segControl.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest(".seg-btn") as HTMLElement | null;
    if (!btn || btn.classList.contains("active")) return;

    const modeKey = btn.dataset.mode!;
    setDisplayMode(modeKey);

    const mode = DISPLAY_MODES[modeKey];
    await sendMessage({
      type: "updateConfig",
      config: { chunkIntensity: mode.intensity },
    });
  });

  // 更多设置 → Options 页
  linkOptions.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

init();
