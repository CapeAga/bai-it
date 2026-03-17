/**
 * 生成插件注入的 CSS
 * 设计原则：克制、优雅，不抢视觉焦点，但让结构一目了然
 */
export const ENLEARN_STYLES = `
/* 分块容器 — 不用 position:relative，避免挡住 Reddit 等站点的覆盖导航链接 */
.enlearn-chunked {
  display: block !important;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.5;
  padding: 0;
  margin: 1px 0;
  background: transparent;
  border-radius: 0;
  transition: background 0.2s;
}

.enlearn-chunked:hover {
  background: rgba(37, 99, 235, 0.03);
}

/* 段落间距 */
.enlearn-para-break { display: block !important; height: 0.8em; }

/* 缩进层级 */
.enlearn-line { display: block !important; }
.enlearn-indent-0 { padding-left: 0; }
.enlearn-indent-1 { padding-left: 1.0em; }
.enlearn-indent-2 { padding-left: 2.0em; }
.enlearn-indent-3 { padding-left: 3.0em; }
.enlearn-indent-4 { padding-left: 4.0em; }
.enlearn-indent-5 { padding-left: 5.0em; }

/* 颜色层级 — 主句正常色，从句逐级变淡 */
.enlearn-depth-0 { opacity: 1; }
.enlearn-depth-1 { opacity: 0.75; }
.enlearn-depth-2 { opacity: 0.55; }
.enlearn-depth-3 { opacity: 0.45; }
.enlearn-depth-4 { opacity: 0.38; }
.enlearn-depth-5 { opacity: 0.32; }

/* L2/L1：inline 模式容器 */
.enlearn-chunked-inline .enlearn-inline-content {
  display: inline;
}

/* L2：行内分隔符 */
.enlearn-separator {
  margin: 0 0.3em;
  color: rgba(37, 99, 235, 0.35);
  user-select: none;
  font-weight: 400;
}

/* L1：从句变淡 */
.enlearn-dim {
  opacity: 0.5;
}

/* 生词轻标记 */
.enlearn-word {
  border-bottom: 1px dotted rgba(37, 99, 235, 0.45);
  cursor: pointer;
  transition: border-color 0.15s;
}

.enlearn-word:hover {
  border-bottom-color: #2563eb;
}

/* 全局浮窗 — position:fixed 挂在 body，永远不被容器裁剪 */
.enlearn-tooltip {
  position: fixed;
  display: none;
  background: #1a1a2e;
  color: #e2e8f0;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  white-space: normal;
  max-width: 400px;
  z-index: 2147483647;
  pointer-events: auto;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  align-items: flex-start;
  gap: 8px;
}

.enlearn-tooltip-def {
  display: inline;
}

.enlearn-tooltip-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  margin-left: 2px;
  background: transparent;
  border: 1.5px solid rgba(255,255,255,0.12);
  border-radius: 50%;
  color: rgba(255,255,255,0.25);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  line-height: 1;
  flex-shrink: 0;
}

.enlearn-tooltip-btn:hover {
  background: rgba(34,197,94,0.15);
  border-color: rgba(34,197,94,0.5);
  color: #4ade80;
}

/* 手动触发按钮 — inline 显示，不会被 overflow:hidden 裁剪 */
.enlearn-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  width: 18px;
  height: 18px;
  margin-left: 6px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: rgba(37, 99, 235, 0.35);
  cursor: pointer;
  opacity: 0.2;
  transition: all 0.2s;
  user-select: none;
  padding: 0;
  line-height: 1;
  pointer-events: auto !important;
}

.enlearn-trigger svg {
  width: 14px;
  height: 14px;
}

.enlearn-trigger.enlearn-trigger-visible {
  opacity: 0.6;
}

.enlearn-trigger:hover {
  opacity: 1 !important;
  background: rgba(37, 99, 235, 0.08);
  color: #2563eb;
}

.enlearn-trigger.enlearn-trigger-loading {
  opacity: 1;
  pointer-events: none;
  animation: enlearn-pulse 1s ease-in-out infinite;
}

@keyframes enlearn-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

/* 加载中状态 — shimmer 效果 */
.enlearn-loading {
  position: relative;
  overflow: hidden;
}

.enlearn-loading::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(37, 99, 235, 0.06) 50%,
    transparent 100%
  );
  animation: enlearn-shimmer 1.5s ease-in-out infinite;
}

@keyframes enlearn-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* 隐藏原始元素（兄弟插入策略：原始元素隐藏，分块作为兄弟显示） */
.enlearn-original-hidden {
  display: none !important;
}

/* 覆盖截断样式，使分块内容完全可见（Twitter line-clamp / Reddit -webkit-box 等）
   注意：不在 CSS 中设 display:block，只在 JS 中对 webkit-box 元素设（避免破坏 flex 布局） */
.enlearn-clamp-override {
  -webkit-line-clamp: unset !important;
  -webkit-box-orient: unset !important;
  max-height: none !important;
  overflow: visible !important;
  text-overflow: unset !important;
}

/* 暂停状态 — 显示原文、隐藏分块 */
body.enlearn-paused .enlearn-chunked { display: none !important; }
body.enlearn-paused .enlearn-trigger { display: none !important; }
body.enlearn-paused .enlearn-original-hidden { display: block !important; }

/* 暗色模式适配 */
@media (prefers-color-scheme: dark) {
  .enlearn-chunked:hover {
    background: rgba(96, 165, 250, 0.05);
  }

  .enlearn-word {
    border-bottom-color: rgba(96, 165, 250, 0.45);
  }

  .enlearn-word:hover {
    border-bottom-color: #60a5fa;
  }

  .enlearn-tooltip {
    background: #0f0f1a;
    color: #e2e8f0;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  }

  .enlearn-tooltip-btn {
    border-color: rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.2);
  }

  .enlearn-trigger {
    color: rgba(96, 165, 250, 0.35);
  }

  .enlearn-trigger:hover {
    opacity: 1 !important;
    background: rgba(96, 165, 250, 0.12);
    color: #60a5fa;
  }

  .enlearn-separator {
    color: rgba(96, 165, 250, 0.35);
  }

  .enlearn-loading::after {
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(96, 165, 250, 0.08) 50%,
      transparent 100%
    );
  }

}

/* 右键翻译结果 */
.enlearn-translation-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 320px;
}

.enlearn-translation-text {
  font-size: 14px;
  line-height: 1.5;
  color: #e2e8f0;
}

.enlearn-translation-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.1);
}

.enlearn-keyword {
  font-size: 12px;
  padding: 3px 8px;
  background: rgba(139, 92, 246, 0.15);
  border-radius: 4px;
  color: #a78bfa;
}

.enlearn-keyword b {
  color: #c4b5fd;
  margin-right: 4px;
}

/* 单词详情（含音标、词性） */
.enlearn-word-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 300px;
}

.enlearn-word-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.enlearn-word-title {
  font-size: 16px;
  font-weight: 600;
  color: #c4b5fd;
}

.enlearn-word-phonetic {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  font-family: "Lucida Sans Unicode", serif;
}

.enlearn-word-pos {
  font-size: 11px;
  padding: 2px 6px;
  background: rgba(139, 92, 246, 0.2);
  border-radius: 3px;
  color: #a78bfa;
}

.enlearn-word-definition {
  font-size: 14px;
  line-height: 1.5;
  color: #e2e8f0;
}

.enlearn-word-example {
  font-size: 12px;
  color: rgba(255,255,255,0.6);
  font-style: italic;
  padding-left: 8px;
  border-left: 2px solid rgba(139, 92, 246, 0.3);
}

/* 错误提示 */
.enlearn-tooltip-error {
  color: #f87171;
  font-size: 13px;
}

/* 生词本单词（黄色下划线标记） */
.enlearn-vocab-word {
  border-bottom: 2px solid #f59e0b;
  background: rgba(245, 158, 11, 0.08);
  cursor: pointer;
  transition: all 0.15s;
}

.enlearn-vocab-word:hover {
  background: rgba(245, 158, 11, 0.15);
  border-bottom-color: #fbbf24;
}

/* 生词本按钮 */
.enlearn-vocab-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  margin-left: 4px;
  background: transparent;
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 4px;
  color: rgba(139, 92, 246, 0.5);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1;
}

.enlearn-vocab-btn:hover {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.5);
  color: #a78bfa;
}

.enlearn-vocab-btn-active {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.5);
  color: #f59e0b;
}

.enlearn-vocab-btn-active:hover {
  background: rgba(245, 158, 11, 0.25);
  border-color: #f59e0b;
  color: #fbbf24;
}

/* 关闭按钮（用于翻译结果、错误信息等持久悬浮框） */
.enlearn-tooltip-close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 50%;
  color: rgba(255,255,255,0.4);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  line-height: 1;
}

.enlearn-tooltip-close:hover {
  background: rgba(248, 113, 113, 0.15);
  border-color: rgba(248, 113, 113, 0.5);
  color: #f87171;
}

/* 错误结果容器 */
.enlearn-error-result {
  position: relative;
  padding-right: 28px;
}

/* 翻译结果和单词详情容器需要相对定位以放置关闭按钮 */
.enlearn-translation-result,
.enlearn-word-detail {
  position: relative;
  padding-right: 28px;
}

/* ========== 悬浮图标 ========== */

.enlearn-floating-icon {
  position: fixed;
  display: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
  cursor: pointer;
  z-index: 2147483647;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
  user-select: none;
  pointer-events: auto;
}

.enlearn-floating-icon-visible {
  opacity: 1;
  transform: scale(1);
}

.enlearn-floating-icon:hover {
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.5);
  transform: scale(1.1);
}

.enlearn-floating-icon:active {
  transform: scale(0.95);
}

.enlearn-floating-icon-logo {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1;
}

/* 暗色模式适配 */
@media (prefers-color-scheme: dark) {
  .enlearn-floating-icon {
    background: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%);
    box-shadow: 0 2px 8px rgba(129, 140, 248, 0.4);
  }

  .enlearn-floating-icon:hover {
    box-shadow: 0 4px 12px rgba(129, 140, 248, 0.55);
  }
}
`;
