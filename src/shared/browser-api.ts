/**
 * 跨浏览器 API 兼容性层
 * 
 * Firefox 使用 browser.* namespace（返回 Promise）
 * Chrome 使用 chrome.* namespace（部分使用回调）
 * 
 * Firefox 完全兼容 chrome.* namespace，所以这里直接导出 chrome API
 * 此文件为未来扩展提供统一入口
 */

// Firefox 在全局暴露 browser 对象，Chrome 使用 chrome
// Firefox 同时支持 chrome.* namespace 作为别名
declare const browser: typeof chrome | undefined;

/**
 * 统一的浏览器 API 入口
 * 
 * 使用方法：
 * ```typescript
 * import { storage, runtime, tabs, action } from "./shared/browser-api.ts";
 * 
 * // 代替 chrome.storage.sync.get(...)
 * const result = await storage.sync.get(keys);
 * ```
 */
export const api = {
  storage: typeof browser !== "undefined" ? browser.storage : chrome.storage,
  runtime: typeof browser !== "undefined" ? browser.runtime : chrome.runtime,
  tabs: typeof browser !== "undefined" ? browser.tabs : chrome.tabs,
  action: typeof browser !== "undefined" && browser.action ? browser.action : chrome.action,
} as const;

// 便捷导出
export const storage = api.storage;
export const runtime = api.runtime;
export const tabs = api.tabs;
export const action = api.action;

// 类型导出，方便外部使用
export type { StorageArea, StorageChange } from "./browser-api-types";
