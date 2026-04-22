[English](./README_EN.md)

# 掰it

**英文太长？掰it.**

> [!IMPORTANT]
> **本仓库不再更新**
>
> 插件的最新版本只在官网和各大浏览器商店发布。这里的代码是历史快照，请不要在此下载安装。
>
> 🌐 **官网**：[bai-it.app](https://bai-it.app)（有用户群入口、反馈渠道、使用文档）
>
> 📦 **商店下载**：
> - [Chrome Web Store](https://chromewebstore.google.com/detail/ajneieljnbhbgnceahhgdijoahepcebl)
> - [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/oicmancgjpiokmpojefkabhgpkicgkhn)
> - [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/bai-it/)

---

## 它是什么

掰it 是一个浏览器插件（支持 Chrome / Edge / Firefox），帮你把英文网页上读不下去的长句"掰"成一段一段的，顺便标注生词。

装完就能用，不用注册，不用登录，你的数据全部留在自己的浏览器里。

核心功能：

- **自动拆长句**：打开任何英文网页，复杂长句自动拆成看得懂的块
- **标注生词**：生词用虚线标出，鼠标悬浮查释义，内置离线词典
- **手动掰句**：点一下按钮手动拆难句
- **LLM 深度分析**（可选）：配上 API key 解锁 AI 句式分析
- **学习管理**：自带管理页面追踪生词和学习进度

完整功能介绍和使用说明见官网：[bai-it.app](https://bai-it.app)

## 隐私

- **零后端**：没有服务器，你的数据不会被上传到任何地方
- **零登录**：不需要注册账号
- **数据全本地**：学习记录存在浏览器的 IndexedDB 里
- **API key 只存本地**：插件直接从你的浏览器调用 LLM API，不经过任何中间服务器

完整隐私政策：[PRIVACY.md](./PRIVACY.md)

## 源码

本仓库代码公开仅供查阅，方便了解插件的工作方式。如需自行构建，参考 `package.json`。

⚠️ **仅商店版本会持续更新**，从本仓库源码构建出来的是历史版本，不建议用于日常使用。

## 反馈

反馈、建议、加入用户群都请到[官网](https://bai-it.app)。

## 许可证

[BSL 1.1](./LICENSE) — 代码公开可见，但不允许将本软件或其衍生作品作为产品或服务进行复制、修改、分发。
