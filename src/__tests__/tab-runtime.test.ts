import { describe, expect, it } from "vitest";
import {
  getTabByIdSafe,
  sendMessageToTabSafe,
  setActionIconSafe,
  type ActionApiLike,
  type TabsApiLike,
} from "../shared/tab-runtime.ts";

describe("sendMessageToTabSafe", () => {
  it("swallows missing-tab errors", async () => {
    const tabsApi: TabsApiLike = {
      sendMessage: (_tabId, _message, callback) => {
        callback(undefined, { message: "No tab with id: 42" });
      },
      get: (_tabId, callback) => {
        callback(undefined);
      },
    };

    await expect(sendMessageToTabSafe(42, { type: "pause" }, tabsApi)).resolves.toBeUndefined();
  });

  it("rejects non-ignorable tab messaging errors", async () => {
    const tabsApi: TabsApiLike = {
      sendMessage: (_tabId, _message, callback) => {
        callback(undefined, { message: "Unexpected tab messaging failure" });
      },
      get: (_tabId, callback) => {
        callback(undefined);
      },
    };

    await expect(sendMessageToTabSafe(42, { type: "pause" }, tabsApi)).rejects.toThrow("Unexpected tab messaging failure");
  });
});

describe("getTabByIdSafe", () => {
  it("returns null when the tab no longer exists", async () => {
    const tabsApi: TabsApiLike = {
      sendMessage: (_tabId, _message, callback) => {
        callback(undefined);
      },
      get: (_tabId, callback) => {
        callback(undefined, { message: "No tab with id: 42" });
      },
    };

    await expect(getTabByIdSafe(42, tabsApi)).resolves.toBeNull();
  });
});

describe("setActionIconSafe", () => {
  it("swallows missing-tab errors when updating the action icon", async () => {
    const actionApi: ActionApiLike = {
      setIcon: (_details, callback) => {
        callback({ message: "No tab with id: 42" });
      },
    };

    await expect(
      setActionIconSafe(
        {
          tabId: 42,
          path: {
            16: "icons/icon16.png",
            48: "icons/icon48.png",
            128: "icons/icon128.png",
          },
        },
        actionApi
      )
    ).resolves.toBeUndefined();
  });
});
