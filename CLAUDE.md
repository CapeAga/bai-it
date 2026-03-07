# 掰it — 项目指南

## 项目简介

掰it 是一个纯本地 Chrome 扩展，帮助用户在浏览英文网页时拆解长句结构、标注生词。零后端、零登录。

详见 [README.md](./README.md)。

## 开发

```bash
npm install        # 安装依赖
npm run build      # 构建到 dist/
npm test           # 运行单元测试（Vitest）
npm run release    # 发布：跑测试 + 构建 + 打包 bai-it.zip
```

构建产物在 `dist/` 目录，加载到 Chrome 的开发者模式即可测试。

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
│   ├── components/
│   ├── hooks/
│   └── tabs/
└── shared/        # 共享模块（DB、LLM、词汇、规则引擎）
data/              # 词频表 + 离线词典
tests/             # 单元测试 + 浏览器验收测试
docs/              # 产品需求 / 设计规范 / 技术架构
_local/            # 内部文件（.gitignore 排除，不进 git）
```

## 构建配置

- **ESM** 仅用于 background service worker（MV3 要求 `type: module`）
- **IIFE** 用于 content script、popup、options（Chrome 不支持 content script ESM）

## 数据存储

- **IndexedDB**（`openen-data`）：学习记录、生词、待分析句子等
- **chrome.storage.sync**：LLM 配置、站点开关等用户偏好
- **chrome.storage.local**：已掌握词列表

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
| `_local/playgrounds/` | 设计原型 HTML |
| `_local/mockups/` | UI Mockup HTML |
| `_local/store-assets/` | 商店提交文档 + 截图 |
