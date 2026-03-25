import { describe, it, expect } from "vitest";
import {
  buildExtensionArgs,
  getPuppeteerLaunchOptions,
  resolveChromeExecutablePath,
} from "../../scripts/puppeteer-launch.mjs";

describe("resolveChromeExecutablePath", () => {
  it("prefers explicit env executable path", () => {
    const path = resolveChromeExecutablePath({
      env: { PUPPETEER_EXECUTABLE_PATH: "/custom/chrome" },
      platform: "darwin",
      pathExists: (candidate) => candidate === "/custom/chrome",
    });

    expect(path).toBe("/custom/chrome");
  });

  it("falls back to known platform paths", () => {
    const path = resolveChromeExecutablePath({
      env: {},
      platform: "darwin",
      pathExists: (candidate) =>
        candidate === "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });

    expect(path).toBe("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  });

  it("returns null when no browser is available", () => {
    const path = resolveChromeExecutablePath({
      env: {},
      platform: "linux",
      pathExists: () => false,
    });

    expect(path).toBeNull();
  });
});

describe("buildExtensionArgs", () => {
  it("builds extension loading args", () => {
    expect(buildExtensionArgs("/tmp/dist")).toEqual([
      "--disable-extensions-except=/tmp/dist",
      "--load-extension=/tmp/dist",
    ]);
  });
});

describe("getPuppeteerLaunchOptions", () => {
  it("returns launch options with executablePath and defaults", () => {
    const options = getPuppeteerLaunchOptions({
      env: { CHROME_PATH: "/custom/chrome" },
      platform: "darwin",
      pathExists: (candidate) => candidate === "/custom/chrome",
      headless: false,
      extensionPath: "/tmp/dist",
      defaultViewport: { width: 1280, height: 900 },
    });

    expect(options).toMatchObject({
      executablePath: "/custom/chrome",
      headless: false,
      defaultViewport: { width: 1280, height: 900 },
    });
    expect(options.args).toContain("--no-first-run");
    expect(options.args).toContain("--no-default-browser-check");
    expect(options.args).toContain("--disable-extensions-except=/tmp/dist");
    expect(options.args).toContain("--load-extension=/tmp/dist");
  });

  it("throws a clear error when no browser can be found", () => {
    expect(() =>
      getPuppeteerLaunchOptions({
        env: {},
        platform: "linux",
        pathExists: () => false,
      })
    ).toThrow("Chrome executable not found");
  });
});
