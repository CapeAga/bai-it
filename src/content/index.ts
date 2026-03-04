/**
 * Content Script — 页面注入
 *
 * 职责：
 * 1. 统一扫读：所有英文网页自动本地拆分 + 标注生词
 * 2. 手动掰句：未拆开的句子挂触发按钮（无 API → 本地强制拆，有 API → LLM）
 * 3. 分块结果注入 DOM
 * 4. MutationObserver 监听动态内容
 */

import { isEnglish } from "../shared/rule-engine.ts";
import { scanSplit, toChunkedString } from "../shared/scan-rules.ts";
import {
  loadFrequencyList, loadDictionary, loadIndustryPack,
  annotateWords, toNewWordsFormat, isLoaded,
} from "../shared/vocab.ts";
import type { BaitConfig, ChunkResult, BackgroundMessage } from "../shared/types.ts";
import { DEFAULT_CONFIG } from "../shared/types.ts";
import { createChunkedElement } from "./renderer.ts";
import { ENLEARN_STYLES } from "./styles.ts";
import { initVocabPanel, addWords, setScanningStatus, destroyVocabPanel } from "./vocab-panel.ts";

// ========== 词汇数据（构建时打包）==========

import wordFrequency from "../../data/word-frequency.json";
import dictEntries from "../../data/dict-ecdict.json";
import industryAi from "../../data/industry-ai.json";

// ========== 状态 ==========

let config: BaitConfig = { ...DEFAULT_CONFIG };
let isActive = false;
let isPaused = false;
let processedElements = new WeakSet<Element>();
const pendingElements = new Map<Element, string>();
let intersectionObserver: IntersectionObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let processTimer: ReturnType<typeof setTimeout> | null = null;
const processQueue: Element[] = [];
const knownWords = new Set<string>(); // 用户已掌握的词（从 storage 加载）

// ========== 全局 Tooltip ==========

let tooltipEl: HTMLElement | null = null;

let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;
let currentTooltipWord: string | null = null;

function setupTooltip(): void {
  if (tooltipEl) return;
  tooltipEl = document.createElement("div");
  tooltipEl.className = "enlearn-tooltip";
  document.body.appendChild(tooltipEl);

  // Keep tooltip visible when hovering the tooltip itself
  tooltipEl.addEventListener("mouseenter", () => {
    if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
  });
  tooltipEl.addEventListener("mouseleave", () => {
    scheduleHideTooltip();
  });
  tooltipEl.addEventListener("click", onTooltipClick);

  document.addEventListener("mouseover", onWordHover);
  document.addEventListener("mouseout", onWordLeave);
  document.addEventListener("mouseover", onTriggerParentHover);
  document.addEventListener("mouseout", onTriggerParentLeave);
}

function scheduleHideTooltip(): void {
  if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
  tooltipHideTimer = setTimeout(() => {
    if (tooltipEl) tooltipEl.style.display = "none";
    currentTooltipWord = null;
    tooltipHideTimer = null;
  }, 150);
}

async function onTooltipClick(e: MouseEvent): Promise<void> {
  const btn = (e.target as Element).closest?.(".enlearn-tooltip-btn");
  if (!btn || !currentTooltipWord) return;

  const word = currentTooltipWord;
  knownWords.add(word);

  // Save to storage
  try {
    await chrome.storage.local.set({ knownWords: [...knownWords] });
  } catch { /* silent */ }

  // Remove all annotations for this word on current page
  document.querySelectorAll(`.enlearn-word`).forEach(el => {
    if ((el as HTMLElement).dataset.word?.toLowerCase() === word) {
      const text = document.createTextNode(el.textContent || "");
      el.parentNode?.replaceChild(text, el);
    }
  });

  // Hide tooltip
  if (tooltipEl) tooltipEl.style.display = "none";
  currentTooltipWord = null;
}

function onWordHover(e: MouseEvent): void {
  const wordEl = (e.target as Element).closest?.(".enlearn-word") as HTMLElement | null;
  if (!wordEl || !tooltipEl) return;

  const def = wordEl.getAttribute("data-def");
  if (!def) return;

  // Cancel any pending hide
  if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }

  currentTooltipWord = (wordEl.dataset.word || wordEl.textContent || "").toLowerCase();
  tooltipEl.innerHTML = `<span class="enlearn-tooltip-def">${escapeHtml(def)}</span><button class="enlearn-tooltip-btn" title="标记为已掌握">✓</button>`;
  tooltipEl.style.display = "flex";

  const wordRect = wordEl.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();

  let left = wordRect.left + wordRect.width / 2 - tipRect.width / 2;
  let top = wordRect.top - tipRect.height - 6;

  if (left < 4) left = 4;
  if (left + tipRect.width > window.innerWidth - 4) {
    left = window.innerWidth - 4 - tipRect.width;
  }
  if (top < 4) {
    top = wordRect.bottom + 6;
  }

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function onWordLeave(e: MouseEvent): void {
  const word = (e.target as Element).closest?.(".enlearn-word");
  if (!word || !tooltipEl) return;
  scheduleHideTooltip();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function onTriggerParentHover(e: MouseEvent): void {
  const el = e.target as Element;
  const wrap = el.closest?.(".enlearn-trigger-wrap, [data-enlearn-trigger]");
  if (!wrap) return;
  const trigger = wrap.querySelector(".enlearn-trigger");
  if (trigger) trigger.classList.add("enlearn-trigger-visible");
}

function onTriggerParentLeave(e: MouseEvent): void {
  const el = e.target as Element;
  const wrap = el.closest?.(".enlearn-trigger-wrap, [data-enlearn-trigger]");
  if (!wrap) return;
  const related = e.relatedTarget as Element | null;
  if (related && wrap.contains(related)) return;
  const trigger = wrap.querySelector(".enlearn-trigger");
  if (trigger) trigger.classList.remove("enlearn-trigger-visible");
}

// ========== 初始化 ==========

async function init(): Promise<void> {
  const style = document.createElement("style");
  style.textContent = ENLEARN_STYLES;
  style.id = "enlearn-styles";
  document.head.appendChild(style);

  setupTooltip();

  // 加载词汇数据
  loadFrequencyList(wordFrequency as string[]);
  loadDictionary(dictEntries as Record<string, string>);
  loadIndustryPack("ai", industryAi as Record<string, string>);

  // 加载用户已掌握的词
  try {
    const stored = await chrome.storage.local.get({ knownWords: [] });
    if (Array.isArray(stored.knownWords)) {
      for (const w of stored.knownWords) knownWords.add(w as string);
    }
  } catch {
    // 静默失败
  }

  config = await sendMessage({ type: "getConfig" }) as BaitConfig;

  const response = await sendMessage({ type: "checkActive" }) as { active: boolean };
  if (response.active) {
    activate();
  }

  chrome.runtime.onMessage.addListener((message: BackgroundMessage) => {
    if (message.type === "activate") activate();
    else if (message.type === "deactivate") deactivate();
    else if (message.type === "pause") pauseProcessing();
    else if (message.type === "resume") resumeProcessing();
  });
}

// ========== 激活 ==========

function activate(): void {
  if (isActive) return;
  isActive = true;

  initVocabPanel();
  setScanningStatus(true);

  setupIntersectionObserver();
  scanPage();
  setupMutationObserver();

  chrome.storage.onChanged.addListener(onStorageChanged);
}

// ========== 停用 ==========

function deactivate(): void {
  if (!isActive) return;
  isActive = false;

  destroyVocabPanel();

  intersectionObserver?.disconnect();
  intersectionObserver = null;
  mutationObserver?.disconnect();
  mutationObserver = null;

  processQueue.length = 0;
  if (processTimer) {
    clearTimeout(processTimer);
    processTimer = null;
  }
  pendingElements.clear();

  // 1. 恢复 in-place 替换的元素（策略 B）
  restoreReplacedElements();

  // 2. 移除兄弟模式的 chunked 元素（策略 A）
  const chunkedEls = document.querySelectorAll(".enlearn-chunked");
  for (const el of chunkedEls) el.remove();

  // 3. 恢复被隐藏的原文（策略 A）
  const hiddenEls = document.querySelectorAll(".enlearn-original-hidden");
  for (const el of hiddenEls) el.classList.remove("enlearn-original-hidden");

  // 4. 移除手动触发按钮
  const triggerWraps = document.querySelectorAll(".enlearn-trigger-wrap, [data-enlearn-trigger]");
  for (const wrap of triggerWraps) {
    const trigger = wrap.querySelector(".enlearn-trigger");
    if (trigger) trigger.remove();
    wrap.classList.remove("enlearn-trigger-wrap");
    wrap.removeAttribute("data-enlearn-trigger");
  }

  processedElements = new WeakSet<Element>();
  chrome.storage.onChanged.removeListener(onStorageChanged);
}

// ========== 暂停 / 恢复 ==========

function pauseProcessing(): void {
  if (!isActive || isPaused) return;
  isPaused = true;
  setScanningStatus(false);

  mutationObserver?.disconnect();
  intersectionObserver?.disconnect();
  processQueue.length = 0;
  if (processTimer) {
    clearTimeout(processTimer);
    processTimer = null;
  }

  document.body.classList.add("enlearn-paused");
  document.querySelectorAll(".enlearn-original-hidden").forEach(el => {
    el.classList.remove("enlearn-original-hidden");
    el.classList.add("enlearn-was-hidden");
  });
}

function resumeProcessing(): void {
  if (!isActive || !isPaused) return;
  isPaused = false;
  setScanningStatus(true);

  document.body.classList.remove("enlearn-paused");

  // 恢复时用新配置重新处理（而非显示旧结果）
  reprocessPage();

  setupIntersectionObserver();
  setupMutationObserver();
}

/**
 * 清除所有已渲染的分块，重置处理状态，用当前配置重新扫描页面
 */
function reprocessPage(): void {
  // 恢复 in-place 替换的元素（策略 B）
  restoreReplacedElements();

  // 移除兄弟模式的分块元素（策略 A）
  document.querySelectorAll(".enlearn-chunked").forEach(el => el.remove());

  // 恢复被隐藏的原文
  document.querySelectorAll(".enlearn-original-hidden, .enlearn-was-hidden").forEach(el => {
    el.classList.remove("enlearn-original-hidden");
    el.classList.remove("enlearn-was-hidden");
  });

  // 移除手动触发按钮
  document.querySelectorAll(".enlearn-trigger").forEach(t => t.remove());
  document.querySelectorAll("[data-enlearn-trigger]").forEach(w => {
    w.classList.remove("enlearn-trigger-wrap");
    w.removeAttribute("data-enlearn-trigger");
  });

  // 重置处理集合
  processedElements = new WeakSet<Element>();
  pendingElements.clear();
  processQueue.length = 0;
  if (processTimer) {
    clearTimeout(processTimer);
    processTimer = null;
  }

  // 重新扫描
  scanPage();
}

function onStorageChanged(changes: { [key: string]: chrome.storage.StorageChange }): void {
  let needReprocess = false;

  if (changes.chunkIntensity) {
    config.chunkIntensity = changes.chunkIntensity.newValue as number;
    needReprocess = true;
  }
  if (changes.chunkGranularity) {
    config.chunkGranularity = changes.chunkGranularity.newValue as typeof config.chunkGranularity;
    needReprocess = true;
  }
  if (changes.scanThreshold) {
    config.scanThreshold = changes.scanThreshold.newValue as typeof config.scanThreshold;
    needReprocess = true;
  }

  // 配置变更后用新配置重新处理页面
  if (needReprocess && isActive && !isPaused) {
    reprocessPage();
  }
}

// ========== 文本提取工具 ==========

/**
 * 从元素中提取段落列表，保留 <br> 产生的换行
 */
function extractParagraphs(el: Element): string[] {
  const text = (el as HTMLElement).innerText || el.textContent || "";
  return text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
}

/**
 * 将段落拆成句子（在 ". " + 大写字母处断开）
 */
function splitIntoSentences(paragraph: string): string[] {
  // 在句末标点 + 空格 + 大写字母/引号处拆分
  const parts = paragraph.split(/(?<=[.!?])\s+(?=[A-Z\u201C"'])/);
  return parts.filter(s => s.trim().length > 0);
}

/**
 * 从原始元素复制关键字体样式到分块元素
 */
function copyFontStyles(source: Element, target: HTMLElement): void {
  const computed = window.getComputedStyle(source);
  target.style.fontSize = computed.fontSize;
  target.style.fontFamily = computed.fontFamily;
  target.style.lineHeight = computed.lineHeight;
  target.style.color = computed.color;
  target.style.letterSpacing = computed.letterSpacing;
  target.style.wordSpacing = computed.wordSpacing;
}

/**
 * 将 chunked 元素插入 DOM，替换原文显示。
 *
 * 两种策略：
 * A. 信息流（Twitter/Reddit）：overflow:hidden 截断预览 → 在截断容器外层插入兄弟元素
 * B. 文章站（Substack/Medium）：无截断 → 直接替换原始元素内部内容（避免被 React 清掉）
 */
function insertChunkedElement(
  originalEl: Element,
  chunkedEl: HTMLElement,
): void {
  // 从原始元素向上走，找截断容器
  let hideTarget: Element = originalEl;
  let current = originalEl.parentElement;

  for (let i = 0; i < 6 && current; i++) {
    // 绝不跨过链接或文章边界，否则会破坏点击导航（如 Twitter 引用推文）
    const tag = current.tagName;
    if (tag === "A" || tag === "ARTICLE") break;

    const cls = current.className || "";
    const cs = window.getComputedStyle(current);
    const isClipping =
      cls.includes("line-clamp") ||
      cls.includes("overflow-hidden") ||
      cls.includes("text-ellipsis") ||
      cs.overflow === "hidden" ||
      (cs.webkitLineClamp && cs.webkitLineClamp !== "none");

    if (isClipping) {
      hideTarget = current;
      current = current.parentElement;
    } else {
      break;
    }
  }

  if (hideTarget !== originalEl) {
    // 策略 A：有截断容器（Twitter/Reddit）→ 隐藏容器，插入兄弟
    hideTarget.classList.add("enlearn-original-hidden");
    hideTarget.parentNode?.insertBefore(chunkedEl, hideTarget.nextSibling);

    // 转发点击到被隐藏的原始元素（它保留了 React Fiber 节点）
    // React 事件委托能识别该元素，正常触发推文导航等 onClick handler
    chunkedEl.addEventListener("click", (e) => {
      const target = e.target as Element;
      if (target.closest?.(".enlearn-trigger, .enlearn-word, a")) return;

      hideTarget.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: e.clientX,
        clientY: e.clientY,
      }));
    });
  } else {
    // 策略 B：无截断（文章站）→ 保留原始元素，替换内部内容
    // 拦截冒泡，防止 Substack 等 React 站点因 click 重渲染导致内容消失
    chunkedEl.addEventListener("click", (e) => {
      if ((e.target as Element).closest?.(".enlearn-trigger")) return;
      e.stopPropagation();
    });
    const fragment = document.createDocumentFragment();
    while (originalEl.firstChild) fragment.appendChild(originalEl.firstChild);
    (originalEl as any)._enlearnFragment = fragment;
    originalEl.appendChild(chunkedEl);
    originalEl.classList.add("enlearn-replaced");
  }
}

/**
 * 恢复所有 in-place 替换的元素（策略 B）
 */
function restoreReplacedElements(): void {
  document.querySelectorAll(".enlearn-replaced").forEach(el => {
    // 移除我们放进去的 chunked 内容
    const chunked = el.querySelector(".enlearn-chunked");
    if (chunked) chunked.remove();

    // 恢复原始子节点
    const fragment = (el as any)._enlearnFragment as DocumentFragment | undefined;
    if (fragment) {
      el.appendChild(fragment);
      delete (el as any)._enlearnFragment;
    }

    el.classList.remove("enlearn-replaced");
  });
}

// ========== DOM 扫描 ==========

const DOM_SELECTORS = [
  // X / Twitter
  '[data-testid="tweetText"]',
  '[role="article"] div[lang="en"]',
  // Reddit
  '.Post-body p', '.Comment-body p',
  '[data-testid="post-content"] p',
  'shreddit-post [slot="text-body"] p',
  '[id^="t3_"][id$="-post-rtjson-content"] p',
  // Medium + articles
  'article p',
  // General
  'main p', '[role="main"] p',
  'div[data-block="true"]',
  'section p', '.content p', '.post p', '.entry-content p',
  '.article-body p', '#content p', '.page-content p',
].join(", ");

function scanPage(): void {
  if (!isActive || isPaused) return;

  const candidates = document.querySelectorAll(DOM_SELECTORS);

  for (const el of candidates) {
    if (processedElements.has(el)) continue;
    if (isEnlearnElement(el)) continue;
    if (el.closest('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="complementary"]')) continue;

    const text = el.textContent?.trim() ?? "";
    if (text.length < 10) continue;
    if (!isEnglish(text)) continue;

    // 太短的文本不值得处理（短推文、标题等）
    if (text.split(/\s+/).length < 8) continue;

    // 统一扫读：按段落/句子本地拆分
    processedElements.add(el);
    const paragraphs = extractParagraphs(el);
    const allChunkedLines: string[] = [];
    let hasAnyChunks = false;

    for (let pi = 0; pi < paragraphs.length; pi++) {
      if (pi > 0) allChunkedLines.push(""); // 段落间空行

      const sentences = splitIntoSentences(paragraphs[pi]);
      for (const sentence of sentences) {
        const scanResult = scanSplit(sentence, config.scanThreshold, config.chunkGranularity);
        if (scanResult.chunks.length > 1) {
          hasAnyChunks = true;
          allChunkedLines.push(toChunkedString(scanResult.chunks));
        } else {
          allChunkedLines.push(sentence);
        }
      }
    }

    // 生词标注（不管是否拆分）
    const vocabAnnotations = isLoaded()
      ? annotateWords(text, knownWords, config.industryPacks)
      : [];

    if (hasAnyChunks) {
      // 有本地拆分结果 → 渲染（带生词标注）
      const chunkedString = allChunkedLines.join("\n");
      const chunkResult: ChunkResult = {
        original: text,
        chunked: chunkedString,
        isSimple: false,
        newWords: toNewWordsFormat(vocabAnnotations),
      };
      const chunkedEl = createChunkedElement(chunkResult, config.chunkIntensity);
      if (chunkedEl) {
        copyFontStyles(el, chunkedEl);
        insertChunkedElement(el, chunkedEl);

        if (vocabAnnotations.length > 0) {
          addWords(chunkResult.newWords, text);
        }
      }
    } else {
      // 没拆开 → 保留原始 DOM，只在原始元素上挂手动触发
      if (vocabAnnotations.length > 0) {
        addWords(toNewWordsFormat(vocabAnnotations), text);
      }
      addManualTrigger(el, text);
    }
  }
}

function isEnlearnElement(el: Element): boolean {
  return el.closest(".enlearn-chunked") !== null ||
    el.classList.contains("enlearn-chunked");
}

// ========== 手动触发 ==========

const TRIGGER_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="1" y1="3" x2="13" y2="3"/><line x1="4" y1="7" x2="13" y2="7"/><line x1="7" y1="11" x2="13" y2="11"/></svg>`;

function addManualTrigger(el: Element, text: string): void {
  el.setAttribute("data-enlearn-trigger", "1");
  el.classList.add("enlearn-trigger-wrap");

  const btn = document.createElement("span");
  btn.className = "enlearn-trigger";
  btn.innerHTML = TRIGGER_ICON_SVG;
  btn.title = "掰开这句";

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    e.preventDefault();
    btn.classList.add("enlearn-trigger-loading");

    try {
      // 检查是否有 API key
      const keyCheck = await sendMessage({ type: "hasApiKey" }) as { hasKey: boolean };

      let result: ChunkResult | null = null;

      if (keyCheck.hasKey) {
        // 有 API → 发 LLM 深度分析
        const response = await sendMessage({
          type: "chunk",
          sentences: [text],
          source_url: window.location.href,
        }) as { results: ChunkResult[] } | null;

        if (response?.results?.[0] && !response.results[0].isSimple) {
          result = response.results[0];
        }
      } else {
        // 无 API → 本地强制拆分（最低阈值 + 最细颗粒度）
        const scanResult = scanSplit(text, "short", "fine");
        if (scanResult.chunks.length > 1) {
          const vocabAnnotations = isLoaded()
            ? annotateWords(text, knownWords, config.industryPacks)
            : [];
          result = {
            original: text,
            chunked: toChunkedString(scanResult.chunks),
            isSimple: false,
            newWords: toNewWordsFormat(vocabAnnotations),
          };
        }
      }

      if (result) {
        const chunkedEl = createChunkedElement(result, config.chunkIntensity);
        if (chunkedEl) {
          copyFontStyles(el, chunkedEl);
          insertChunkedElement(el, chunkedEl);
          btn.remove();

          if (result.newWords && result.newWords.length > 0) {
            addWords(result.newWords, result.original);
          }
        }
      } else {
        // 拆不动 → 移除按钮
        btn.remove();
        el.classList.remove("enlearn-trigger-wrap");
        el.removeAttribute("data-enlearn-trigger");
      }
    } catch {
      btn.classList.remove("enlearn-trigger-loading");
    }
  });

  el.appendChild(btn);
}

// ========== Intersection Observer ==========

function setupIntersectionObserver(): void {
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      const visibleElements: Element[] = [];
      for (const entry of entries) {
        if (entry.isIntersecting) {
          visibleElements.push(entry.target);
          intersectionObserver?.unobserve(entry.target);
        }
      }
      if (visibleElements.length > 0) {
        processVisibleElements(visibleElements);
      }
    },
    { rootMargin: "100% 0px" }
  );
}

// ========== 批量处理 ==========

function processVisibleElements(elements: Element[]): void {
  processQueue.unshift(...elements);
  if (processTimer) clearTimeout(processTimer);
  processTimer = setTimeout(flushProcessQueue, 100);
}

async function flushProcessQueue(): Promise<void> {
  if (processQueue.length === 0 || !isActive) return;

  const batch = processQueue.splice(0, 5);
  const sentences: string[] = [];
  const elementMap = new Map<string, Element>();

  for (const el of batch) {
    const text = pendingElements.get(el);
    if (!text) continue;
    sentences.push(text);
    elementMap.set(text, el);
    pendingElements.delete(el);
  }

  if (sentences.length === 0) return;

  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000));
  const chunkedTexts = new Set<string>();

  try {
    const responseOrTimeout = await Promise.race([
      sendMessage({
        type: "chunk",
        sentences,
        source_url: window.location.href,
      }),
      timeoutPromise,
    ]);

    if (responseOrTimeout) {
      const response = responseOrTimeout as { results: ChunkResult[] };

      for (const result of response.results) {
        const el = elementMap.get(result.original);
        if (!el) continue;

        if (result.isSimple) {
          // 不加入 chunkedTexts，让后面的 fallback 给它加手动触发按钮
          continue;
        }

        const chunkedEl = createChunkedElement(result, config.chunkIntensity);
        if (!chunkedEl) continue;

        copyFontStyles(el, chunkedEl);
        insertChunkedElement(el, chunkedEl);
        chunkedTexts.add(result.original);

        if (result.newWords && result.newWords.length > 0) {
          addWords(result.newWords, result.original);
        }
      }
    }
  } catch {
    // 静默失败
  }

  // 未成功拆解的补手动触发
  for (const [text, el] of elementMap) {
    if (!chunkedTexts.has(text)) {
      addManualTrigger(el, text);
    }
  }

  if (processQueue.length > 0 && isActive) {
    processTimer = setTimeout(flushProcessQueue, 50);
  } else {
    setScanningStatus(false);
  }
}

// ========== MutationObserver ==========

function setupMutationObserver(): void {
  mutationObserver = new MutationObserver((mutations) => {
    let hasNewContent = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          if (!isEnlearnElement(el)) {
            hasNewContent = true;
          }
        }
      }
    }
    if (hasNewContent) {
      setTimeout(scanPage, 300);
    }
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ========== 通信 ==========

function sendMessage(message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

// ========== 启动 ==========

init();
