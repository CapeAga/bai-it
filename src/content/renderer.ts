/**
 * 分块结果渲染器
 *
 * 将分块文本转换为结构化 DOM，包含生词标注（hover 弹窗释义）。
 *
 * 5 个显示方式级别（intensity 1-5）：
 * L5 全拆：分行 + 缩进 + 从句透明度降低
 * L4 缩进：分行 + 缩进（无透明度变化）
 * L3 分行：只分行，不缩进（所有行左对齐）
 * L2 标记：不分行，在拆分点插入 · 分隔符
 * L1 轻标：不分行，从句部分变淡
 */

import type { ChunkResult } from "../shared/types.ts";

interface ChunkedLine {
  indent: number;
  text: string;
  isParagraphBreak?: boolean;
}

function parseChunkedText(chunked: string): ChunkedLine[] {
  const rawLines = chunked.split("\n");
  const result: ChunkedLine[] = [];

  for (const line of rawLines) {
    if (line.trim() === "") {
      // 空行 = 段落分隔
      result.push({ indent: 0, text: "", isParagraphBreak: true });
      continue;
    }
    const match = line.match(/^(\s*)/);
    const spaces = match ? match[1].length : 0;
    const indent = Math.min(Math.floor(spaces / 2), 5);
    let text = line.trim();
    text = text.replace(/^\[(.+)\]$/, "$1");
    result.push({ indent, text });
  }

  return result.filter(l => l.text.length > 0 || l.isParagraphBreak);
}

/**
 * 为文本中的生词添加标记
 * @param text 原始文本
 * @param newWords 生词列表
 * @param vocabBookWords 生词本中的单词及其信息（会有特殊样式和额外属性）
 */
function markNewWords(
  text: string,
  newWords: { word: string; definition: string }[],
  vocabBookWords?: Map<string, { phonetic?: string; pos?: string; definition?: string }>
): string {
  if (newWords.length === 0) return escapeHtml(text);

  const wordPattern = newWords
    .map((w) => w.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const wordMap = new Map(newWords.map((w) => [w.word.toLowerCase(), w.definition]));

  return escapeHtml(text).replace(
    new RegExp(`\\b(${wordPattern})\\b`, "gi"),
    (match) => {
      const lowerMatch = match.toLowerCase();
      const def = wordMap.get(lowerMatch) ?? "";
      // 检查是否在生词本中
      const vocabInfo = vocabBookWords?.get(lowerMatch);

      if (vocabInfo) {
        // 生词本单词：使用特殊样式并添加额外属性
        let attrs = `class="enlearn-vocab-word" data-def="${escapeHtml(def)}" data-word="${lowerMatch}"`;
        if (vocabInfo.phonetic) {
          attrs += ` data-phonetic="${escapeHtml(vocabInfo.phonetic)}"`;
        }
        if (vocabInfo.pos) {
          attrs += ` data-pos="${escapeHtml(vocabInfo.pos)}"`;
        }
        return `<span ${attrs}>${match}</span>`;
      } else {
        // 普通生词
        return `<span class="enlearn-word" data-def="${escapeHtml(def)}" data-word="${lowerMatch}">${match}</span>`;
      }
    }
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderL5(lines: ChunkedLine[], newWords: { word: string; definition: string }[], vocabBookWords?: Map<string, { phonetic?: string; pos?: string; definition?: string }>): string {
  return lines
    .map((line) => {
      if (line.isParagraphBreak) return '<span class="enlearn-para-break" style="display:block !important;height:0.8em"></span>';
      const textHtml = markNewWords(line.text, newWords, vocabBookWords);
      const pad = line.indent > 0 ? `padding-left:${line.indent}em;` : "";
      return `<span class="enlearn-line enlearn-indent-${line.indent} enlearn-depth-${line.indent}" style="display:block !important;${pad}">${textHtml}</span>`;
    })
    .join("");
}

function renderL4(lines: ChunkedLine[], newWords: { word: string; definition: string }[], vocabBookWords?: Map<string, { phonetic?: string; pos?: string; definition?: string }>): string {
  return lines
    .map((line) => {
      if (line.isParagraphBreak) return '<span class="enlearn-para-break" style="display:block !important;height:0.8em"></span>';
      const textHtml = markNewWords(line.text, newWords, vocabBookWords);
      const pad = line.indent > 0 ? `padding-left:${line.indent}em;` : "";
      // 保留缩进，不加透明度（depth 全为 0）
      return `<span class="enlearn-line enlearn-indent-${line.indent} enlearn-depth-0" style="display:block !important;${pad}">${textHtml}</span>`;
    })
    .join("");
}

function renderL3(lines: ChunkedLine[], newWords: { word: string; definition: string }[], vocabBookWords?: Map<string, { phonetic?: string; pos?: string; definition?: string }>): string {
  return lines
    .map((line) => {
      if (line.isParagraphBreak) return '<span class="enlearn-para-break" style="display:block !important;height:0.8em"></span>';
      const textHtml = markNewWords(line.text, newWords, vocabBookWords);
      // 只分行，不缩进（所有行左对齐）
      return `<span class="enlearn-line enlearn-indent-0 enlearn-depth-0" style="display:block !important">${textHtml}</span>`;
    })
    .join("");
}

function renderL2(lines: ChunkedLine[], newWords: { word: string; definition: string }[], vocabBookWords?: Map<string, { phonetic?: string; pos?: string; definition?: string }>): string {
  const groups: string[] = [];
  let current = "";

  for (const line of lines) {
    if (line.indent === 0 && current) {
      groups.push(current);
      current = line.text;
    } else {
      current += (current ? " " : "") + line.text;
    }
  }
  if (current) groups.push(current);

  const parts = groups.map((text) => markNewWords(text, newWords, vocabBookWords));
  const html = parts.join('<span class="enlearn-separator">\u00B7</span>');

  return `<span class="enlearn-inline-content">${html}</span>`;
}

function renderL1(lines: ChunkedLine[], newWords: { word: string; definition: string }[], vocabBookWords?: Map<string, { phonetic?: string; pos?: string; definition?: string }>): string {
  const parts = lines.map((line) => {
    if (line.isParagraphBreak) return " ";
    const textHtml = markNewWords(line.text, newWords, vocabBookWords);
    if (line.indent > 0) {
      // 从句/修饰部分变淡，主句保持正常
      return `<span class="enlearn-dim">${textHtml}</span>`;
    }
    return textHtml;
  });

  return `<span class="enlearn-inline-content">${parts.join(" ")}</span>`;
}

/**
 * 将 ChunkResult 渲染为 HTML 字符串
 * @param result 分块结果
 * @param intensity 显示强度 1-5
 * @param vocabBookWords 生词本中的单词及其信息（会有特殊样式）
 */
export function renderChunkedHtml(result: ChunkResult, intensity: number = 5, vocabBookWords?: Map<string, { phonetic?: string; pos?: string; definition?: string }>): string {
  if (result.isSimple) return "";

  const lines = parseChunkedText(result.chunked);
  const isInline = intensity <= 2;
  const containerClass = isInline ? "enlearn-chunked enlearn-chunked-inline" : "enlearn-chunked";

  let linesHtml: string;
  switch (intensity) {
    case 1:
      linesHtml = renderL1(lines, result.newWords, vocabBookWords);
      break;
    case 2:
      linesHtml = renderL2(lines, result.newWords, vocabBookWords);
      break;
    case 3:
      linesHtml = renderL3(lines, result.newWords, vocabBookWords);
      break;
    case 4:
      linesHtml = renderL4(lines, result.newWords, vocabBookWords);
      break;
    default:
      linesHtml = renderL5(lines, result.newWords, vocabBookWords);
      break;
  }

  const containerStyle = isInline ? "" : ' style="display:block !important"';
  return `<div class="${containerClass}"${containerStyle} data-original="${escapeHtml(result.original)}">${linesHtml}</div>`;
}

/**
 * 创建分块 DOM 元素
 * @param result 分块结果
 * @param intensity 显示强度 1-5
 * @param vocabBookWords 生词本中的单词及其信息（会有特殊样式）
 */
export function createChunkedElement(result: ChunkResult, intensity: number = 5, vocabBookWords?: Map<string, { phonetic?: string; pos?: string; definition?: string }>): HTMLElement | null {
  if (result.isSimple) return null;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderChunkedHtml(result, intensity, vocabBookWords);
  return wrapper.firstElementChild as HTMLElement;
}
