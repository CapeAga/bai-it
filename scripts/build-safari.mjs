/**
 * Safari Web Extension 构建脚本
 *
 * Safari 扩展需要一个原生 macOS App 作为载体。
 * 本脚本将 Web Extension 代码转换为 Safari 兼容格式。
 *
 * 流程：
 * 1. 复制 dist/ 到临时目录
 * 2. 修改 manifest.json 适配 Safari 要求
 * 3. 生成 Xcode 项目（如果尚未生成）
 * 4. 打包成可发布的 App
 *
 * 用法：node scripts/build-safari.mjs [--init]
 *   --init: 首次运行，生成 Xcode 项目模板
 */

import { cpSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join, resolve } from "path";

const root = resolve(import.meta.dirname, "..");
const distDir = join(root, "dist");
const safariDir = join(root, "dist-safari");
const xcodeProjectDir = join(root, "BaiIt-Safari");

const isInit = process.argv.includes("--init");

// ========== 步骤 1: 准备 Safari 扩展目录 ==========

console.log("🧹 清理旧构建...");
rmSync(safariDir, { recursive: true, force: true });
mkdirSync(safariDir, { recursive: true });

console.log("📦 复制构建产物...");
if (!existsSync(distDir)) {
  console.error("❌ dist/ 目录不存在，请先运行 npm run build");
  process.exit(1);
}
cpSync(distDir, safariDir, { recursive: true });

// ========== 步骤 2: 修改 manifest.json 适配 Safari ==========

console.log("🔧 适配 Safari manifest...");
const manifestPath = join(safariDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

// Safari 特定的 manifest 修改
const safariManifest = {
  ...manifest,

  // Safari 使用 default_language 而不是默认的语言设置
  default_locale: "zh_CN",

  // Safari 的 background 配置略有不同
  background: {
    service_worker: manifest.background?.service_worker || "background.js",
    // Safari 不支持 type: module，需要移除
  },

  // Safari 的 host_permissions 需要特殊处理
  // Safari 14+ 支持 host_permissions，但行为略有不同

  // 添加 Safari 特定的设置
  browser_specific_settings: {
    safari: {
      // Safari 扩展 ID
      id: "com.capeaga.bai-it",
      // 严格最小版本
      strict_min_version: "14.0",
    },
  },
};

// 移除 Safari 不支持的字段
delete safariManifest.background?.type; // Safari 不支持 ESM service worker

// Safari 对权限的处理略有不同
// 某些权限在 Safari 中需要用户在设置中手动开启

writeFileSync(manifestPath, JSON.stringify(safariManifest, null, 2) + "\n");

// ========== 步骤 3: 创建 Info.plist (如果需要) ==========

// Safari 扩展通常不需要额外的 plist，但如果需要本地化支持：
const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>掰it</string>
  <key>CFBundleIdentifier</key>
  <string>com.capeaga.bai-it.extension</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>掰it</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${manifest.version}</string>
  <key>CFBundleVersion</key>
  <string>${manifest.version}</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.14</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.Safari.web-extension</string>
    <key>NSExtensionPrincipalClass</key>
    <string>SafariWebExtensionHandler</string>
  </dict>
</dict>
</plist>`;

writeFileSync(join(safariDir, "Info.plist"), infoPlist);

// ========== 步骤 4: 生成/更新 Xcode 项目 ==========

if (isInit || !existsSync(xcodeProjectDir)) {
  console.log("🏗️  生成 Xcode 项目...");
  console.log("   这将创建一个 macOS App 项目作为 Safari 扩展的载体");

  // 检查是否安装了 Xcode 命令行工具
  try {
    execSync("xcode-select -p", { stdio: "ignore" });
  } catch {
    console.error("❌ 未检测到 Xcode 命令行工具");
    console.error("   请先安装 Xcode：");
    console.error("   1. 从 App Store 安装 Xcode");
    console.error("   2. 运行: xcode-select --install");
    process.exit(1);
  }

  // 使用 safari-web-extension-converter 生成 Xcode 项目
  // 注意：这个工具只在有 GUI 的 macOS 上可用
  try {
    // 生成项目到临时位置
    const tempProjectDir = join(root, "temp-safari-project");
    rmSync(tempProjectDir, { recursive: true, force: true });

    // 使用 converter 工具
    // 注意：需要在 macOS 上运行，且有 Xcode 安装
    execSync(
      `xcrun safari-web-extension-converter "${safariDir}" --project-location "${tempProjectDir}" --app-name "BaiIt" --bundle-identifier com.capeaga.bai-it --swift --macos-only`,
      { stdio: "inherit", cwd: root }
    );

    // 移动生成的项目到目标位置
    rmSync(xcodeProjectDir, { recursive: true, force: true });
    mkdirSync(xcodeProjectDir, { recursive: true });

    // 复制生成的项目文件
    const generatedDir = join(tempProjectDir, "BaiIt");
    if (existsSync(generatedDir)) {
      cpSync(generatedDir, xcodeProjectDir, { recursive: true });
    }

    // 清理临时目录
    rmSync(tempProjectDir, { recursive: true, force: true });

    console.log(`✅ Xcode 项目已生成: ${xcodeProjectDir}`);
  } catch (error) {
    console.error("⚠️  自动生成 Xcode 项目失败（可能不在 macOS 环境）");
    console.error("   错误:", error.message);
    console.log("");
    console.log("📋 手动创建步骤:");
    console.log("   1. 在 macOS 上安装 Xcode");
    console.log("   2. 运行: npm run build:safari:init");
    console.log("   3. 打开生成的 BaiIt-Safari/BaiIt.xcodeproj");
    console.log("   4. 配置签名和 Bundle ID");
    console.log("   5. 构建并导出扩展");

    // 创建手动指南
    createManualSetupGuide();
  }
} else {
  console.log("📁 Xcode 项目已存在，跳过生成");
  console.log(`   位置: ${xcodeProjectDir}`);
  console.log("   如需重新生成，请删除该目录后运行 --init");
}

// ========== 步骤 5: 打包 ==========

const version = manifest.version;
const zipName = `bai-it-safari-v${version}.zip`;

console.log("📦 打包 Safari 扩展...");
try {
  execSync(`cd "${safariDir}" && zip -r "${join(root, zipName)}" .`);
  console.log(`✅ Safari 扩展包: ${zipName}`);
} catch (error) {
  console.error("❌ 打包失败:", error.message);
}

console.log("");
console.log("🎉 Safari 构建完成!");
console.log("");
console.log("📋 下一步:");
if (!existsSync(xcodeProjectDir)) {
  console.log("   1. 在 macOS 上运行: npm run build:safari:init");
  console.log("   2. 打开 Xcode 项目配置签名");
  console.log("   3. 构建并分发");
} else {
  console.log("   1. 在 macOS 上打开 BaiIt-Safari/BaiIt.xcodeproj");
  console.log("   2. 配置开发者签名 (Signing & Capabilities)");
  console.log("   3. 选择目标 macOS 版本并构建");
  console.log("   4. 导出 App 进行分发");
}
console.log("");

// ========== 辅助函数 ==========

function createManualSetupGuide() {
  const guidePath = join(root, "SAFARI_SETUP.md");
  const guide = `# Safari 扩展手动设置指南

由于当前环境不是 macOS，无法自动生成 Xcode 项目。请按照以下步骤手动创建：

## 前置要求

1. macOS 系统（10.15+）
2. Xcode 12+（从 App Store 安装）
3. Apple Developer 账号（免费账号可用于本地测试，发布需要付费账号）

## 步骤

### 1. 准备扩展文件

确保已经运行过构建：
\`\`\`bash
npm run build
\`\`\`

### 2. 生成 Xcode 项目

在 macOS 终端中运行：

\`\`\`bash
# 进入项目目录
cd /path/to/bai-it

# 使用 Apple 提供的转换工具
xcrun safari-web-extension-converter dist/ \
  --app-name "BaiIt" \
  --bundle-identifier com.capeaga.bai-it \
  --swift \
  --macos-only \
  --project-location ./BaiIt-Safari
\`\`\`

### 3. 配置项目

1. 打开生成的 \`BaiIt-Safari/BaiIt.xcodeproj\`
2. 选择 Target "BaiIt"
3. 在 "Signing & Capabilities" 中：
   - 选择你的 Team
   - 修改 Bundle Identifier（如：com.capeaga.bai-it）
4. 对 "BaiIt Extension" target 重复上述步骤

### 4. 构建和运行

1. 选择目标设备（My Mac）
2. 按 Cmd+R 运行
3. 首次运行需要在 Safari 中启用扩展：
   - 打开 Safari → 设置 → 扩展
   - 勾选 "BaiIt"
   - 允许访问的网站权限

### 5. 发布

1. 在 Xcode 中选择 Product → Archive
2. 在 Organizer 中点击 "Distribute App"
3. 选择分发方式（App Store、直接分发等）

## 注意事项

- Safari 扩展 API 与 Chrome/Firefox 有差异，部分功能可能受限
- IndexedDB 在 Safari 中行为略有不同，需要测试
- 某些 CSS 样式在 Safari 中可能需要额外处理
- 建议先在本地测试所有功能后再发布

## 技术差异

Safari Web Extension 与 Chrome/Firefox 的主要差异：

1. **Background Script**: Safari 使用 event pages，生命周期管理不同
2. **Storage API**: 基本兼容，但 sync storage 行为略有差异
3. **Content Script**: 大部分兼容，但某些 DOM API 可能有差异
4. **Manifest**: Safari 忽略某些 Chrome 特有的字段
5. **权限**: 某些权限需要用户在 Safari 设置中手动开启

## 调试

1. 在 Safari 中启用开发者菜单：
   - Safari → 设置 → 高级 → 勾选 "在菜单栏中显示"开发者""

2. 打开扩展的开发者工具：
   - 开发者 → 显示扩展内容 → 选择 BaiIt

3. 查看控制台输出和调试信息
`;

  writeFileSync(guidePath, guide);
  console.log(`📝 手动设置指南已保存: ${guidePath}`);
}
