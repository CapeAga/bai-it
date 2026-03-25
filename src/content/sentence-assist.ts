import { AUDIO_BUTTON_INNER } from "./audio-button.ts";

export interface SentenceAssistCardState {
  sentence: string;
  simplerEnglish: string;
  backupChinese: string;
  learningPoint: string;
  chineseExpanded: boolean;
  learningPointExpanded: boolean;
  loading: boolean;
  hasApiKey: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSentenceAssistCard(state: SentenceAssistCardState): string {
  const englishSection = state.loading
    ? `
      <div class="enlearn-sentence-assist-section">
        <div class="enlearn-sentence-assist-loading">正在生成更容易懂的英文解释...</div>
      </div>
    `
    : state.simplerEnglish
      ? `
        <div class="enlearn-sentence-assist-section">
          <div class="enlearn-sentence-assist-text">${escapeHtml(state.simplerEnglish)}</div>
        </div>
      `
      : "";

  const chineseSection = state.backupChinese
    ? state.chineseExpanded
      ? `
        <div class="enlearn-sentence-assist-section">
          <button class="enlearn-sentence-assist-toggle" type="button">收起中文</button>
          <div class="enlearn-sentence-assist-chinese">${escapeHtml(state.backupChinese)}</div>
        </div>
      `
      : `
        <div class="enlearn-sentence-assist-section">
          <button class="enlearn-sentence-assist-toggle" type="button">还没顺过来？展开中文</button>
        </div>
      `
    : "";

  const learningPointSection = state.learningPoint
    ? state.learningPointExpanded
      ? `
        <div class="enlearn-sentence-assist-section">
          <button class="enlearn-sentence-assist-learning-toggle" type="button">收起学习点</button>
          <div class="enlearn-sentence-assist-note">${escapeHtml(state.learningPoint)}</div>
        </div>
      `
      : `
        <div class="enlearn-sentence-assist-section">
          <button class="enlearn-sentence-assist-learning-toggle" type="button">顺手学一点</button>
        </div>
      `
    : "";

  const fallbackSection = !state.hasApiKey && !state.loading
    ? `
      <div class="enlearn-sentence-assist-section">
        <div class="enlearn-sentence-assist-hint">先顺着结构看，不够再听一遍。</div>
      </div>
    `
    : "";

  return `
    <div class="enlearn-sentence-assist-head">
      <div class="enlearn-sentence-assist-label">Simpler English</div>
      <button class="enlearn-sentence-assist-audio" type="button" title="英式整句朗读">
        ${AUDIO_BUTTON_INNER}
      </button>
    </div>
    ${englishSection}
    ${chineseSection}
    ${learningPointSection}
    ${fallbackSection}
  `;
}
