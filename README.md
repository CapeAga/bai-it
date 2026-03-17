[English](./README_EN.md)

# 掰it

**英文太长？掰it.**

🌐 官网：[bai-it.app](https://bai-it.app)

掰it 是一个浏览器扩展，支持 Chrome 和 Firefox，帮你把英文网页上读不下去的长句"掰"成一段一段的，顺便帮你认生词。

装完就能用，不用注册，不用登录，你的数据全部留在自己的浏览器里。

<!-- TODO: 加一张产品截图或 GIF -->

## 它能干什么

### 自动拆长句

打开任何英文网页，掰it 自动把复杂长句拆成看得懂的块，保留缩进层级，一眼看清主从关系。刷推特、看 Reddit、读 Medium 文章——全都自动处理。

### 标注生词

不认识的词用虚线标出来，鼠标一放上去就能看到中文释义。内置 31,000+ 词条的离线词典，不需要联网。你觉得已经认识的词，点一下标记掌握，以后就不再打扰你。

### 手动掰句

遇到自动没拆的句子，觉得看不懂？点一下旁边的按钮，手动"掰"一下。

### LLM 深度分析（可选）

配上一个 LLM API key（Gemini、OpenAI、DeepSeek 等都行），手动掰句就升级成 AI 深度分析：告诉你这句话是什么句式、为什么难读、怎么学会用类似的句式写作。

### 学习管理

插件自带管理页面（四个 Tab）：

- **总览**：你这周掰了多少句、遇到多少生词、掌握了多少
- **每日回味**：每天给你一个长句，凭语感点击你觉得该断开的地方，然后看 AI 的答案。练的是断句直觉，不打卡、不评分、没压力
- **难句集**：所有你掰过的句子，按句式分类整理，随时回看
- **设置**：配 API key、调拆分力度

## 安装

### 从商店安装（推荐）

> Chrome Web Store 和 Edge Add-ons 均在审核中，敬请期待。

### 从 GitHub Release 安装

1. 到 [Releases](https://github.com/CapeAga/bai-it/releases) 页面下载最新的 `bai-it-vX.X.X.zip`（⚠️ 不要下载 "Source code"，那是源码，无法直接安装）
2. **解压** zip 文件到一个文件夹
3. 打开 Chrome，进入 `chrome://extensions/`
4. 打开右上角「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压出来的文件夹

### Firefox 安装

1. 到 [Releases](https://github.com/CapeAga/bai-it/releases) 页面下载最新的 `bai-it-firefox-vX.X.X.zip`
2. **解压** zip 文件到一个文件夹
3. 打开 Firefox，地址栏输入 `about:debugging`
4. 点击左侧 "This Firefox" → "Load Temporary Add-on"
5. 选择解压文件夹中的 `manifest.json`

> 注意：临时加载的扩展在 Firefox 重启后会消失。如需永久安装，请等待 Mozilla Add-ons 审核通过后从商店安装。

### 从源码构建（开发者）

1. 克隆本仓库
2. 安装依赖并构建：
   ```bash
   npm install
   npm run build
   ```
3. 打开 Chrome，进入 `chrome://extensions/`
4. 打开右上角「开发者模式」
5. 点击「加载已解压的扩展程序」，选择项目的 `dist/` 目录

**构建 Firefox 版本：**
```bash
npm run build:firefox
```
生成的 `bai-it-firefox-vX.X.X.zip` 可用于 Firefox 安装。

## 使用

1. **装完即用** — 打开任何英文网页，长句自动拆分，生词自动标注
2. **调整力度** — 点插件图标，用滑杆控制拆多拆少
3. **手动掰句** — 对看不懂的句子点触发按钮
4. **配 API key（可选）** — 点插件图标 → 更多设置 → 设置 Tab，选一个 LLM 提供商，填入 API key，解锁深度分析

支持的 LLM 提供商：

| 提供商 | 默认模型 | 备注 |
|--------|---------|------|
| Google Gemini | gemini-3.1-flash-lite | 最新最快，有免费额度，推荐新手用 |
| ChatGPT | gpt-4.1-mini | 结构化输出稳定 |
| DeepSeek | deepseek-chat | 中文输出最自然，价格便宜 |
| Qwen（通义） | qwen3-flash | 速度快价格低 |
| Kimi | kimi-k2.5 | 当前主力模型 |

## 隐私

- **零后端**：没有服务器，你的数据不会被上传到任何地方
- **零登录**：不需要注册账号
- **数据全本地**：所有学习记录存在浏览器的 IndexedDB 里
- **API key 只存本地**：你的 key 只存在你的浏览器里，插件直接从你的浏览器调用 LLM API，不经过任何中间服务器

完整隐私政策：[PRIVACY.md](./PRIVACY.md)

## 技术栈

- Chrome & Firefox Extension Manifest V3
- TypeScript + React（管理页面）
- ESBuild 构建
- IndexedDB 本地存储
- Vitest 单元测试 + Puppeteer 浏览器测试

## 反馈

欢迎通过 [Issue](https://github.com/CapeAga/bai-it/issues) 提建议和反馈 bug。本项目目前由个人维护，暂不接受外部 Pull Request。

## 许可证

[BSL 1.1](./LICENSE) — 代码公开可见，但不允许将本软件或其衍生作品作为产品或服务进行复制、修改、分发。
