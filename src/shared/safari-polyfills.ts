/**
 * Safari 浏览器 API 兼容性补丁
 *
 * Safari Web Extension 与 Chrome/Firefox 的 API 有一些差异：
 * 1. service_worker 不支持 type: module
 * 2. storage.sync 行为略有不同（Safari 可能使用本地存储模拟）
 * 3. 某些 API 的 Promise 支持需要 polyfill
 * 4. tabs API 的某些方法可能不完全支持
 *
 * 此模块在 Safari 环境中自动应用必要的补丁。
 */

// 检测是否在 Safari 环境中
function isSafari(): boolean {
  // Safari Web Extension 中可以通过特定标志检测
  // 或者在构建时注入全局变量
  return (
    typeof navigator !== "undefined" &&
    /Safari/.test(navigator.userAgent) &&
    !/Chrome/.test(navigator.userAgent)
  );
}

// 检测是否是 Safari 扩展环境
function isSafariExtension(): boolean {
  return (
    typeof browser !== "undefined" &&
    (browser as Record<string, unknown>).runtime?.getURL !== undefined &&
    isSafari()
  );
}

/**
 * Safari Storage API 补丁
 * Safari 的 storage.sync 实际上是本地存储的别名
 */
function patchStorageAPI(): void {
  if (!chrome?.storage) return;

  // 确保 storage.sync 存在
  if (!chrome.storage.sync) {
    chrome.storage.sync = chrome.storage.local;
  }

  // 某些 Safari 版本可能需要 polyfill storage.onChanged
  if (!chrome.storage.onChanged) {
    chrome.storage.onChanged = {
      addListener: () => {},
      removeListener: () => {},
      hasListener: () => false,
    } as chrome.storage.StorageChange;
  }
}

/**
 * Safari Tabs API 补丁
 * 某些 tabs 方法在 Safari 中需要特殊处理
 */
function patchTabsAPI(): void {
  if (!chrome?.tabs) return;

  const originalQuery = chrome.tabs.query;
  const originalSendMessage = chrome.tabs.sendMessage;

  // 包装 query 方法以处理 Safari 的差异
  chrome.tabs.query = function (
    queryInfo: chrome.tabs.QueryInfo,
    callback?: (result: chrome.tabs.Tab[]) => void
  ): Promise<chrome.tabs.Tab[]> | void {
    // Safari 可能不返回某些字段，确保兼容性
    const wrappedCallback = callback
      ? (tabs: chrome.tabs.Tab[]) => {
          const patchedTabs = tabs.map((tab) => ({
            ...tab,
            // 确保这些字段存在
            id: tab.id ?? -1,
            url: tab.url ?? "",
            title: tab.title ?? "",
          }));
          callback(patchedTabs);
        }
      : undefined;

    if (wrappedCallback) {
      return originalQuery.call(this, queryInfo, wrappedCallback);
    }

    // Promise 版本
    return originalQuery.call(this, queryInfo).then((tabs) =>
      tabs.map((tab) => ({
        ...tab,
        id: tab.id ?? -1,
        url: tab.url ?? "",
        title: tab.title ?? "",
      }))
    );
  };

  // 包装 sendMessage 以处理 Safari 的错误
  chrome.tabs.sendMessage = function (
    tabId: number,
    message: unknown,
    options?: chrome.tabs.MessageSendOptions | ((response: unknown) => void),
    responseCallback?: (response: unknown) => void
  ): void {
    const callback =
      typeof options === "function" ? options : responseCallback;

    if (callback) {
      originalSendMessage.call(
        this,
        tabId,
        message,
        options as chrome.tabs.MessageSendOptions,
        (response) => {
          // Safari 可能在 tab 关闭时抛出错误，静默处理
          if (chrome.runtime.lastError) {
            // 静默忽略
          }
          callback(response);
        }
      );
    } else {
      originalSendMessage.call(
        this,
        tabId,
        message,
        options as chrome.tabs.MessageSendOptions
      );
    }
  };
}

/**
 * Safari Runtime API 补丁
 */
function patchRuntimeAPI(): void {
  if (!chrome?.runtime) return;

  // 确保 getURL 工作正常
  const originalGetURL = chrome.runtime.getURL;
  chrome.runtime.getURL = function (path: string): string {
    // Safari 可能需要特殊处理路径
    const url = originalGetURL.call(this, path);
    return url;
  };

  // 包装 sendMessage 以提供一致的 Promise 接口
  const originalSendMessage = chrome.runtime.sendMessage;
  chrome.runtime.sendMessage = function (
    message: unknown,
    options?:
      | chrome.runtime.MessageOptions
      | ((response: unknown) => void)
      | string,
    responseCallback?: (response: unknown) => void
  ): Promise<unknown> | void {
    // 处理重载签名
    if (typeof options === "function") {
      return originalSendMessage.call(this, message, options);
    }
    if (typeof options === "string") {
      return originalSendMessage.call(
        this,
        options,
        message,
        responseCallback
      );
    }
    return originalSendMessage.call(
      this,
      message,
      options as chrome.runtime.MessageOptions,
      responseCallback
    );
  };
}

/**
 * Safari Action API 补丁（browserAction）
 */
function patchActionAPI(): void {
  if (!chrome?.action) {
    // Safari 可能使用 browserAction
    (chrome as Record<string, unknown>).action = (
      chrome as Record<string, unknown>
    ).browserAction;
  }

  if (!chrome?.action) return;

  const action = chrome.action;

  // 确保 setIcon 可用
  if (!action.setIcon) {
    action.setIcon = () => Promise.resolve();
  }

  // 确保 setBadgeText 可用
  if (!action.setBadgeText) {
    action.setBadgeText = () => Promise.resolve();
  }
}

/**
 * IndexedDB 兼容性检查
 * Safari 的 IndexedDB 实现有一些已知的 bug 和差异
 */
function checkIndexedDBSupport(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!window?.indexedDB) {
      resolve(false);
      return;
    }

    const request = indexedDB.open("__safari_test__", 1);

    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      db.close();
      // 清理测试数据库
      indexedDB.deleteDatabase("__safari_test__");
      resolve(true);
    };

    // Safari 可能需要超时处理
    setTimeout(() => resolve(false), 5000);
  });
}

/**
 * 应用所有 Safari 补丁
 */
export async function applySafariPatches(): Promise<void> {
  if (!isSafariExtension()) {
    return;
  }

  console.log("[BaiIt] Applying Safari compatibility patches...");

  patchStorageAPI();
  patchTabsAPI();
  patchRuntimeAPI();
  patchActionAPI();

  // 检查 IndexedDB 支持
  const hasIndexedDB = await checkIndexedDBSupport();
  if (!hasIndexedDB) {
    console.warn("[BaiIt] IndexedDB not fully supported in Safari");
  }

  console.log("[BaiIt] Safari patches applied");
}

/**
 * 检测当前浏览器类型
 */
export function detectBrowser(): "chrome" | "firefox" | "safari" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";

  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes("firefox")) return "firefox";
  if (ua.includes("chrome") || ua.includes("chromium")) return "chrome";
  if (ua.includes("safari") && !ua.includes("chrome")) return "safari";

  return "unknown";
}

// 自动应用补丁（如果在 Safari 中）
if (typeof window !== "undefined") {
  applySafariPatches().catch(() => {
    // 静默失败
  });
}
