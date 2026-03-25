import { isIgnorableRuntimeMessageError } from "./runtime-message.ts";

export interface TabsApiLike {
  sendMessage: (
    tabId: number,
    message: unknown,
    callback: (response?: unknown, error?: { message?: string } | null) => void
  ) => void;
  get: (
    tabId: number,
    callback: (tab?: chrome.tabs.Tab, error?: { message?: string } | null) => void
  ) => void;
}

export interface ActionApiLike {
  setIcon: (
    details: chrome.action.TabIconDetails,
    callback: (error?: { message?: string } | null) => void
  ) => void;
}

function toRuntimeError(error: { message?: string } | null | undefined): Error | null {
  if (!error?.message) return null;
  return new Error(error.message);
}

export function sendMessageToTabSafe(
  tabId: number,
  message: unknown,
  tabsApi: TabsApiLike = {
    sendMessage: (targetTabId, payload, callback) => {
      chrome.tabs.sendMessage(targetTabId, payload, (response) => {
        callback(response, chrome.runtime.lastError);
      });
    },
    get: (targetTabId, callback) => {
      chrome.tabs.get(targetTabId, (tab) => {
        callback(tab, chrome.runtime.lastError);
      });
    },
  }
): Promise<unknown | undefined> {
  return new Promise((resolve, reject) => {
    tabsApi.sendMessage(tabId, message, (response, rawError) => {
      const runtimeError = toRuntimeError(rawError);
      if (runtimeError) {
        if (isIgnorableRuntimeMessageError(runtimeError)) {
          resolve(undefined);
          return;
        }
        reject(runtimeError);
        return;
      }
      resolve(response);
    });
  });
}

export function getTabByIdSafe(
  tabId: number,
  tabsApi: TabsApiLike = {
    sendMessage: (targetTabId, payload, callback) => {
      chrome.tabs.sendMessage(targetTabId, payload, (response) => {
        callback(response, chrome.runtime.lastError);
      });
    },
    get: (targetTabId, callback) => {
      chrome.tabs.get(targetTabId, (tab) => {
        callback(tab, chrome.runtime.lastError);
      });
    },
  }
): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve, reject) => {
    tabsApi.get(tabId, (tab, rawError) => {
      const runtimeError = toRuntimeError(rawError);
      if (runtimeError) {
        if (isIgnorableRuntimeMessageError(runtimeError)) {
          resolve(null);
          return;
        }
        reject(runtimeError);
        return;
      }
      resolve(tab ?? null);
    });
  });
}

export function setActionIconSafe(
  details: chrome.action.TabIconDetails,
  actionApi: ActionApiLike = {
    setIcon: (input, callback) => {
      chrome.action.setIcon(input, () => {
        callback(chrome.runtime.lastError);
      });
    },
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    actionApi.setIcon(details, (rawError) => {
      const runtimeError = toRuntimeError(rawError);
      if (runtimeError) {
        if (isIgnorableRuntimeMessageError(runtimeError)) {
          resolve();
          return;
        }
        reject(runtimeError);
        return;
      }
      resolve();
    });
  });
}
