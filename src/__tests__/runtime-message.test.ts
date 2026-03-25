import { describe, expect, it } from "vitest";
import {
  isIgnorableRuntimeMessageError,
  sendRuntimeMessage,
  type RuntimeMessagingApi,
} from "../shared/runtime-message.ts";

describe("isIgnorableRuntimeMessageError", () => {
  it("matches tab lifecycle errors", () => {
    expect(isIgnorableRuntimeMessageError(new Error("No tab with id: 123"))).toBe(true);
    expect(isIgnorableRuntimeMessageError("The message port closed before a response was received.")).toBe(true);
    expect(isIgnorableRuntimeMessageError("Extension context invalidated.")).toBe(true);
  });

  it("does not hide real application errors", () => {
    expect(isIgnorableRuntimeMessageError(new Error("401 Unauthorized"))).toBe(false);
    expect(isIgnorableRuntimeMessageError("DeepSeek API error")).toBe(false);
  });
});

describe("sendRuntimeMessage", () => {
  it("resolves the response when runtime succeeds", async () => {
    const runtimeApi: RuntimeMessagingApi = {
      lastError: null,
      sendMessage: (_message, callback) => callback({ ok: true }),
    };

    await expect(sendRuntimeMessage<{ ok: boolean }>({ type: "ping" }, runtimeApi)).resolves.toEqual({ ok: true });
  });

  it("silently absorbs ignorable runtime errors", async () => {
    const runtimeApi: RuntimeMessagingApi = {
      lastError: { message: "No tab with id: 123" },
      sendMessage: (_message, callback) => callback(undefined),
    };

    await expect(sendRuntimeMessage({ type: "ping" }, runtimeApi)).resolves.toBeUndefined();
  });

  it("rejects non-ignorable runtime errors", async () => {
    const runtimeApi: RuntimeMessagingApi = {
      lastError: { message: "Unexpected runtime failure" },
      sendMessage: (_message, callback) => callback(undefined),
    };

    await expect(sendRuntimeMessage({ type: "ping" }, runtimeApi)).rejects.toThrow("Unexpected runtime failure");
  });
});
