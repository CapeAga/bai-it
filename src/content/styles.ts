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
  background: rgba(16, 16, 18, 0.96);
  color: #e2e8f0;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  z-index: 2147483647;
  pointer-events: auto;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  display: none;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  min-width: 220px;
  max-width: 320px;
  white-space: normal;
}

.enlearn-tooltip.enlearn-tooltip-sentence {
  background: transparent;
  box-shadow: none;
  padding: 0;
  min-width: 260px;
  max-width: 380px;
}

.enlearn-tooltip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.enlearn-tooltip-head-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.enlearn-tooltip-word {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
}

.enlearn-tooltip-phonetic {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.92);
}

.enlearn-tooltip-audio,
.enlearn-tooltip-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1.5px solid rgba(255,255,255,0.12);
  border-radius: 999px;
  color: rgba(255,255,255,0.25);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  line-height: 1;
  flex-shrink: 0;
  padding-inline: 8px;
}

.enlearn-tooltip-audio:hover {
  background: rgba(96, 165, 250, 0.14);
  border-color: rgba(96, 165, 250, 0.45);
  color: #93c5fd;
}

.enlearn-tooltip-audio {
  min-width: 64px;
  height: 30px;
  padding-inline: 10px;
  background: rgba(96, 165, 250, 0.1);
  border-color: rgba(96, 165, 250, 0.24);
  color: #dbeafe;
}

.enlearn-tooltip-btn:hover {
  background: rgba(34,197,94,0.15);
  border-color: rgba(34,197,94,0.5);
  color: #4ade80;
}

.enlearn-tooltip-section {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.enlearn-tooltip-label {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
}

.enlearn-tooltip-en {
  color: #f8fafc;
}

.enlearn-tooltip-zh {
  color: #cbd5e1;
}

.enlearn-tooltip-example {
  color: rgba(226, 232, 240, 0.82);
  font-size: 12px;
}

.enlearn-tooltip-loading,
.enlearn-tooltip-fallback {
  color: rgba(148, 163, 184, 0.9);
  font-size: 12px;
}

.enlearn-tooltip-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.enlearn-tooltip-toggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(96, 165, 250, 0.22);
  background: rgba(96, 165, 250, 0.08);
  color: #dbeafe;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
}

.enlearn-tooltip-toggle:hover {
  background: rgba(96, 165, 250, 0.16);
  border-color: rgba(96, 165, 250, 0.36);
  color: #eff6ff;
}

.enlearn-sentence-assist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid rgba(148, 163, 184, 0.18);
  color: #0f172a;
  font-family: inherit;
}

.enlearn-sentence-assist-floating {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(148, 163, 184, 0.24);
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.22);
  backdrop-filter: blur(10px);
}

.enlearn-sentence-assist-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.enlearn-sentence-assist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.enlearn-sentence-assist-label {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(71, 85, 105, 0.8);
}

.enlearn-sentence-assist-text,
.enlearn-sentence-assist-chinese,
.enlearn-sentence-assist-note,
.enlearn-sentence-assist-hint,
.enlearn-sentence-assist-loading {
  font-size: 13px;
  line-height: 1.5;
  color: #0f172a;
}

.enlearn-sentence-assist-note,
.enlearn-sentence-assist-hint,
.enlearn-sentence-assist-loading {
  color: #475569;
}

.enlearn-sentence-assist-audio,
.enlearn-sentence-assist-toggle,
.enlearn-sentence-assist-learning-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 999px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
}

.enlearn-sentence-assist-audio {
  min-width: 72px;
  height: 34px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid rgba(37, 99, 235, 0.2);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
}

.enlearn-sentence-assist-toggle {
  align-self: flex-start;
  min-height: 28px;
  padding: 0 12px;
  font-size: 12px;
  border: 1px solid rgba(37, 99, 235, 0.16);
  background: rgba(255,255,255,0.65);
  color: rgba(30, 41, 59, 0.82);
}

.enlearn-sentence-assist-learning-toggle {
  align-self: flex-start;
  min-height: 28px;
  padding: 0 12px;
  font-size: 12px;
  border: 1px dashed rgba(100, 116, 139, 0.28);
  background: rgba(148, 163, 184, 0.06);
  color: #475569;
}

.enlearn-sentence-assist-audio:hover {
  background: rgba(37, 99, 235, 0.14);
  border-color: rgba(37, 99, 235, 0.34);
  color: #1e40af;
}

.enlearn-sentence-assist-toggle:hover {
  background: rgba(37, 99, 235, 0.08);
  border-color: rgba(37, 99, 235, 0.28);
  color: #1d4ed8;
}

.enlearn-sentence-assist-learning-toggle:hover {
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(100, 116, 139, 0.36);
  color: #334155;
}

.enlearn-audio-icon {
  display: inline-flex;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.enlearn-audio-icon svg {
  width: 14px;
  height: 14px;
}

.enlearn-audio-text {
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
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
body.enlearn-paused .enlearn-sentence-assist { display: none !important; }
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

  .enlearn-tooltip-audio,
  .enlearn-tooltip-btn {
    border-color: rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.2);
  }

  .enlearn-tooltip-toggle {
    background: rgba(96, 165, 250, 0.12);
    border-color: rgba(96, 165, 250, 0.24);
    color: #dbeafe;
  }

  .enlearn-tooltip-audio {
    background: rgba(96, 165, 250, 0.12);
    border-color: rgba(96, 165, 250, 0.28);
    color: #dbeafe;
  }

  .enlearn-sentence-assist {
    background: rgba(15, 23, 42, 0.55);
    border-color: rgba(148, 163, 184, 0.18);
    color: #e5eefb;
  }

  .enlearn-sentence-assist-floating {
    background: rgba(15, 23, 42, 0.94);
    box-shadow: 0 12px 32px rgba(0,0,0,0.4);
  }

  .enlearn-sentence-assist-label,
  .enlearn-sentence-assist-text,
  .enlearn-sentence-assist-chinese,
  .enlearn-sentence-assist-note,
  .enlearn-sentence-assist-hint,
  .enlearn-sentence-assist-loading {
    color: rgba(226, 232, 240, 0.9);
  }

  .enlearn-sentence-assist-audio,
  .enlearn-sentence-assist-toggle,
  .enlearn-sentence-assist-learning-toggle {
    background: rgba(15, 23, 42, 0.42);
    border-color: rgba(148, 163, 184, 0.18);
    color: rgba(226, 232, 240, 0.84);
  }

  .enlearn-sentence-assist-audio {
    background: rgba(96, 165, 250, 0.16);
    border-color: rgba(96, 165, 250, 0.28);
    color: #dbeafe;
  }

  .enlearn-sentence-assist-learning-toggle {
    border-style: dashed;
    background: rgba(148, 163, 184, 0.08);
    color: rgba(226, 232, 240, 0.72);
  }

  .enlearn-sentence-assist-audio:hover,
  .enlearn-sentence-assist-toggle:hover,
  .enlearn-sentence-assist-learning-toggle:hover {
    background: rgba(96, 165, 250, 0.14);
    border-color: rgba(96, 165, 250, 0.32);
    color: #bfdbfe;
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
`;
