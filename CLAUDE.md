# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 掰it — 项目指南

掰it 是一个纯本地 Chrome/Firefox 扩展，帮助用户在浏览英文网页时拆解长句结构、标注生词。零后端、零登录。

详见 [README.md](./README.md)。

## 开发

```bash
npm install              # 安装依赖
npm run build            # 构建到 dist/
npm run build:firefox    # 构建 + 打包 Firefox 版本
npm test                 # 运行全部单元测试（Vitest）
npm test -- scan-rules   # 运行指定测试文件
npm run dev              # 开发模式（watch + sourcemap）
```

构建产物在 `dist/` 目录。Chrome 加载 `dist/`，Firefox 需要先运行 `npm run build:firefox` 生成 zip 后解压安装。

## 发布

**当用户表达"可以发版了"的意图时（不限于特定措辞），Claude 自主执行完整发布流程，用户不需要跑任何命令。** 详见 [docs/release.md](./docs/release.md)。

流程概要：确认版本号 → 改 manifest.json → `npm run release` → git commit + tag + push → `gh release create` → 提醒用户手动上传商店 → 清理 zip。

商店上传是唯一需要用户手动操作的步骤（需要登录网页后台）。

## 项目结构

```
src/
├── background/    # Service Worker（MV3）
├── content/       # Content Script（网页注入）
├── popup/         # 插件弹窗
├── options/       # 管理页面（React）
└── shared/        # 共享模块
    ├── browser-api.ts     # 跨浏览器 API 兼容层（统一 Chrome/Firefox API）
    ├── db.ts              # IndexedDB 数据层（10 张表）
    ├── llm-adapter.ts     # LLM 适配层（Gemini + OpenAI 兼容格式）
    ├── scan-rules.ts      # 本地拆分规则
    ├── rule-engine.ts     # 英文检测 + 复杂度估算
    ├── vocab.ts           # 生词标注逻辑
    └── types.ts           # 类型定义
data/              # 词频表 + 离线词典（ECDICT）+ 行业术语包
tests/             # 单元测试
docs/              # 产品需求 / 设计规范 / 技术架构
```

## 跨浏览器兼容性

使用 `src/shared/browser-api.ts` 统一 API 入口：

```typescript
import { storage, runtime, tabs, action } from "./shared/browser-api.ts";
// 代替 chrome.storage.sync.get(...)
const result = await storage.sync.get(keys);
```

Firefox 打包由 `scripts/package-firefox.mjs` 处理：修改 manifest.json 的 `browser_specific_settings.gecko` 和 `background.scripts`。

## 构建配置

- **ESM** 仅用于 background service worker（MV3 要求 `type: module`）
- **IIFE** 用于 content script、popup、options（Chrome 不支持 content script ESM）
- 构建工具：ESBuild（`build.mjs`），不使用 Vite/Webpack/Plasmo

## 数据存储

- **IndexedDB**（`openen-data`）：学习记录、生词、待分析句子（10 张表，见 `docs/architecture.md`）
- **chrome.storage.sync**：LLM 配置、站点开关等用户偏好
- **chrome.storage.local**：已掌握词列表

## 核心逻辑

### 两级分块：本地优先，LLM 兜底

```
句子 → 本地规则判断 → 能拆？→ 本地拆分（即时）→ 离线词典标注生词
                  ↘ 不能？→ LLM 拆分（1-2s）→ 语境化释义
```

- 本地规则：`scan-rules.ts`（长度阈值 + 逻辑转换点断行）
- LLM 适配：`llm-adapter.ts`（Gemini + OpenAI 兼容格式）

### 生词标注三层词汇源

1. 行业术语包（`data/industry-*.json`）优先
2. 离线词典（`data/dict-ecdict.json`）
3. LLM 语境化释义（仅调 LLM 时）

## 文档

| 文档 | 内容 |
|------|------|
| [docs/prd.md](./docs/prd.md) | 产品需求：用户痛点、三层体验模型、功能范围 |
| [docs/design.md](./docs/design.md) | 设计规范：视觉风格、品牌、各模块 UI |
| [docs/architecture.md](./docs/architecture.md) | 技术架构：模块设计、数据模型、关键决策 |
| [docs/testing.md](./docs/testing.md) | 测试：验收标准、测试方法 |
| [docs/release.md](./docs/release.md) | 发布流程：版本号 → 打包 → 推送 → 上架 Chrome + Edge |
| [docs/workflow.md](./docs/workflow.md) | 文件组织 + Git 工作流 + 日常操作指引 |

### 内部文档（`_local/`，不进 git）

| 文档 | 内容 |
|------|------|
| [_local/HANDOFF.md](./_local/HANDOFF.md) | 交接状态：当前进度、上次改了什么、下一步 |
| [_local/backlog.md](./_local/backlog.md) | 需求池：想法收集、优先级管理（`/bai-idea` 快速记录） |
| `_local/playgrounds/` | 设计原型 HTML |
| `_local/mockups/` | UI Mockup HTML |
| `_local/store-assets/` | 商店提交文档 + 截图 |
