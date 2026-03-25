import { AUDIO_BUTTON_INNER } from "./audio-button.ts";

export interface WordAssistTooltipState {
  word: string;
  phonetic: string;
  chineseHint: string;
  simpleEnglish: string;
  example: string;
  loading: boolean;
  markable: boolean;
  chineseExpanded: boolean;
  hasApiKey: boolean;
  requestFailed: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderWordAssistTooltip(
  state: WordAssistTooltipState,
  isMastered: boolean
): string {
  const hasEnglishLayer = Boolean(state.simpleEnglish) || state.loading;
  const shouldShowRetryHint = state.hasApiKey && state.requestFailed;

  const englishSection = state.simpleEnglish
    ? `
      <div class="enlearn-tooltip-section">
        <div class="enlearn-tooltip-en">${escapeHtml(state.simpleEnglish)}</div>
        ${state.example ? `<div class="enlearn-tooltip-example">${escapeHtml(state.example)}</div>` : ""}
      </div>
    `
    : state.loading
      ? `
        <div class="enlearn-tooltip-section">
          <div class="enlearn-tooltip-loading">Generating a simpler English explanation...</div>
        </div>
      `
      : shouldShowRetryHint
        ? `
          <div class="enlearn-tooltip-section">
            <div class="enlearn-tooltip-loading">这次没拿到更贴语境的解释，稍后再试一次。</div>
          </div>
        `
      : "";

  const chineseSection = (hasEnglishLayer || shouldShowRetryHint)
    ? state.chineseExpanded
      ? `
        <div class="enlearn-tooltip-section">
          <button class="enlearn-tooltip-toggle" type="button">收起中文</button>
          <div class="enlearn-tooltip-zh">${escapeHtml(state.chineseHint)}</div>
        </div>
      `
      : `
        <div class="enlearn-tooltip-section">
          <button class="enlearn-tooltip-toggle" type="button">没看懂？展开中文</button>
        </div>
      `
    : `
      <div class="enlearn-tooltip-section">
        <div class="enlearn-tooltip-zh">${escapeHtml(state.chineseHint)}</div>
      </div>
    `;

  const markButton = state.markable
    ? `<button class="enlearn-tooltip-btn" title="标记为已掌握">${isMastered ? "✓ 已掌握" : "标记掌握"}</button>`
    : `<span></span>`;

  return `
    <div class="enlearn-tooltip-head">
      <div class="enlearn-tooltip-head-main">
        <div class="enlearn-tooltip-word">${escapeHtml(state.word)}</div>
        ${state.phonetic ? `<div class="enlearn-tooltip-phonetic">${escapeHtml(state.phonetic)}</div>` : ""}
      </div>
      <button class="enlearn-tooltip-audio" title="英式发音">${AUDIO_BUTTON_INNER}</button>
    </div>
    ${englishSection}
    ${chineseSection}
    <div class="enlearn-tooltip-actions">
      <span></span>
      ${markButton}
    </div>
  `;
}
