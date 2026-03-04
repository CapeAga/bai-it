# 掰it — 交接状态

> 每个 session 开始时先看这个文件，结束时更新它。

## 当前状态

**Phase 2 编码 + 生词 Tooltip + 掌握标记 — 全部完成并提交。** 199 个单元测试全通过，构建正常。已完成浏览器基本验收。

### 本次完成（0304 Options 生词 Tooltip + 掌握标记）

**生词 Tooltip + 掌握标记 — 全部 7 步完成：**

1. **useMasteredWords context** (`src/options/hooks/useMasteredWords.ts` 新建)
   - `MasteredWordsContext` + `useMasteredWordsProvider` + `useMasteredWords`
   - 加载/持久化 `chrome.storage.local.knownWords`
   - `toggleMastered(word)` — toggle Set + 同步 IndexedDB vocabDAO

2. **ChunkLines 改造** (`src/options/components/ChunkLines.tsx`)
   - vocab span 加 `data-word` / `data-def` 属性
   - 已掌握词加 `.vocab-mastered` class（`color: inherit` 融入所在行颜色）

3. **WordTooltip 全局组件** (`src/options/components/WordTooltip.tsx` 新建)
   - document 级事件委托（mouseover/mouseout `.vocab[data-def]`）
   - 精致暗色毛玻璃风格：`filter: drop-shadow` 双层阴影 + `border-top` 光感
   - SVG 箭头（继承 drop-shadow）
   - `scale(0.96→1) + opacity` 入场动画
   - 两阶段定位：render → useLayoutEffect 测量 → 精确定位
   - 展示词名（红色）+ 释义 + 低调掌握按钮（圆圈/对勾图标）

4. **App.tsx 挂载** — `MasteredWordsContext.Provider` 包裹 + `WordTooltip`

5. **Sentences.tsx** — VocabPill 接入 `useMasteredWords`

6. **DailyReview.tsx** — 删除本地 `masteredIds`，改用共享 context

7. **CSS** — `.vocab-mastered`（color: inherit）、`.vt` 系列 tooltip 样式

**额外修复：**
- VocabPill 按钮 `stopPropagation` 防止卡片收起
- 断句练习 `.break-point` 点击区扩大（`::before` 画 3px 竖线，外层 15px 透明点击区）
- 看答案按钮与卡片间距修复（`marginTop: 16px`）

### 上次 session 完成（0304 Phase 2 编码）

**Phase 2 数据采集 + 管理端懒处理 — 全部 6 步编码完成：**

1. **类型定义** — `PendingSentenceRecord`、`FullAnalysisResult`、新消息类型
2. **数据层** — DB_VERSION 1→2，`pending_sentences` 表，`pendingSentenceDAO`
3. **单元测试** — 10 个新测试覆盖 CRUD、去重、排序、分页、v1→v2 升级
4. **LLM 适配层** — `analyzeSentenceFull()` 独立 prompt + JSON 解析
5. **Background** — `saveSentence` / `analyzeSentences` handler，逐条分析 + 500ms 限流
6. **难句集 Tab** — pending + analyzed 混合列表、自动触发分析、实时填充、分页

### 注意事项

- **IndexedDB 数据库名保持 `openen-data` / `openen-cache`**，改名会丢失已有用户数据
- **图标两套 PNG**：`icons/icon*.png`（默认无绿点）+ `icons/icon*-on.png`（启用态有绿点），background 通过 `chrome.action.setIcon()` 动态切换
- **辅助力度滑杆映射**：1-5 档同时控制 `chunkGranularity`（拆分规则激进度）和 `scanThreshold`（扫读最小词数），见 `src/popup/index.ts` ASSIST_TO_CONFIG
- **DOM 插入双策略**：`insertChunkedElement()` 根据是否有截断容器选择策略 A 或 B，见 `src/content/index.ts`
- **Twitter 导航兼容**：策略 A 用 `dispatchEvent` 到原始元素的 React Fiber 节点保持 React 事件委托正常工作。短文本（< 8 词）不处理，避免干扰推文交互

---

## 下一步

**浏览器验收（完整流程）**：
1. 浏览英文网页 → DevTools IndexedDB `openen-data` → `pending_sentences` 表有数据
2. 数据去重：同一句子只存一次
3. 手动触发的句子 `manual: true`
4. 打开管理端难句集 Tab → 看到 pending 卡片 + "分析中..." badge
5. 有 API key 时 → LLM 分析结果逐条填充，卡片变为 analyzed 状态
6. 分页可用（> 10 条时显示翻页）
7. v1→v2 升级：旧数据库用户首次打开不丢数据
8. 总览 Tab → hover 红色词 → tooltip 显示释义 + "掌握"按钮
9. 点击"掌握" → 词融入所在行颜色（主干白/缩进灰），tooltip 消失
10. 切 Tab → 掌握状态跨 Tab 共享
11. 刷新页面 → 掌握状态持久化

---

## 已确定的视觉方向：「锐 Sharp」

- 暗色系 #09090b + 红色 #ef4444
- Logo：ZCOOL KuaiLe 400 + Nunito 600
- UI：Syne 800（标题/数字）+ Space Grotesk 400/500（正文）
- 毛玻璃卡片 + 红色渐变边框 + noise 纹理 + 红色极光呼吸

## Playground 文件索引

| 文件 | 用途 |
|------|------|
| `playground-pages.html` | **六页面设计原型（定稿）**：总览 / Popup / 每日回味 / Content Script / 难句集 / 设置 |
| `playground-onboarding.html` | **引导态设计原型（定稿）**：三种状态切换（无 key / 有 key 无数据 / 有真实数据），示例数据 + 提示条 |
| `playground-vocab-tooltip.html` | **生词 Tooltip + 掌握态设计**：三种 tooltip 风格 + 掌握态对比（已选定"精致"风格 + inherit 融入） |
| `playground-logo-final.html` | **Logo 定稿确认**（ZCOOL KuaiLe + Nunito 600）|
| `playground-visual-directions.html` | 三种字体方向对比（已选定「锐 Sharp」）|
| `playground-logo-v5.html` | Logo 可爱度 12 档梯度微调 |
| `playground-logo-v4.html` | Logo 24 种字体组合探索 |
| `playground-logo-v3.html` | Logo v3 重新思考（一个词原则）|
| `playground-logo.html` | Logo v2 早期 10 方向探索（已过时）|
| `mockup-popup.html` | 早期 Popup 原型（白色版，已过时）|
| `mockup-scan-mode.html` | 扫读模式 mockup（讨论用）|

## 关键决策记录

### 三层体验模型（0303 新，替代原两层产品模型）
- **第一层**：装完即用 — 所有英文网页自动扫读，本地拆分 + 标生词，零配置
- **第二层**：手动掰句 — 用户点哪句拆哪句，无 API 时本地强制拆
- **第三层**：LLM 深度分析 — 有 API 时手动触发走 LLM，结果存管理端
- 详见 `docs/prd.md`「三层体验模型」章节

### 统一扫读（0303 新，替代原两种阅读模式）
- **不再区分扫读/细读**，删除 `detectReadingMode()` 站点列表
- 所有英文网页统一自动扫读 + 手动触发按需深入
- 详见 `docs/prd.md`「自动扫读 + 手动掰句」章节

### DOM 插入双策略（0304 新）
- **策略 A**：信息流（Twitter/Reddit，有 overflow:hidden 截断）→ 隐藏容器 + 兄弟插入 + dispatchEvent 保留导航
- **策略 B**：文章站（Substack/Medium，无截断）→ in-place 替换 + stopPropagation 防 React 清除
- 向上遍历遇到 `<a>` / `<article>` 边界停止，不破坏导航结构

### 数据采集懒处理（0303 新）
- 浏览时：原始句子存 `pending_sentences` 表（零成本）
- 管理端：打开时按页发 LLM（每页 10 条），翻页再发下一批
- 分析结果缓存到 `learning_records`，不重复发
- 详见 `docs/prd.md`「数据采集策略」章节

### 生词 Tooltip 设计（0304 新）
- **Tooltip 风格**：精致 — 词名（红色）+ 释义 + 低调掌握按钮
- **视觉**：`filter: drop-shadow` 双层阴影 + `border-top` 光感 + SVG 箭头 + `scale(0.96→1)` 动画
- **掌握态**：`color: inherit` — 融入所在行颜色（主干行白色、缩进行灰色）
- **持久化**：`chrome.storage.local.knownWords` + IndexedDB 双写

### 生词标注方案
- **不直接显示中文释义**，用 hover 虚线（避免视觉干扰）
- **三层词汇源**：行业术语包（V1 必须有 AI 包）> 通用离线词典 > LLM 语境化释义
- 所有元素（含未拆分的）都会标注生词

### 学习系统（管理端 Options 页）
- **页面结构**：四个 Tab——总览、每日回味、难句集、设置
- **核心单位是句子不是单词**：不做"生词本"，做"难句集"
- **难句卡片 6 层**：原句 → 句式标签 → 分块 → 句式讲解 → 学会表达 → 生词

### 技术栈
- 构建工具：ESBuild（沿用旧项目，加 React JSX 支持）
- 单包结构，不做 monorepo
- 浏览器测试：Puppeteer

## 已完成

- [x] Step 1-9 编码全部完成
- [x] 品牌命名 + 语言体系 + 视觉方向 + Logo 定稿
- [x] 六页面原型定稿 + 设计规范归档
- [x] Options Puppeteer 验收（39 断言 + 4 Tab 截图）
- [x] 产品方向调整 — ~~两层产品模型~~ → 三层体验模型
- [x] P0 修复：扫读模式生词释义
- [x] Popup UI 改造（锐 Sharp）
- [x] 全局改名 OpenEn → 掰it
- [x] 修复扫读模式拆分过少 + background 报错 + Tooltip 样式优化
- [x] 管理端示例数据 + 提示条（Puppeteer 截图验收通过）
- [x] 统一扫读架构讨论 + 文档更新（prd.md / architecture.md / testing.md）
- [x] **Phase 1 统一扫读重构 + Twitter/Substack 兼容**（编码 + 验证通过）
- [x] **Phase 2 数据采集 + 管理端懒处理**（编码完成，199 测试通过）
- [x] **Options 生词 Tooltip + 掌握标记**（精致风格 + inherit 融入 + 持久化）

## 编码细节

### 构建配置
- **ESM** 仅用于 background service worker（MV3 要求 `type: module`）
- **IIFE** 用于 content script、popup、options（Chrome 不支持 content script ESM）
- content.js 包含词汇数据打包后 102KB（minified），可接受

### 数据文件（data/）
- `word-frequency.json`：5000 常用词（来源：Google Trillion Word Corpus top 5000）
- `dict-ecdict.json`：~250 个精选词汇中文释义（MVP 子集，生产可扩展）
- `industry-ai.json`：~80 个 AI 行业术语及中文释义

### IndexedDB 数据层
- **数据库**：`openen-data`（与缓存数据库 `openen-cache` 独立）— 名称保持不改，避免丢失用户数据
- **10 张表**：原 9 张 + `pending_sentences`
- **全局规则**：UUID 主键、`updated_at` + `is_dirty`（V2 同步预留）、`onupgradeneeded` schema 版本管理
- **SM-2 算法**：review_items 表内置间隔重复
- **settings 表**：键值对存储，给 Options 页学习系统用。Popup/Background 的 LLM 配置仍走 `chrome.storage.sync`
- **测试**：fake-indexeddb mock，68 个单元测试覆盖全部表 CRUD + SM-2 + 跨表业务场景 + v1→v2 升级

### 浏览器测试
- Puppeteer 做浏览器验收测试
- 冒烟测试：`tests/acceptance/smoke-test.mjs`
- 扫读模式测试：`tests/acceptance/scan-mode-basic.mjs`
- Options 页测试：`tests/acceptance/options-test.mjs`
- 引导态截图：`tests/acceptance/onboarding-screenshots.mjs`

### Chrome 调试 profile 问题
旧的 `~/.chrome-debug-profile/` 无法加载扩展。新 profile `~/.chrome-debug-profile-2/` 可以正常加载但缺少 Reddit 登录状态。建议：在用户主力 Chrome 中手动加载 dist/ 目录测试。

## 参考文件

- 旧项目：`/Users/liuyujian/Documents/Enlearn/`
- 新项目规划原文：`/Users/liuyujian/Documents/Enlearn/newproject.md`
- 扫读模式视觉 mockup：`mockup-scan-mode.html`（讨论用）
