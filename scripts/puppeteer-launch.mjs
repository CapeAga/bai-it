import fs from "fs";

const CANDIDATE_PATHS = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
};

export function resolveChromeExecutablePath({
  env = process.env,
  platform = process.platform,
  pathExists = fs.existsSync,
} = {}) {
  const explicitPaths = [
    env.PUPPETEER_EXECUTABLE_PATH,
    env.CHROME_PATH,
    env.GOOGLE_CHROME_BIN,
  ].filter(Boolean);

  for (const candidate of explicitPaths) {
    if (pathExists(candidate)) return candidate;
  }

  const candidates = CANDIDATE_PATHS[platform] ?? [];
  for (const candidate of candidates) {
    if (pathExists(candidate)) return candidate;
  }

  return null;
}

export function buildExtensionArgs(extensionPath) {
  if (!extensionPath) return [];
  return [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ];
}

export function getPuppeteerLaunchOptions({
  env = process.env,
  platform = process.platform,
  pathExists = fs.existsSync,
  headless = false,
  extensionPath,
  defaultViewport,
  extraArgs = [],
} = {}) {
  const executablePath = resolveChromeExecutablePath({ env, platform, pathExists });
  if (!executablePath) {
    throw new Error(
      "Chrome executable not found. Install Google Chrome or set PUPPETEER_EXECUTABLE_PATH/CHROME_PATH."
    );
  }

  return {
    executablePath,
    headless,
    defaultViewport,
    args: [
      ...buildExtensionArgs(extensionPath),
      "--no-first-run",
      "--no-default-browser-check",
      ...extraArgs,
    ],
  };
}
