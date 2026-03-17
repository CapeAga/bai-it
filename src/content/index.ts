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
  loadFrequencyList, loadDictionary, loadLemmaMap,
  annotateWords, toNewWordsFormat, isLoaded, lookupDictionary,
} from "../shared/vocab.ts";
import type { BaitConfig, ChunkResult, BackgroundMessage } from "../shared/types.ts";
import { DEFAULT_CONFIG } from "../shared/types.ts";
import { createChunkedElement } from "./renderer.ts";
import { ENLEARN_STYLES } from "./styles.ts";

// ========== 词汇数据（构建时打包）==========

import wordFrequency from "../../data/word-frequency.json";
import dictEntries from "../../data/dict-ecdict.json";
import lemmaEntries from "../../data/lemma-map.json";

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
const vocabBookWords = new Map<string, { phonetic?: string; pos?: string; definition?: string }>(); // 生词本中的单词

// ========== 全局 Tooltip ==========

let tooltipEl: HTMLElement | null = null;

let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;
let currentTooltipWord: string | null = null;
let isTooltipPersistent = false; // 持久模式：翻译结果不自动隐藏

// ========== 悬浮图标 ==========

let floatingIconEl: HTMLElement | null = null;

function setupTooltip(): void {
  if (tooltipEl) return;
  tooltipEl = document.createElement("div");
  tooltipEl.className = "enlearn-tooltip";
  document.body.appendChild(tooltipEl);

  // Keep tooltip visible when hovering the tooltip itself (非持久模式下)
  tooltipEl.addEventListener("mouseenter", () => {
    if (isTooltipPersistent) return; // 持久模式不处理
    if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
  });
  tooltipEl.addEventListener("mouseleave", () => {
    if (isTooltipPersistent) return; // 持久模式不自动隐藏
    scheduleHideTooltip();
  });
  tooltipEl.addEventListener("click", onTooltipClick);

  document.addEventListener("mouseover", onWordHover);
  document.addEventListener("mouseout", onWordLeave);
  document.addEventListener("mouseover", onTriggerParentHover);
  document.addEventListener("mouseout", onTriggerParentLeave);
}

// ========== 悬浮图标 ==========

function setupFloatingIcon(): void {
  if (floatingIconEl) return;
  floatingIconEl = document.createElement("div");
  floatingIconEl.className = "enlearn-floating-icon";
  floatingIconEl.innerHTML = `<span class="enlearn-floating-icon-logo">掰</span>`;
  floatingIconEl.title = "翻译选中内容";
  floatingIconEl.style.display = "none";
  document.body.appendChild(floatingIconEl);

  floatingIconEl.addEventListener("click", onFloatingIconClick);
}

function showFloatingIcon(x: number, y: number): void {
  if (!floatingIconEl) return;

  floatingIconEl.style.left = `${x}px`;
  floatingIconEl.style.top = `${y}px`;
  floatingIconEl.style.display = "flex";
  floatingIconEl.classList.add("enlearn-floating-icon-visible");
}

function hideFloatingIcon(): void {
  if (!floatingIconEl) return;
  floatingIconEl.classList.remove("enlearn-floating-icon-visible");
  floatingIconEl.style.display = "none";
}

function onMouseUp(e: MouseEvent): void {
  // 忽略在 tooltip 或悬浮图标上的点击
  if ((e.target as Element).closest?.(".enlearn-tooltip, .enlearn-floating-icon")) {
    return;
  }

  // 延迟处理，确保 selection 已更新
  setTimeout(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideFloatingIcon();
      return;
    }

    const text = selection.toString().trim();

    // 检查是否是英文文本
    if (!text || !isEnglish(text)) {
      hideFloatingIcon();
      return;
    }

    // 获取选区范围
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // 在选区右上角显示图标
    const iconSize = 24;
    const padding = 4;
    const x = rect.right - iconSize - padding;
    const y = rect.top - iconSize - padding;

    // 确保不超出屏幕
    const finalX = Math.max(4, Math.min(x, window.innerWidth - iconSize - 4));
    const finalY = Math.max(4, Math.min(y, window.innerHeight - iconSize - 4));

    showFloatingIcon(finalX, finalY);
  }, 10);
}

function onDocumentClick(e: MouseEvent): void {
  // 点击不在悬浮图标上的位置时隐藏
  if (!(e.target as Element).closest?.(".enlearn-floating-icon")) {
    hideFloatingIcon();
  }
}

async function onFloatingIconClick(e: MouseEvent): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    hideFloatingIcon();
    return;
  }

  const text = selection.toString().trim();
  if (!text) {
    hideFloatingIcon();
    return;
  }

  // 隐藏悬浮图标
  hideFloatingIcon();

  // 触发翻译（复用右键菜单的翻译逻辑）
  handleShowTranslationTooltip(text);
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
  // 处理关闭按钮
  const closeBtn = (e.target as Element).closest?.(".enlearn-tooltip-close");
  if (closeBtn && tooltipEl) {
    tooltipEl.style.display = "none";
    isTooltipPersistent = false;
    currentTooltipWord = null;
    return;
  }

  // 处理生词本按钮
  const vocabBtn = (e.target as Element).closest?.(".enlearn-vocab-btn") as HTMLElement | null;
  if (vocabBtn) {
    const word = vocabBtn.dataset.word;
    if (!word) return;

    const isInVocab = vocabBookWords.has(word);

    if (isInVocab) {
      // 从生词本移除
      try {
        const result = await sendMessage({ type: "removeFromVocab", word }) as { success?: boolean };
        if (result.success) {
          vocabBookWords.delete(word);
          // 更新按钮状态
          vocabBtn.classList.remove("enlearn-vocab-btn-active");
          vocabBtn.textContent = "☆";
          vocabBtn.title = "添加到生词本";
          // 更新页面上该单词的高亮样式：移除生词本高亮
          document.querySelectorAll(`.enlearn-vocab-word`).forEach(el => {
            if ((el as HTMLElement).dataset.word?.toLowerCase() === word) {
              // 移除生词本特有的样式和属性
              el.classList.remove("enlearn-vocab-word");
              el.removeAttribute("data-phonetic");
              el.removeAttribute("data-pos");
              // 检查是否在词典中，如果不在则完全移除高亮
              const def = (el as HTMLElement).dataset.def;
              if (!def || def === "生词本") {
                // 不在词典中，完全移除高亮
                const text = document.createTextNode(el.textContent || "");
                el.parentNode?.replaceChild(text, el);
              } else {
                // 在词典中，改为普通生词样式
                el.classList.add("enlearn-word");
              }
            }
          });
        }
      } catch {
        // 静默失败
      }
    } else {
      // 添加到生词本
      // 从当前 tooltip 中获取单词信息
      const wordTitleEl = tooltipEl?.querySelector(".enlearn-word-title");
      const phoneticEl = tooltipEl?.querySelector(".enlearn-word-phonetic");
      const posEl = tooltipEl?.querySelector(".enlearn-word-pos");
      const defEl = tooltipEl?.querySelector(".enlearn-word-definition");
      const exampleEl = tooltipEl?.querySelector(".enlearn-word-example");

      const phonetic = phoneticEl?.textContent || undefined;
      const pos = posEl?.textContent || undefined;
      const definition = defEl?.textContent || "";
      const example = exampleEl?.textContent || undefined;

      try {
        const result = await sendMessage({
          type: "addToVocab",
          word,
          phonetic,
          pos,
          definition,
          example,
        }) as { success?: boolean };

        if (result.success) {
          vocabBookWords.set(word, { phonetic, pos, definition });
          // 更新按钮状态
          vocabBtn.classList.add("enlearn-vocab-btn-active");
          vocabBtn.textContent = "★";
          vocabBtn.title = "从生词本移除";
          // 更新页面上该单词的高亮样式：从普通样式改为生词本样式
          document.querySelectorAll(`.enlearn-word`).forEach(el => {
            if ((el as HTMLElement).dataset.word?.toLowerCase() === word) {
              el.classList.remove("enlearn-word");
              el.classList.add("enlearn-vocab-word");
              // 添加生词本特有的属性
              if (phonetic) {
                (el as HTMLElement).setAttribute("data-phonetic", phonetic);
              }
              if (pos) {
                (el as HTMLElement).setAttribute("data-pos", pos);
              }
            }
          });
        }
      } catch {
        // 静默失败
      }
    }
    return;
  }

  const btn = (e.target as Element).closest?.(".enlearn-tooltip-btn");
  if (!btn || !currentTooltipWord) return;

  const word = currentTooltipWord;
  knownWords.add(word);

  // Save to storage
  try {
    await chrome.storage.local.set({ knownWords: [...knownWords] });
  } catch { /* silent */ }

  // Remove all annotations for this word on current page
  document.querySelectorAll(`.enlearn-word, .enlearn-vocab-word`).forEach(el => {
    if ((el as HTMLElement).dataset.word?.toLowerCase() === word) {
      const text = document.createTextNode(el.textContent || "");
      el.parentNode?.replaceChild(text, el);
    }
  });

  // Hide tooltip
  if (tooltipEl) tooltipEl.style.display = "none";
  isTooltipPersistent = false;
  currentTooltipWord = null;
}

function onWordHover(e: MouseEvent): void {
  // 同时处理普通生词和生词本单词
  const wordEl = (e.target as Element).closest?.(".enlearn-word, .enlearn-vocab-word") as HTMLElement | null;
  if (!wordEl || !tooltipEl) return;

  const def = wordEl.getAttribute("data-def");
  if (!def) return;

  // Cancel any pending hide
  if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }

  const word = (wordEl.dataset.word || wordEl.textContent || "").toLowerCase();
  currentTooltipWord = word;

  // 检查是否是生词本单词
  const isVocabWord = wordEl.classList.contains("enlearn-vocab-word");

  if (isVocabWord) {
    // 生词本单词：显示完整信息
    const phonetic = wordEl.getAttribute("data-phonetic");
    const pos = wordEl.getAttribute("data-pos");
    const inVocabBook = vocabBookWords.has(word);

    let html = `<div class="enlearn-word-detail">`;

    // 关闭按钮
    html += `<button class="enlearn-tooltip-close" title="关闭">✕</button>`;

    // 单词头部：词 + 音标 + 词性 + 生词本按钮
    html += `<div class="enlearn-word-header">`;
    html += `<span class="enlearn-word-title">${escapeHtml(word)}</span>`;
    if (phonetic) {
      html += `<span class="enlearn-word-phonetic">${escapeHtml(phonetic)}</span>`;
    }
    if (pos) {
      html += `<span class="enlearn-word-pos">${escapeHtml(pos)}</span>`;
    }
    // 生词本按钮
    const vocabBtnClass = inVocabBook ? "enlearn-vocab-btn enlearn-vocab-btn-active" : "enlearn-vocab-btn";
    const vocabBtnTitle = inVocabBook ? "从生词本移除" : "添加到生词本";
    const vocabBtnIcon = inVocabBook ? "★" : "☆";
    html += `<button class="${vocabBtnClass}" title="${vocabBtnTitle}" data-word="${escapeHtml(word)}">${vocabBtnIcon}</button>`;
    html += `</div>`;

    // 释义
    html += `<div class="enlearn-word-definition">${escapeHtml(def)}</div>`;

    html += `</div>`;

    tooltipEl.innerHTML = html;
    tooltipEl.style.display = "block";
  } else {
    // 普通生词：显示简单释义 + 已掌握按钮
    tooltipEl.innerHTML = `<span class="enlearn-tooltip-def">${escapeHtml(def)}</span><button class="enlearn-tooltip-btn" title="标记为已掌握">✓</button>`;
    tooltipEl.style.display = "flex";
  }

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
  const word = (e.target as Element).closest?.(".enlearn-word, .enlearn-vocab-word");
  if (!word || !tooltipEl) return;
  scheduleHideTooltip();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ========== 右键查词 ==========

function showTranslation(word: string): void {
  if (!word || !tooltipEl) return;

  const lowerWord = word.toLowerCase();
  let definition = lookupDictionary(lowerWord);

  // 如果本地词典找不到，使用 LLM 查询
  if (!definition) {
    showTooltipLoading(tooltipEl, word);
    sendMessage({ type: "translateWord", word: lowerWord })
      .then((result) => {
        if (result && typeof result === "object" && "definition" in result) {
          const r = result as { definition: string; phonetic?: string; example?: string };
          displayWordDefinition(lowerWord, r.definition, r.phonetic, r.example);
        } else {
          showTooltipError(tooltipEl, word);
        }
      })
      .catch(() => {
        showTooltipError(tooltipEl, word);
      });
    return;
  }

  displayWordDefinition(lowerWord, definition);
}

function displayWordDefinition(word: string, definition: string, phonetic?: string, example?: string): void {
  if (!tooltipEl) return;

  // Cancel any pending hide
  if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }

  currentTooltipWord = word;
  let html = "";
  if (phonetic) {
    html += `<span class="enlearn-tooltip-phonetic">${escapeHtml(phonetic)}</span>`;
  }
  html += `<span class="enlearn-tooltip-def">${escapeHtml(definition)}</span>`;
  if (example) {
    html += `<span class="enlearn-tooltip-example">${escapeHtml(example)}</span>`;
  }
  html += `<button class="enlearn-tooltip-btn" title="标记为已掌握">✓</button>`;
  tooltipEl.innerHTML = html;
  tooltipEl.style.display = "flex";

  // Position tooltip near center of viewport (for right-click context)
  const tipRect = tooltipEl.getBoundingClientRect();
  let left = window.innerWidth / 2 - tipRect.width / 2;
  let top = window.innerHeight / 3 - tipRect.height / 2;

  if (left < 4) left = 4;
  if (left + tipRect.width > window.innerWidth - 4) {
    left = window.innerWidth - 4 - tipRect.width;
  }
  if (top < 4) top = 4;

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function showTooltipLoading(tooltipEl: HTMLElement, word: string): void {
  tooltipEl.innerHTML = `<span class="enlearn-tooltip-loading">查询 "${escapeHtml(word)}"...</span>`;
  tooltipEl.style.display = "flex";

  const tipRect = tooltipEl.getBoundingClientRect();
  let left = window.innerWidth / 2 - tipRect.width / 2;
  let top = window.innerHeight / 3 - tipRect.height / 2;

  if (left < 4) left = 4;
  if (left + tipRect.width > window.innerWidth - 4) {
    left = window.innerWidth - 4 - tipRect.width;
  }
  if (top < 4) top = 4;

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function showTooltipError(tooltipEl: HTMLElement, word: string): void {
  alert(`未找到 "${word}" 的释义`);
  tooltipEl.style.display = "none";
}

// ========== 右键菜单翻译 ==========

/** 判断是否是单个英文单词 */
function isSingleEnglishWord(text: string): boolean {
  const trimmed = text.trim();
  // 只包含字母、可能带连字符或撇号
  if (!/^[a-zA-Z][a-zA-Z'\-]*[a-zA-Z]?$/i.test(trimmed)) {
    return false;
  }
  // 长度合理（2-30字符）
  return trimmed.length >= 2 && trimmed.length <= 30;
}

async function handleShowTranslationTooltip(text: string): Promise<void> {
  if (!tooltipEl) return;

  const trimmedText = text.trim();
  const isWord = isSingleEnglishWord(trimmedText);

  // 显示加载状态
  showTooltipLoading(tooltipEl, trimmedText);

  try {
    if (isWord) {
      // 单词：调用 getWordDetail
      const result = await sendMessage({ type: "getWordDetail", word: trimmedText.toLowerCase() }) as {
        word?: string;
        phonetic?: string;
        pos?: string;
        definition?: string;
        example?: string;
        error?: string;
      };

      if (result.error) {
        displayErrorResult(result.error);
        return;
      }

      if (result.definition) {
        displayWordDetailResult(result.word || trimmedText, result.phonetic, result.pos, result.definition, result.example);
      }
    } else {
      // 句子/短语：调用 translateSelection
      const result = await sendMessage({ type: "translateSelection", text: trimmedText }) as {
        translation?: string;
        keyWords?: { word: string; meaning: string }[];
        error?: string;
      };

      if (result.error) {
        displayErrorResult(result.error);
        return;
      }

      if (result.translation) {
        displayTranslationResult(trimmedText, result.translation, result.keyWords);
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "翻译失败";
    displayErrorResult(errMsg);
  }
}

/** 显示单词详情结果（含音标、词性） */
function displayWordDetailResult(
  word: string,
  phonetic?: string,
  pos?: string,
  definition?: string,
  example?: string
): void {
  if (!tooltipEl) return;

  // 设置持久模式
  isTooltipPersistent = true;
  if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }

  // 检查是否在生词本中
  const lowerWord = word.toLowerCase();
  const inVocabBook = vocabBookWords.has(lowerWord);

  let html = `<div class="enlearn-word-detail">`;

  // 关闭按钮
  html += `<button class="enlearn-tooltip-close" title="关闭">✕</button>`;

  // 单词头部：词 + 音标 + 词性 + 生词本按钮
  html += `<div class="enlearn-word-header">`;
  html += `<span class="enlearn-word-title">${escapeHtml(word)}</span>`;
  if (phonetic) {
    html += `<span class="enlearn-word-phonetic">${escapeHtml(phonetic)}</span>`;
  }
  if (pos) {
    html += `<span class="enlearn-word-pos">${escapeHtml(pos)}</span>`;
  }
  // 生词本按钮
  const vocabBtnClass = inVocabBook ? "enlearn-vocab-btn enlearn-vocab-btn-active" : "enlearn-vocab-btn";
  const vocabBtnTitle = inVocabBook ? "从生词本移除" : "添加到生词本";
  const vocabBtnIcon = inVocabBook ? "★" : "☆";
  html += `<button class="${vocabBtnClass}" title="${vocabBtnTitle}" data-word="${escapeHtml(lowerWord)}">${vocabBtnIcon}</button>`;
  html += `</div>`;

  // 释义
  if (definition) {
    html += `<div class="enlearn-word-definition">${escapeHtml(definition)}</div>`;
  }

  // 例句
  if (example) {
    html += `<div class="enlearn-word-example">${escapeHtml(example)}</div>`;
  }

  html += `</div>`;

  tooltipEl.innerHTML = html;
  tooltipEl.style.display = "block";

  // Position tooltip
  const tipRect = tooltipEl.getBoundingClientRect();
  let left = window.innerWidth / 2 - tipRect.width / 2;
  let top = window.innerHeight / 3 - tipRect.height / 2;

  if (left < 4) left = 4;
  if (left + tipRect.width > window.innerWidth - 4) {
    left = window.innerWidth - 4 - tipRect.width;
  }
  if (top < 4) top = 4;

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function displayTranslationResult(
  originalText: string,
  translation: string,
  keyWords?: { word: string; meaning: string }[]
): void {
  if (!tooltipEl) return;

  // 设置持久模式
  isTooltipPersistent = true;
  if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }

  let html = `<div class="enlearn-translation-result">`;

  // 关闭按钮
  html += `<button class="enlearn-tooltip-close" title="关闭">✕</button>`;

  html += `<div class="enlearn-translation-text">${escapeHtml(translation)}</div>`;

  if (keyWords && keyWords.length > 0) {
    html += `<div class="enlearn-translation-keywords">`;
    for (const kw of keyWords) {
      html += `<span class="enlearn-keyword"><b>${escapeHtml(kw.word)}</b> ${escapeHtml(kw.meaning)}</span>`;
    }
    html += `</div>`;
  }

  html += `</div>`;

  tooltipEl.innerHTML = html;
  tooltipEl.style.display = "block";

  // Position tooltip
  const tipRect = tooltipEl.getBoundingClientRect();
  let left = window.innerWidth / 2 - tipRect.width / 2;
  let top = window.innerHeight / 3 - tipRect.height / 2;

  if (left < 4) left = 4;
  if (left + tipRect.width > window.innerWidth - 4) {
    left = window.innerWidth - 4 - tipRect.width;
  }
  if (top < 4) top = 4;

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

/** 显示错误结果（持久模式，带关闭按钮） */
function displayErrorResult(errorMsg: string): void {
  if (!tooltipEl) return;

  // 设置持久模式
  isTooltipPersistent = true;
  if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }

  tooltipEl.innerHTML = `
    <div class="enlearn-error-result">
      <button class="enlearn-tooltip-close" title="关闭">✕</button>
      <span class="enlearn-tooltip-error">${escapeHtml(errorMsg)}</span>
    </div>
  `;
  tooltipEl.style.display = "block";

  // Position tooltip
  const tipRect = tooltipEl.getBoundingClientRect();
  let left = window.innerWidth / 2 - tipRect.width / 2;
  let top = window.innerHeight / 3 - tipRect.height / 2;

  if (left < 4) left = 4;
  if (left + tipRect.width > window.innerWidth - 4) {
    left = window.innerWidth - 4 - tipRect.width;
  }
  if (top < 4) top = 4;

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
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
  setupFloatingIcon();

  // 悬浮图标事件监听
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("click", onDocumentClick);

  // 加载词汇数据
  loadFrequencyList(wordFrequency as string[]);
  loadDictionary(dictEntries as Record<string, string>);
  loadLemmaMap(lemmaEntries as Record<string, string>);

  // 加载用户已掌握的词
  try {
    const stored = await chrome.storage.local.get({ knownWords: [] });
    if (Array.isArray(stored.knownWords)) {
      for (const w of stored.knownWords) knownWords.add(w as string);
    }
  } catch {
    // 静默失败
  }

  // 加载生词本
  try {
    const vocabResponse = await sendMessage({ type: "getVocabWords" }) as {
      words?: Array<{ word: string; phonetic?: string; pos?: string; definition?: string; status?: string }>;
      error?: string;
    };
    if (vocabResponse.words) {
      for (const w of vocabResponse.words) {
        vocabBookWords.set(w.word.toLowerCase(), {
          phonetic: w.phonetic,
          pos: w.pos,
          definition: w.definition,
        });
      }
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
    else if (message.type === "show-translation") showTranslation(message.word);
    else if (message.type === "showTranslationTooltip") {
      // 右键菜单翻译
      handleShowTranslationTooltip(message.text);
    }
  });
}

// ========== 激活 ==========

function activate(): void {
  if (isActive) return;
  isActive = true;

  setupIntersectionObserver();
  scanPage();
  setupMutationObserver();

  chrome.storage.onChanged.addListener(onStorageChanged);
}

// ========== 停用 ==========

function deactivate(): void {
  if (!isActive) return;
  isActive = false;

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

  restoreProcessedElements();

  // 移除手动触发按钮
  document.querySelectorAll(".enlearn-trigger").forEach(t => t.remove());
  document.querySelectorAll("[data-enlearn-trigger]").forEach(w => {
    w.classList.remove("enlearn-trigger-wrap");
    w.removeAttribute("data-enlearn-trigger");
  });

  processedElements = new WeakSet<Element>();
  chrome.storage.onChanged.removeListener(onStorageChanged);
}

// ========== 暂停 / 恢复 ==========

function pauseProcessing(): void {
  if (!isActive || isPaused) return;
  isPaused = true;
  mutationObserver?.disconnect();
  intersectionObserver?.disconnect();
  processQueue.length = 0;
  if (processTimer) {
    clearTimeout(processTimer);
    processTimer = null;
  }

  // 暂停：隐藏分块 + 显示原文（用 JS 直接操作，不依赖 CSS body 级规则）
  document.querySelectorAll(".enlearn-chunked").forEach(el => {
    (el as HTMLElement).style.setProperty("display", "none", "important");
  });
  document.querySelectorAll(".enlearn-trigger").forEach(el => {
    (el as HTMLElement).style.setProperty("display", "none", "important");
  });
  document.querySelectorAll(".enlearn-original-hidden").forEach(el => {
    (el as HTMLElement).style.removeProperty("display");
    el.classList.remove("enlearn-original-hidden");
    el.classList.add("enlearn-was-hidden");
  });
}

function resumeProcessing(): void {
  if (!isActive || !isPaused) return;
  isPaused = false;

  // 恢复：重新隐藏原文 + 显示分块
  document.querySelectorAll(".enlearn-was-hidden").forEach(el => {
    (el as HTMLElement).style.setProperty("display", "none", "important");
    el.classList.add("enlearn-original-hidden");
    el.classList.remove("enlearn-was-hidden");
  });
  document.querySelectorAll(".enlearn-chunked").forEach(el => {
    (el as HTMLElement).style.removeProperty("display");
  });
  document.querySelectorAll(".enlearn-trigger").forEach(el => {
    (el as HTMLElement).style.removeProperty("display");
  });

  // 恢复时用新配置重新处理
  reprocessPage();

  setupIntersectionObserver();
  setupMutationObserver();
}

/**
 * 清除所有已渲染的分块，重置处理状态，用当前配置重新扫描页面
 */
function reprocessPage(): void {
  restoreProcessedElements();

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
 * 递归提取元素文本，只在 <br> 处插入换行。
 * 避免 innerText 把 <div> 包装层（如 Twitter @mention 的 <div>）当作段落分隔。
 */
function extractTextFromDOM(el: Node): string {
  let result = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName;
      // 跳过 script/style 等不可见内容（含 <script type="application/json"> 数据岛）
      if (SKIP_TAGS.has(tag)) continue;
      if (tag === "BR") {
        result += "\n";
      } else {
        result += extractTextFromDOM(node);
      }
    }
  }
  return result;
}

/**
 * 从元素中提取段落列表，保留 <br> 和文本中的换行
 */
function extractParagraphs(el: Element): string[] {
  const text = extractTextFromDOM(el);
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
 * 策略：隐藏原始元素 + 兄弟插入（沿用旧 Enlearn 方案）
 * - 原始元素 display:none（保留在 DOM 中，保留框架绑定）
 * - 分块内容作为下一个兄弟元素插入
 * - 不修改原始元素的子节点 → React Fiber / Lit 绑定全部正常
 * - 不 stopPropagation、不 dispatchEvent、不做站点特判
 */
function insertChunkedElement(
  originalEl: Element,
  chunkedEl: HTMLElement,
): void {
  // 1. 隐藏原始元素
  // Twitter 长推文：tweetText 有 Show More 兄弟按钮时，用塌缩（height:0）代替 display:none
  // 这样 React 仍能测量 scrollHeight > 0，不会移除 Show More 按钮
  const hasShowMore =
    originalEl.matches('[data-testid="tweetText"]') &&
    originalEl.parentElement?.querySelector('[data-testid="tweet-text-show-more-link"]');
  if (hasShowMore) {
    (originalEl as HTMLElement).style.setProperty("height", "0", "important");
    (originalEl as HTMLElement).style.setProperty("overflow", "hidden", "important");
    (originalEl as HTMLElement).style.setProperty("padding", "0", "important");
    (originalEl as HTMLElement).style.setProperty("margin", "0", "important");
    originalEl.classList.add("enlearn-collapsed");
  } else {
    (originalEl as HTMLElement).style.setProperty("display", "none", "important");
  }
  originalEl.classList.add("enlearn-original-hidden");
  // 2. 插入分块作为兄弟
  originalEl.parentNode?.insertBefore(chunkedEl, originalEl.nextSibling);

  // 3. 向上查找截断容器，用 inline style 覆盖
  //    - Reddit/Substack: -webkit-box + line-clamp
  //    - Twitter: overflow:hidden 截断长推文（"Show more" 按钮被裁剪）
  let current = originalEl.parentElement;
  for (let i = 0; i < 6 && current; i++) {
    const tag = current.tagName;
    if (tag === "A" || tag === "ARTICLE") break;
    if (current.getAttribute("role") === "article") break;

    const cls = current.className || "";
    const cs = window.getComputedStyle(current);

    const isWebkitBox =
      cls.includes("line-clamp") ||
      cls.includes("text-ellipsis") ||
      (cs.webkitLineClamp && cs.webkitLineClamp !== "none") ||
      cs.display === "-webkit-box" ||
      cs.display === "-webkit-inline-box";

    const isOverflowClip =
      (cs.overflow === "hidden" || cs.overflowY === "hidden") &&
      !isWebkitBox; // 避免重复处理

    if (isWebkitBox) {
      current.classList.add("enlearn-clamp-override");
      current.style.setProperty("-webkit-line-clamp", "unset", "important");
      current.style.setProperty("-webkit-box-orient", "unset", "important");
      current.style.setProperty("display", "block", "important");
      current.style.setProperty("max-height", "none", "important");
      current.style.setProperty("overflow", "visible", "important");
    } else if (isOverflowClip) {
      // Twitter 等站点：overflow:hidden 裁剪内容和 "Show more" 按钮
      current.classList.add("enlearn-clamp-override");
      current.style.setProperty("max-height", "none", "important");
      current.style.setProperty("overflow", "visible", "important");
    }
    current = current.parentElement;
  }
}

/**
 * 恢复所有处理过的元素（移除分块兄弟，显示原始元素）
 */
function restoreProcessedElements(): void {
  // 移除所有分块元素
  document.querySelectorAll(".enlearn-chunked").forEach(el => el.remove());

  // 恢复隐藏的原始元素（清除 inline style + class）
  document.querySelectorAll(".enlearn-original-hidden").forEach(el => {
    if (el.classList.contains("enlearn-collapsed")) {
      (el as HTMLElement).style.removeProperty("height");
      (el as HTMLElement).style.removeProperty("overflow");
      (el as HTMLElement).style.removeProperty("padding");
      (el as HTMLElement).style.removeProperty("margin");
      el.classList.remove("enlearn-collapsed");
    } else {
      (el as HTMLElement).style.removeProperty("display");
    }
    el.classList.remove("enlearn-original-hidden");
  });

  // 清理截断覆盖（清除 inline style + class）
  document.querySelectorAll(".enlearn-clamp-override").forEach(el => {
    (el as HTMLElement).style.removeProperty("-webkit-line-clamp");
    (el as HTMLElement).style.removeProperty("-webkit-box-orient");
    (el as HTMLElement).style.removeProperty("display");
    (el as HTMLElement).style.removeProperty("max-height");
    (el as HTMLElement).style.removeProperty("overflow");
    el.classList.remove("enlearn-clamp-override");
  });
}

// ========== 数据采集 ==========

function saveSentenceQuiet(text: string, manual: boolean, newWords: string[]): void {
  sendMessage({
    type: "saveSentence",
    text,
    source_url: window.location.href,
    source_hostname: window.location.hostname,
    manual,
    new_words: newWords,
  }).catch(() => {});
}

// ========== DOM 手术：含链接元素的原地拆分 ==========

/**
 * 判断文本节点是否在 URL 链接内部（href 以 http 开头的 <a>）
 * @mention / #hashtag 等非 URL 链接不算
 */
function isInsideUrlAnchor(node: Node): boolean {
  const anchor = (node.parentElement as Element | null)?.closest('a[href^="http"]');
  return !!anchor;
}

/**
 * 判断两个相邻文本节点之间是否存在块级分隔（段落边界）
 */
function hasBlockBoundaryBetween(nodeA: Node, nodeB: Node): boolean {
  const parentA = nodeA.parentElement;
  const parentB = nodeB.parentElement;
  if (!parentA || !parentB) return false;

  // 如果两个节点不在同一个父元素下，检查路径上是否有 block 元素
  if (parentA !== parentB) {
    // 简单启发式：不同父 → 视为段落分隔
    // （精确判断需要遍历 DOM 路径，成本高且边际收益小）
    const commonAncestor = parentA.closest(':has(> br, > div, > p)');
    if (commonAncestor) return true;
  }

  // 同父元素下，检查两个文本节点之间是否有 <br>
  let current: Node | null = nodeA.nextSibling;
  while (current && current !== nodeB) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const tag = (current as Element).tagName;
      if (tag === "BR" || tag === "DIV" || tag === "P") return true;
    }
    current = current.nextSibling;
  }
  return false;
}

interface TextEntry {
  node: Text;
  globalStart: number;
  globalEnd: number;
}

interface Breakpoint {
  offset: number; // fullText 中的字符偏移
  level: number;  // 缩进级别
}

/**
 * 对含链接的元素执行 clone + DOM 手术
 *
 * 核心原则：只动 text node，不动 element node → <a> 完整保留
 */
function processElementWithLinks(el: Element, text: string): void {
  // 1. 克隆
  const clone = el.cloneNode(true) as HTMLElement;

  // 2. TreeWalker 收集非 URL 文本节点
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      if (isInsideUrlAnchor(node)) return NodeFilter.FILTER_REJECT;
      // 跳过纯空白节点
      if (!node.textContent || node.textContent.trim() === "") return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let walkerNode: Node | null;
  while ((walkerNode = walker.nextNode())) {
    textNodes.push(walkerNode as Text);
  }

  if (textNodes.length === 0) return;

  // 3. 构建 fullText + 位置映射
  const entries: TextEntry[] = [];
  let fullText = "";
  for (const node of textNodes) {
    const content = node.textContent || "";
    entries.push({ node, globalStart: fullText.length, globalEnd: fullText.length + content.length });
    fullText += content;
  }

  // 4. 段落检测 + 拆句 + scanSplit → 收集断点
  const breakpoints: Breakpoint[] = [];

  // 按段落分组：相邻文本节点之间有 block boundary → 新段落
  const paragraphGroups: { startIdx: number; endIdx: number }[] = [];
  let groupStart = 0;
  for (let i = 1; i < textNodes.length; i++) {
    if (hasBlockBoundaryBetween(textNodes[i - 1], textNodes[i])) {
      paragraphGroups.push({ startIdx: groupStart, endIdx: i - 1 });
      groupStart = i;
    }
  }
  paragraphGroups.push({ startIdx: groupStart, endIdx: textNodes.length - 1 });

  for (const group of paragraphGroups) {
    // 提取该段落的文本
    const paraStart = entries[group.startIdx].globalStart;
    const paraEnd = entries[group.endIdx].globalEnd;
    const paraText = fullText.slice(paraStart, paraEnd);

    // 拆句
    const sentences = splitIntoSentences(paraText);
    let sentenceOffset = paraStart;

    for (let si = 0; si < sentences.length; si++) {
      const sentence = sentences[si];
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      // 找到这个句子在 fullText 中的实际起始位置
      const sentStart = fullText.indexOf(trimmed, sentenceOffset);
      if (sentStart === -1) {
        sentenceOffset += sentence.length;
        continue;
      }

      // 非首句：在句子起始位置插入断点（句子边界换行）
      if (si > 0 && sentStart > paraStart) {
        breakpoints.push({ offset: sentStart, level: 0 });
      }

      const scanResult = scanSplit(trimmed, config.scanThreshold, config.chunkGranularity);
      if (scanResult.chunks.length > 1) {
        // 将 chunk 断点映射回 fullText 偏移（用词匹配，避免多空格导致偏移漂移）
        let searchPos = sentStart;
        for (let ci = 0; ci < scanResult.chunks.length; ci++) {
          const chunkWords = scanResult.chunks[ci].text.split(/\s+/);
          if (ci > 0) {
            // 在 fullText 中定位当前 chunk 的首词
            const firstWord = chunkWords[0];
            const wordPos = fullText.indexOf(firstWord, searchPos);
            if (wordPos >= 0) {
              breakpoints.push({ offset: wordPos, level: scanResult.chunks[ci].level });
            }
          }
          // 推进 searchPos 到当前 chunk 最后一个词之后
          for (const w of chunkWords) {
            const idx = fullText.indexOf(w, searchPos);
            if (idx >= 0) searchPos = idx + w.length;
          }
        }
      }

      sentenceOffset = sentStart + trimmed.length;
    }
  }

  if (breakpoints.length === 0) {
    // 没有断点 → 不拆分，走手动触发
    addManualTrigger(el, text);
    return;
  }

  // 5. 反向插入 <br> + 缩进 span
  // 排序：从后往前，避免偏移失效
  breakpoints.sort((a, b) => b.offset - a.offset);

  for (const bp of breakpoints) {
    // 找到对应的 text entry
    const entry = entries.find(e => bp.offset >= e.globalStart && bp.offset < e.globalEnd);
    if (!entry) continue;

    // 安全检查：断点不能落在 <a> 内部
    if (isInsideUrlAnchor(entry.node)) continue;

    const localOffset = bp.offset - entry.globalStart;
    if (localOffset <= 0 || localOffset >= (entry.node.textContent?.length || 0)) continue;

    const remainder = entry.node.splitText(localOffset);
    const br = document.createElement("br");
    remainder.parentNode!.insertBefore(br, remainder);

    // 缩进：用 span 包裹 remainder
    if (bp.level > 0) {
      const indent = document.createElement("span");
      indent.className = `enlearn-indent-${bp.level}`;
      indent.style.paddingLeft = `${bp.level}em`;
      indent.style.display = "inline";
      remainder.parentNode!.insertBefore(indent, remainder);
      // 收集从 remainder 到下一个 <br> 或末尾的所有节点
      const nodesToWrap: Node[] = [];
      let current: Node | null = remainder;
      while (current) {
        const next: Node | null = current.nextSibling;
        if (current.nodeType === Node.ELEMENT_NODE && (current as Element).tagName === "BR") break;
        nodesToWrap.push(current);
        current = next;
      }
      for (const n of nodesToWrap) {
        indent.appendChild(n);
      }
    }
  }

  // 6. Vocab 标注：在克隆中的非 URL 文本节点上标记生词
  const vocabAnnotations = isLoaded() ? annotateWords(text, knownWords, vocabBookWords) : [];
  if (vocabAnnotations.length > 0) {
    applyVocabToClone(clone, vocabAnnotations);
  }

  // 7. 标记为 chunked 元素
  clone.classList.add("enlearn-chunked");
  clone.setAttribute("data-original", text);
  clone.style.setProperty("display", "block", "important");

  // 8. 复制字体样式 + 插入
  copyFontStyles(el, clone);
  insertChunkedElement(el, clone);

  // 9. 采集数据
  const sentenceNewWords = vocabAnnotations.map(a => a.word);
  saveSentenceQuiet(text, false, sentenceNewWords);
}

/**
 * 在克隆元素中标注生词（DOM 手术方式）
 */
function applyVocabToClone(
  clone: HTMLElement,
  annotations: { word: string; definition: string; isFromVocabBook?: boolean; phonetic?: string; pos?: string }[]
): void {
  const wordMap = new Map(
    annotations.map(a => [a.word.toLowerCase(), a])
  );
  const wordPattern = annotations
    .map(a => a.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`\\b(${wordPattern})\\b`, "gi");

  // 收集所有非 URL 文本节点
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      if (isInsideUrlAnchor(node)) return NodeFilter.FILTER_REJECT;
      if (!node.textContent || node.textContent.trim() === "") return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n: Node | null;
  while ((n = walker.nextNode())) {
    textNodes.push(n as Text);
  }

  // 反向遍历文本节点（避免 TreeWalker 失效）
  for (let ti = textNodes.length - 1; ti >= 0; ti--) {
    const textNode = textNodes[ti];
    const content = textNode.textContent || "";
    const matches: { index: number; length: number; word: string }[] = [];

    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(content))) {
      matches.push({ index: match.index, length: match[0].length, word: match[0] });
    }

    if (matches.length === 0) continue;

    // 从后往前替换
    let currentNode = textNode;
    for (let mi = matches.length - 1; mi >= 0; mi--) {
      const m = matches[mi];
      const after = currentNode.splitText(m.index + m.length);
      const wordNode = currentNode.splitText(m.index);
      // wordNode 现在只包含匹配的词

      const span = document.createElement("span");
      const annotation = wordMap.get(m.word.toLowerCase());

      // 生词本单词使用特殊的高亮样式
      if (annotation?.isFromVocabBook) {
        span.className = "enlearn-vocab-word";
      } else {
        span.className = "enlearn-word";
      }

      const def = annotation?.definition || "";
      span.setAttribute("data-def", def);
      span.setAttribute("data-word", m.word.toLowerCase());

      // 生词本单词添加额外属性
      if (annotation?.isFromVocabBook) {
        if (annotation.phonetic) {
          span.setAttribute("data-phonetic", annotation.phonetic);
        }
        if (annotation.pos) {
          span.setAttribute("data-pos", annotation.pos);
        }
      }

      span.textContent = wordNode.textContent;

      wordNode.parentNode!.replaceChild(span, wordNode);
      // currentNode 指向匹配前的部分，继续处理前面的匹配
      void after; // after 保留在 DOM 中
    }
  }
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

// 块级标签集合，用于判断"叶子文本块"
const BLOCK_TAGS = new Set([
  "DIV", "P", "LI", "BLOCKQUOTE", "TD", "TH",
  "SECTION", "ARTICLE", "ASIDE", "MAIN", "DD", "DT", "FIGCAPTION",
  "OL", "UL", "DL",
  "H1", "H2", "H3", "H4", "H5", "H6",
  "PRE", "HR", "TABLE", "FIGURE", "DETAILS", "SUMMARY",
  "FORM", "FIELDSET",
]);

// 兜底扫描排除的标签
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS",
  "VIDEO", "AUDIO", "IFRAME", "OBJECT", "EMBED",
  "INPUT", "TEXTAREA", "SELECT", "BUTTON", "LABEL",
  "NAV", "HEADER", "FOOTER",
]);

/**
 * 兜底扫描：找出页面上"文本密集的叶子块级元素"
 * 叶子 = 自己是块级元素，但内部没有子块级元素（只有文本/行内元素）
 */
function findTextLeafElements(): Element[] {
  const results: Element[] = [];
  const allElements = document.body.querySelectorAll("*");

  for (const el of allElements) {
    // 只看块级标签
    if (!BLOCK_TAGS.has(el.tagName)) continue;

    // 排除不可能是正文的标签/区域（含 Web App 的 ARIA widget roles）
    if (el.closest('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="complementary"], [role="grid"], [role="gridcell"], [role="row"], [role="rowgroup"], [role="listbox"]')) continue;

    // 已处理或已被掰it 注入的跳过
    if (processedElements.has(el)) continue;
    if (isEnlearnElement(el)) continue;
    if (el.closest(".enlearn-original-hidden")) continue;

    // "叶子"判定：内部没有子块级元素
    let hasBlockChild = false;
    for (const child of el.children) {
      if (BLOCK_TAGS.has(child.tagName) || SKIP_TAGS.has(child.tagName)) {
        hasBlockChild = true;
        break;
      }
      // 自定义元素（如 react-app, turbo-frame）视为块级，含此类子元素的不是叶子
      if (child.tagName.includes("-")) {
        hasBlockChild = true;
        break;
      }
    }
    if (hasBlockChild) continue;

    // 文本长度和英文检查（用 extractTextFromDOM 剔除 script/style）
    const text = extractTextFromDOM(el).trim();
    if (text.length < 10) continue;
    if (!isEnglish(text)) continue;
    if (text.split(/\s+/).length < 8) continue;

    results.push(el);
  }

  return results;
}

function scanPage(): void {
  if (!isActive || isPaused) return;

  // 第一轮：白名单精确匹配
  const candidates = document.querySelectorAll(DOM_SELECTORS);

  for (const el of candidates) {
    if (processedElements.has(el)) continue;
    if (isEnlearnElement(el)) continue;
    if (el.closest('nav, header, footer, aside, [role="link"], [role="navigation"], [role="banner"], [role="complementary"], [role="grid"], [role="gridcell"], [role="row"], [role="rowgroup"], [role="listbox"]')) continue;

    // 跳过包含更具体匹配的父容器
    // 例如 Twitter 上 div[lang="en"] 可能同时匹配 tweetText 和包裹它的父容器
    // 父容器被隐藏会连带隐藏 "Show more" 等兄弟按钮
    if (el.querySelector(DOM_SELECTORS)) continue;

    // 跳过已经被隐藏的元素内部的后代
    if (el.closest(".enlearn-original-hidden")) continue;

    // 用 extractTextFromDOM 取干净文本（剔除 script/style 等不可见内容）
    const text = extractTextFromDOM(el).trim();
    if (text.length < 10) continue;
    if (!isEnglish(text)) continue;

    // 太短的文本不值得处理（短推文、标题等）
    if (text.split(/\s+/).length < 8) continue;

    processTextElement(el, text);
  }

  // 第二轮：兜底扫描——找白名单没覆盖到的文本密集叶子元素
  // 兜底元素可能直接参与 flex/grid 布局（如 col-md-6），
  // 必须用 clone 路径保留原始 class，否则兄弟插入会破坏布局
  const fallbackCandidates = findTextLeafElements();
  for (const el of fallbackCandidates) {
    const text = extractTextFromDOM(el).trim();
    processedElements.add(el);
    processElementWithLinks(el, text);
  }
}

/** 处理单个文本元素：拆分 + 生词标注 + DOM 注入 */
function processTextElement(el: Element, text: string): void {
  processedElements.add(el);

  // 含 URL 链接或 <img> 等非文本内容的元素 → clone + DOM 手术路径（保留 <a>, <img> 等）
  const hasUrlLinks = el.querySelector('a[href^="http"]') !== null;
  const hasNonTextContent = el.querySelector('img, video, audio, iframe, svg, canvas') !== null;
  if (hasUrlLinks || hasNonTextContent) {
    processElementWithLinks(el, text);
    return;
  }

  // 不含链接 → 现有纯文本路径
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
    ? annotateWords(text, knownWords, vocabBookWords)
    : [];

  // 收集生词列表（只要词）
  const sentenceNewWords = vocabAnnotations.map(a => a.word);

  if (hasAnyChunks) {
    // 有本地拆分结果 → 渲染（带生词标注）
    const chunkedString = allChunkedLines.join("\n");
    const chunkResult: ChunkResult = {
      original: text,
      chunked: chunkedString,
      isSimple: false,
      newWords: toNewWordsFormat(vocabAnnotations),
    };
    const chunkedEl = createChunkedElement(chunkResult, config.chunkIntensity, vocabBookWords);
    if (chunkedEl) {
      copyFontStyles(el, chunkedEl);
      insertChunkedElement(el, chunkedEl);
    }
  } else {
    // 没拆开 → 保留原始 DOM，只在原始元素上挂手动触发
    addManualTrigger(el, text);
  }

  // fire-and-forget 存句到 pending_sentences
  saveSentenceQuiet(text, false, sentenceNewWords);
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
            ? annotateWords(text, knownWords, vocabBookWords)
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
        const chunkedEl = createChunkedElement(result, config.chunkIntensity, vocabBookWords);
        if (chunkedEl) {
          copyFontStyles(el, chunkedEl);
          insertChunkedElement(el, chunkedEl);
          btn.remove();

          // 手动触发 → 标记 manual: true
          const newWordsList = result.newWords?.map(w => w.word) ?? [];
          saveSentenceQuiet(text, true, newWordsList);
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

        const chunkedEl = createChunkedElement(result, config.chunkIntensity, vocabBookWords);
        if (!chunkedEl) continue;

        copyFontStyles(el, chunkedEl);
        insertChunkedElement(el, chunkedEl);
        chunkedTexts.add(result.original);
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
  }
}

// ========== MutationObserver ==========

/**
 * 恢复单个被隐藏的原始元素（移除分块兄弟、恢复显示、清理截断覆盖）
 * 用于：站点 JS 更新了被隐藏元素的内容（如 Twitter "Show more" 展开全文）
 */
function restoreSingleElement(el: Element): void {
  if (!el.classList.contains("enlearn-original-hidden")) return;

  // 移除分块兄弟
  const next = el.nextElementSibling;
  if (next?.classList.contains("enlearn-chunked")) {
    next.remove();
  }

  // 恢复原始元素显示
  if (el.classList.contains("enlearn-collapsed")) {
    (el as HTMLElement).style.removeProperty("height");
    (el as HTMLElement).style.removeProperty("overflow");
    (el as HTMLElement).style.removeProperty("padding");
    (el as HTMLElement).style.removeProperty("margin");
    el.classList.remove("enlearn-collapsed");
  } else {
    (el as HTMLElement).style.removeProperty("display");
  }
  el.classList.remove("enlearn-original-hidden");

  // 清理祖先上的截断覆盖
  let current = el.parentElement;
  for (let i = 0; i < 6 && current; i++) {
    const tag = current.tagName;
    if (tag === "A" || tag === "ARTICLE") break;
    if (current.getAttribute("role") === "article") break;
    if (current.classList.contains("enlearn-clamp-override")) {
      (current as HTMLElement).style.removeProperty("-webkit-line-clamp");
      (current as HTMLElement).style.removeProperty("-webkit-box-orient");
      (current as HTMLElement).style.removeProperty("display");
      (current as HTMLElement).style.removeProperty("max-height");
      (current as HTMLElement).style.removeProperty("overflow");
      current.classList.remove("enlearn-clamp-override");
    }
    current = current.parentElement;
  }

  // 允许重新处理
  processedElements.delete(el);

  // 清理手动触发按钮（如有）
  const trigger = el.querySelector(".enlearn-trigger");
  if (trigger) trigger.remove();
  el.classList.remove("enlearn-trigger-wrap");
  el.removeAttribute("data-enlearn-trigger");
}

function setupMutationObserver(): void {
  mutationObserver = new MutationObserver((mutations) => {
    let hasNewContent = false;
    const changedHiddenEls = new Set<Element>();

    for (const mutation of mutations) {
      // 场景 A：站点 JS 修改了 hidden 元素内部内容（in-place 更新）
      const target = mutation.target;
      if (target instanceof Element) {
        const hiddenEl = target.classList.contains("enlearn-original-hidden")
          ? target
          : target.closest(".enlearn-original-hidden");
        if (hiddenEl) {
          changedHiddenEls.add(hiddenEl);
          continue;
        }
      } else if (target.parentElement) {
        const hiddenEl = target.parentElement.closest(".enlearn-original-hidden");
        if (hiddenEl) {
          changedHiddenEls.add(hiddenEl);
          continue;
        }
      }

      // 场景 B：React 直接替换整个元素（移除旧 hidden 元素 + 插入新元素）
      // Twitter "Show more"：React 移除旧 tweetText，插入包含全文的新 tweetText
      // 旧元素被移除后，我们的 .enlearn-chunked 兄弟变成孤儿
      for (const node of mutation.removedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          if (el.classList.contains("enlearn-original-hidden")) {
            // 清理孤儿分块兄弟：在 parent 中找没有对应 hidden 原始元素的 chunked div
            const parent = mutation.target;
            if (parent instanceof Element) {
              const chunkedDivs = parent.querySelectorAll(
                ":scope > .enlearn-chunked"
              );
              for (const c of chunkedDivs) {
                const prev = c.previousElementSibling;
                if (
                  !prev ||
                  !prev.classList.contains("enlearn-original-hidden")
                ) {
                  c.remove();
                }
              }
            }
            processedElements.delete(el);
            hasNewContent = true;
          }
        }
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          if (!isEnlearnElement(el)) {
            hasNewContent = true;
          }
        }
      }
    }

    // 场景 A 触发：恢复并重新处理
    if (changedHiddenEls.size > 0) {
      for (const el of changedHiddenEls) {
        restoreSingleElement(el);
      }
      setTimeout(scanPage, 300);
    }

    if (hasNewContent) {
      setTimeout(scanPage, 300);
    }
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
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
