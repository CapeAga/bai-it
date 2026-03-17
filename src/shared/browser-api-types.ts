/**
 * 浏览器 API 类型定义
 */

// Chrome storage area type
export interface StorageArea {
  get(keys: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

// Storage change event type
export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}
