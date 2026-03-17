# Safari 扩展支持

掰it 现已支持 Safari Web Extension。

## 系统要求

- macOS 10.15+
- Safari 14+
- Xcode 12+ (用于构建)

## 构建

### 首次构建 (需要 macOS)

```bash
# 构建 Safari 版本
npm run build:safari

# 首次构建需要生成 Xcode 项目
npm run build:safari:init
```

### 后续构建

```bash
npm run build:safari
```

## 安装

### 方式一: 开发者模式 (临时安装)

1. 打开 Safari → 设置 → 扩展
2. 勾选"显示开发菜单"
3. 开发 → Safari 扩展构建助手 → 加载扩展
4. 选择 `dist-safari` 目录

### 方式二: Xcode 构建分发

1. 在 macOS 上打开 `BaiIt-Safari/BaiIt.xcodeproj`
2. 配置签名 (需要 Apple Developer 账号)
3. Product → Archive
4. 分发 App

## Safari 特有的 API 差异

项目已包含自动适配：

- `storage.sync` 在 Safari 中行为等同于 `storage.local`
- `browserAction` 自动映射到 `action`
- IndexedDB 兼容性检查

## 已知限制

- Safari 不支持 `service_worker` 使用 ES modules，需要特殊处理
- 某些权限需要用户在 Safari 设置中手动开启
- CSS 渲染可能有细微差异
- IndexedDB 在 Safari 私有模式下可能有行为差异

## 测试

在 Safari 中：
1. 打开任意英文网页
2. 验证句子拆分功能
3. 验证生词标注功能
4. 验证 Popup 设置功能

## 发布到 Safari App Store

1. 在 Xcode 中创建 archive
2. 使用 Transporter App 上传到 App Store Connect
3. 填写扩展元数据
4. 提交审核
