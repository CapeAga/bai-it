import type { LLMConfig, SentenceAssistResult, WordAssistResult } from "./types.ts";
import { CACHE_TTL } from "./types.ts";
import { hashString } from "./cache.ts";
import { normalizeSelectedText } from "./selection-assist.ts";

export const ASSIST_CACHE_DB_NAME = "openen-assist-cache";
const ASSIST_CACHE_DB_VERSION = 1;
const WORD_ASSIST_STORE = "word_assist";
const SENTENCE_ASSIST_STORE = "sentence_assist";

interface AssistCacheEntry<T> {
  hash: string;
  result: T;
  timestamp: number;
}

function openAssistCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ASSIST_CACHE_DB_NAME, ASSIST_CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORD_ASSIST_STORE)) {
        db.createObjectStore(WORD_ASSIST_STORE, { keyPath: "hash" });
      }
      if (!db.objectStoreNames.contains(SENTENCE_ASSIST_STORE)) {
        db.createObjectStore(SENTENCE_ASSIST_STORE, { keyPath: "hash" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function buildProviderCacheScope(config: LLMConfig): string {
  return [config.format, config.baseUrl.replace(/\/+$/, ""), config.model].join("::");
}

export function buildSentenceAssistCacheKey(sentence: string, config: LLMConfig): string {
  const normalizedSentence = normalizeSelectedText(sentence);
  return hashString(`${buildProviderCacheScope(config)}::sentence::${normalizedSentence}`);
}

export function buildWordAssistCacheKey(
  input: { word: string; sentence?: string; chineseHint?: string },
  config: LLMConfig
): string {
  const normalizedWord = normalizeSelectedText(input.word).toLowerCase();
  const normalizedSentence = normalizeSelectedText(input.sentence || "");
  const normalizedChineseHint = normalizeSelectedText(input.chineseHint || "");
  return hashString(
    `${buildProviderCacheScope(config)}::word::${normalizedWord}::${normalizedSentence}::${normalizedChineseHint}`
  );
}

async function getFromAssistCache<T>(
  storeName: string,
  hash: string
): Promise<T | null> {
  try {
    const db = await openAssistCacheDB();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.get(hash);

      request.onsuccess = () => {
        const entry = request.result as AssistCacheEntry<T> | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        if (Date.now() - entry.timestamp > CACHE_TTL) {
          deleteFromAssistCache(storeName, hash).catch(() => {});
          resolve(null);
          return;
        }
        resolve(entry.result);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setInAssistCache<T>(
  storeName: string,
  hash: string,
  result: T
): Promise<void> {
  try {
    const db = await openAssistCacheDB();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put({
      hash,
      result,
      timestamp: Date.now(),
    } satisfies AssistCacheEntry<T>);
  } catch {
    // 缓存失败不阻塞主流程
  }
}

async function deleteFromAssistCache(storeName: string, hash: string): Promise<void> {
  const db = await openAssistCacheDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(hash);
}

export async function getCachedWordAssist(
  input: { word: string; sentence?: string; chineseHint?: string },
  config: LLMConfig
): Promise<WordAssistResult | null> {
  return getFromAssistCache<WordAssistResult>(
    WORD_ASSIST_STORE,
    buildWordAssistCacheKey(input, config)
  );
}

export async function setCachedWordAssist(
  input: { word: string; sentence?: string; chineseHint?: string },
  config: LLMConfig,
  result: WordAssistResult
): Promise<void> {
  return setInAssistCache(
    WORD_ASSIST_STORE,
    buildWordAssistCacheKey(input, config),
    result
  );
}

export async function getCachedSentenceAssist(
  sentence: string,
  config: LLMConfig
): Promise<SentenceAssistResult | null> {
  return getFromAssistCache<SentenceAssistResult>(
    SENTENCE_ASSIST_STORE,
    buildSentenceAssistCacheKey(sentence, config)
  );
}

export async function setCachedSentenceAssist(
  sentence: string,
  config: LLMConfig,
  result: SentenceAssistResult
): Promise<void> {
  return setInAssistCache(
    SENTENCE_ASSIST_STORE,
    buildSentenceAssistCacheKey(sentence, config),
    result
  );
}
