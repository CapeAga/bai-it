/**
 * 统一发布脚本
 *
 * 生成三个浏览器的插件包，全部放在 dist/ 目录下：
 * - bai-it-chrome-v{版本号}.zip
 * - bai-it-firefox-v{版本号}.zip
 * - bai-it-safari-v{版本号}.zip
 *
 * 用法：node scripts/release.mjs
 */

import { cpSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync, readdirSync } from "fs";
import { execSync } from "child_process";
import { join, resolve } from "path";

const root = resolve(import.meta.dirname, "..");
const distDir = join(root, "dist");

// ========== 工具函数 ==========

function getManifest() {
  return JSON.parse(readFileSync(join(distDir, "manifest.json"), "utf-8"));
}

function zipDirectory(sourceDir, outputPath) {
  // 使用 zip 命令打包
  execSync(`cd "${sourceDir}" && zip -r "${outputPath}" .`, { stdio: "pipe" });
}

function cleanTempDir(dir) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
}

// ========== Chrome 打包 ==========

function buildChrome(version) {
  console.log("\n📦 打包 Chrome...");

  const zipName = `bai-it-chrome-v${version}.zip`;
  const zipPath = join(distDir, zipName);

  // Chrome 直接从 dist 打包
  execSync(`cd "${distDir}" && zip -r "${zipName}" .`, { stdio: "pipe" });

  console.log(`   ✅ ${zipName}`);
  return zipName;
}

// ========== Firefox 打包 ==========

function buildFirefox(version) {
  console.log("\n🦊 打包 Firefox...");

  const firefoxDir = join(root, "dist-firefox-temp");
  cleanTempDir(firefoxDir);

  // 复制 dist 到临时目录
  cpSync(distDir, firefoxDir, { recursive: true });

  // 修改 manifest.json
  const manifest = JSON.parse(readFileSync(join(firefoxDir, "manifest.json"), "utf-8"));

  manifest.browser_specific_settings = {
    gecko: {
      id: "bait@capeaga.com",
      strict_min_version: "109.0",
    },
  };

  // background: service_worker → scripts
  if (manifest.background?.service_worker) {
    const scriptFile = manifest.background.service_worker;
    manifest.background = {
      scripts: [scriptFile],
      type: manifest.background.type,
    };
  }

  writeFileSync(join(firefoxDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  // 打包
  const zipName = `bai-it-firefox-v${version}.zip`;
  const zipPath = join(distDir, zipName);

  execSync(`cd "${firefoxDir}" && zip -r "${zipPath}" .`, { stdio: "pipe" });

  // 清理
  rmSync(firefoxDir, { recursive: true, force: true });

  console.log(`   ✅ ${zipName}`);
  return zipName;
}

// ========== Safari 打包 ==========

function buildSafari(version) {
  console.log("\n🧭 打包 Safari...");

  const safariDir = join(root, "dist-safari-temp");
  cleanTempDir(safariDir);

  // 复制 dist 到临时目录
  cpSync(distDir, safariDir, { recursive: true });

  // 修改 manifest.json 适配 Safari
  const manifest = JSON.parse(readFileSync(join(safariDir, "manifest.json"), "utf-8"));

  const safariManifest = {
    ...manifest,
    default_locale: "zh_CN",
    background: {
      service_worker: manifest.background?.service_worker || "background.js",
    },
    browser_specific_settings: {
      safari: {
        id: "com.capeaga.bai-it",
        strict_min_version: "14.0",
      },
    },
  };

  delete safariManifest.background?.type;

  writeFileSync(join(safariDir, "manifest.json"), JSON.stringify(safariManifest, null, 2) + "\n");

  // 创建 Info.plist
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
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${version}</string>
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

  // 打包
  const zipName = `bai-it-safari-v${version}.zip`;
  const zipPath = join(distDir, zipName);

  execSync(`cd "${safariDir}" && zip -r "${zipPath}" .`, { stdio: "pipe" });

  // 清理
  rmSync(safariDir, { recursive: true, force: true });

  console.log(`   ✅ ${zipName}`);
  return zipName;
}

// ========== 清理旧的 zip 文件 ==========

function cleanOldZips() {
  console.log("\n🧹 清理旧的发布包...");

  const files = readdirSync(distDir);
  const zips = files.filter(f => f.startsWith("bai-it-") && f.endsWith(".zip"));

  for (const zip of zips) {
    const zipPath = join(distDir, zip);
    rmSync(zipPath);
    console.log(`   删除: ${zip}`);
  }
}

// ========== 主流程 ==========

async function main() {
  console.log("🚀 开始发布流程...\n");

  // 检查 dist 目录
  if (!existsSync(distDir)) {
    console.error("❌ dist/ 目录不存在，请先运行 npm run build");
    process.exit(1);
  }

  const manifest = getManifest();
  const version = manifest.version;

  console.log(`📋 版本: ${version}`);

  // 清理旧的 zip
  cleanOldZips();

  // 打包三个浏览器
  const packages = [];
  packages.push(buildChrome(version));
  packages.push(buildFirefox(version));
  packages.push(buildSafari(version));

  console.log("\n🎉 发布完成！\n");
  console.log("生成的文件:");
  for (const pkg of packages) {
    console.log(`   📦 dist/${pkg}`);
  }
  console.log("");
}

main().catch(err => {
  console.error("❌ 发布失败:", err.message);
  process.exit(1);
});