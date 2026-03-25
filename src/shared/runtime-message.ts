export interface RuntimeMessagingApi {
  lastError?: { message?: string } | null;
  sendMessage: (message: unknown, callback: (response?: unknown) => void) => void;
}

function getRuntimeErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "");
  }
  return "";
}

export function isIgnorableRuntimeMessageError(error: unknown): boolean {
  const message = getRuntimeErrorMessage(error);
  return (
    /No tab with id:/i.test(message) ||
    /The message port closed before a response was received\./i.test(message) ||
    /Receiving end does not exist\./i.test(message) ||
    /Extension context invalidated\./i.test(message)
  );
}

export function sendRuntimeMessage<T = unknown>(
  message: unknown,
  runtimeApi: RuntimeMessagingApi = chrome.runtime as unknown as RuntimeMessagingApi
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    runtimeApi.sendMessage(message, (response) => {
      const runtimeError = runtimeApi.lastError;
      if (runtimeError?.message) {
        if (isIgnorableRuntimeMessageError(runtimeError)) {
          resolve(undefined);
          return;
        }
        reject(new Error(runtimeError.message));
        return;
      }
      resolve(response as T | undefined);
    });
  });
}
