/**
 * Background Service Worker
 *
 * 职责：
 * 1. 接收 Content Script 的分块请求
 * 2. 查 IndexedDB 缓存，命中直接返回
 * 3. 未命中的句子调 LLM API
 * 4. 结果写入缓存后返回
 * 5. 管理配置和站点开关
 */

import type { Message, BaitConfig, ChunkResult, PatternKey, SentenceAssistResult, WordAssistResult } from "../shared/types.ts";
import { DEFAULT_CONFIG, resolveLLMConfig, migrateLLMConfig } from "../shared/types.ts";
import { getCachedBatch, setCacheBatch } from "../shared/cache.ts";
import {
  buildSentenceAssistCacheKey,
  buildWordAssistCacheKey,
  getCachedSentenceAssist,
  getCachedWordAssist,
  setCachedSentenceAssist,
  setCachedWordAssist,
} from "../shared/assist-cache.ts";
import {
  chunkSentences,
  analyzeSentenceFull,
  explainSentenceWithLLM,
  explainWordWithLLM,
  hasUsefulWordAssistResult,
} from "../shared/llm-adapter.ts";
import { getTabByIdSafe, sendMessageToTabSafe, setActionIconSafe } from "../shared/tab-runtime.ts";
import { openDB as openDataDB, pendingSentenceDAO, learningRecordDAO } from "../shared/db.ts";

// ========== 配置管理 ==========

let cachedConfig: BaitConfig | null = null;
let configLoadPromise: Promise<BaitConfig> | null = null;

function normalizeConfig(items: Record<string, unknown>): BaitConfig {
  const config = items as unknown as BaitConfig;

  if (!Array.isArray(config.disabledSites)) {
    config.disabledSites = [];
  }
  if (!config.chunkGranularity) {
    config.chunkGranularity = "fine";
  }
  config.llm = migrateLLMConfig(config.llm);

  return config;
}

async function getConfig(): Promise<BaitConfig> {
  if (cachedConfig) return cachedConfig;
  if (configLoadPromise) return configLoadPromise;

  const keys = Object.keys(DEFAULT_CONFIG);
  configLoadPromise = chrome.storage.sync
    .get(keys)
    .then((items) => {
      cachedConfig = normalizeConfig(items as Record<string, unknown>);
      return cachedConfig;
    })
    .finally(() => {
      configLoadPromise = null;
    });

  return configLoadPromise;
}

async function updateConfig(partial: Partial<BaitConfig>): Promise<BaitConfig> {
  const current = await getConfig();
  const updated = { ...current, ...partial };
  if (partial.llm) {
    updated.llm = { ...current.llm, ...partial.llm };
  }
  await chrome.storage.sync.set(updated as Record<string, unknown>);
  cachedConfig = updated;
  return updated;
}

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === "sync") {
    cachedConfig = null;
  }
});

// ========== 站点开关 ==========

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

async function isSiteEnabled(hostname: string): Promise<boolean> {
  const config = await getConfig();
  return !config.disabledSites.includes(hostname);
}

async function toggleSite(hostname: string): Promise<{ enabled: boolean; disabledSites: string[] }> {
  const config = await getConfig();
  const index = config.disabledSites.indexOf(hostname);
  let enabled: boolean;

  if (index >= 0) {
    config.disabledSites.splice(index, 1);
    enabled = true;
  } else {
    config.disabledSites.push(hostname);
    enabled = false;
  }

  await chrome.storage.sync.set({ disabledSites: config.disabledSites });
  return { enabled, disabledSites: config.disabledSites };
}

/** 切换工具栏图标：带绿点(启用) / 无绿点(禁用) */
async function updateIcon(tabId: number, active: boolean): Promise<void> {
  const suffix = active ? "-on" : "";
  try {
    await setActionIconSafe({
      path: {
        16: `icons/icon16${suffix}.png`,
        48: `icons/icon48${suffix}.png`,
        128: `icons/icon128${suffix}.png`,
      },
      tabId,
    });
  } catch {
    // tab 可能已关闭，静默忽略
  }
}

// ========== Tab 暂停状态 ==========

const pausedTabs = new Set<number>();
const pendingWordAssistRequests = new Map<string, Promise<WordAssistResult>>();
const pendingSentenceAssistRequests = new Map<string, Promise<SentenceAssistResult>>();

chrome.tabs.onRemoved.addListener((tabId) => {
  pausedTabs.delete(tabId);
});

// ========== 请求合并 ==========

let pendingBatch: {
  sentences: string[];
  source_url?: string;
  resolvers: Map<string, (result: ChunkResult) => void>;
  timer: ReturnType<typeof setTimeout> | null;
} | null = null;

const BATCH_DELAY = 50;
const MAX_BATCH_SIZE = 5;

function addToBatch(
  sentence: string,
  sourceUrl?: string
): Promise<ChunkResult> {
  return new Promise((resolve) => {
    if (!pendingBatch) {
      pendingBatch = { sentences: [], source_url: sourceUrl, resolvers: new Map(), timer: null };
    }

    pendingBatch.sentences.push(sentence);
    pendingBatch.resolvers.set(sentence, resolve);

    if (pendingBatch.timer) clearTimeout(pendingBatch.timer);

    if (pendingBatch.sentences.length >= MAX_BATCH_SIZE) {
      flushBatch();
    } else {
      pendingBatch.timer = setTimeout(flushBatch, BATCH_DELAY);
    }
  });
}

async function flushBatch(): Promise<void> {
  if (!pendingBatch || pendingBatch.sentences.length === 0) return;

  const batch = pendingBatch;
  pendingBatch = null;
  if (batch.timer) clearTimeout(batch.timer);

  try {
    const config = await getConfig();
    const llmConfig = resolveLLMConfig(config.llm);

    if (!llmConfig.apiKey) {
      throw new Error("API key 未配置");
    }

    const results = await chunkSentences(batch.sentences, llmConfig);

    // 写缓存
    const cachePairs = results.map((r, i) => ({
      sentence: batch.sentences[i],
      result: r,
    }));
    setCacheBatch(cachePairs).catch(() => {});

    // 回调所有等待者
    for (let i = 0; i < results.length; i++) {
      const resolver = batch.resolvers.get(batch.sentences[i]);
      if (resolver) resolver(results[i]);
    }

    updateDailyStats(results.filter(r => !r.isSimple).length);
  } catch {
    for (const [sentence, resolver] of batch.resolvers) {
      resolver({
        original: sentence,
        chunked: sentence,
        isSimple: true,
        newWords: [],
      });
    }
  }
}

// ========== 统计 ==========

async function updateDailyStats(chunkedCount: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const data = await chrome.storage.local.get({ statsDate: "", todayChunked: 0 });
  if (data.statsDate !== today) {
    await chrome.storage.local.set({ statsDate: today, todayChunked: chunkedCount });
  } else {
    await chrome.storage.local.set({
      todayChunked: (data.todayChunked as number) + chunkedCount,
    });
  }
}

// ========== IndexedDB 连接 ==========

let bgDb: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (bgDb) return bgDb;
  bgDb = await openDataDB();
  bgDb.onclose = () => { bgDb = null; };
  return bgDb;
}

// ========== 分析批处理 ==========

async function processAnalysisBatch(sentenceIds: string[]): Promise<void> {
  const db = await getDB();
  const config = await getConfig();
  const llmConfig = resolveLLMConfig(config.llm);

  if (!llmConfig.apiKey) return;

  for (let i = 0; i < sentenceIds.length; i++) {
    const id = sentenceIds[i];

    try {
      const pending = await pendingSentenceDAO.getById(db, id);
      if (!pending || pending.analyzed) continue;

      // 防止 service worker 重启导致重复分析
      const existing = await learningRecordDAO.getBySentence(db, pending.text);
      if (existing) {
        await pendingSentenceDAO.markAnalyzed(db, id);
        chrome.runtime.sendMessage({
          type: "sentenceAnalyzed",
          pendingId: id,
          learningRecord: existing,
        }).catch(() => {});
        continue;
      }

      const result = await analyzeSentenceFull(pending.text, llmConfig);

      const lr = await learningRecordDAO.add(db, {
        sentence: pending.text,
        chunked: result.chunked,
        sentence_analysis: result.sentence_analysis,
        expression_tips: result.expression_tips,
        pattern_key: result.pattern_key as PatternKey,
        new_words: result.new_words,
        source_url: pending.source_url,
        llm_provider: config.llm.activeProvider,
      });

      await pendingSentenceDAO.markAnalyzed(db, id);

      chrome.runtime.sendMessage({
        type: "sentenceAnalyzed",
        pendingId: id,
        learningRecord: lr,
      }).catch(() => {});
    } catch (err) {
      chrome.runtime.sendMessage({
        type: "sentenceAnalysisFailed",
        pendingId: id,
        error: err instanceof Error ? err.message : "Unknown error",
      }).catch(() => {});
    }

    // 每条之间加 500ms 间隔，避免 API 限流
    if (i < sentenceIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

// ========== 消息监听 ==========

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    handleMessage(message, sender)
      .then((result) => {
        try { sendResponse(result); } catch { /* tab 可能已关闭 */ }
      })
      .catch((error) => {
        try {
          sendResponse({
            error: error instanceof Error ? error.message : "Unknown background error",
          });
        } catch {
          /* sender 可能已销毁 */
        }
      });
    return true;
  }
);

async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case "chunk": {
      const { sentences, source_url } = message;

      // 1. 先查缓存
      const cached = await getCachedBatch(sentences);
      const uncached = sentences.filter(s => !cached.has(s));

      // 2. 缓存全命中
      if (uncached.length === 0) {
        return { results: sentences.map(s => cached.get(s)!) };
      }

      // 3. 未命中的加入批量队列
      const apiResults = await Promise.all(
        uncached.map(s => addToBatch(s, source_url))
      );

      // 4. 合并
      const apiResultMap = new Map<string, ChunkResult>();
      uncached.forEach((s, i) => apiResultMap.set(s, apiResults[i]));

      return {
        results: sentences.map(s => cached.get(s) ?? apiResultMap.get(s)!),
      };
    }

    case "checkActive": {
      const tabId = sender.tab?.id;
      const tabUrl = sender.tab?.url ?? "";
      const hostname = getHostname(tabUrl);
      const siteOn = hostname ? await isSiteEnabled(hostname) : false;
      const active = siteOn && !(tabId && pausedTabs.has(tabId));
      if (tabId) updateIcon(tabId, active);
      return { active };
    }

    case "toggleSite": {
      const { hostname } = message;
      const result = await toggleSite(hostname);

      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id && tab.url) {
          const tabHost = getHostname(tab.url);
          if (tabHost === hostname) {
            updateIcon(tab.id, result.enabled);
            sendMessageToTabSafe(tab.id, {
              type: result.enabled ? "activate" : "deactivate",
            }).catch(() => {});
          }
        }
      }

      return { enabled: result.enabled, disabledSites: result.disabledSites };
    }

    case "pauseTab": {
      const { tabId } = message;
      pausedTabs.add(tabId);
      updateIcon(tabId, false);
      sendMessageToTabSafe(tabId, { type: "pause" }).catch(() => {});
      return { ok: true };
    }

    case "resumeTab": {
      const { tabId } = message;
      pausedTabs.delete(tabId);
      updateIcon(tabId, true);
      sendMessageToTabSafe(tabId, { type: "resume" }).catch(() => {});
      return { ok: true };
    }

    case "getTabState": {
      const { tabId, hostname } = message;
      if (pausedTabs.has(tabId)) return { state: "paused" };
      const enabled = hostname ? await isSiteEnabled(hostname) : false;
      if (!enabled) return { state: "disabled" };
      return { state: "active" };
    }

    case "hasApiKey": {
      const cfg = await getConfig();
      const llmCfg = resolveLLMConfig(cfg.llm);
      return { hasKey: !!llmCfg.apiKey };
    }

    case "explainWord": {
      const cfg = await getConfig();
      const llmCfg = resolveLLMConfig(cfg.llm);
      if (!llmCfg.apiKey) {
        return {
          phonetic: "",
          simpleEnglish: "",
          chineseHint: message.chinese_hint ?? "",
          example: "",
        };
      }
      const input = {
        word: message.word,
        sentence: message.sentence,
        chineseHint: message.chinese_hint,
      };
      const cached = await getCachedWordAssist(input, llmCfg);
      if (cached) return cached;

      const cacheKey = buildWordAssistCacheKey(input, llmCfg);
      let pending = pendingWordAssistRequests.get(cacheKey);
      if (!pending) {
        pending = explainWordWithLLM(input, llmCfg)
          .then(async (result) => {
            if (!hasUsefulWordAssistResult(result)) {
              throw new Error("Word assist response did not include an English explanation");
            }
            await setCachedWordAssist(input, llmCfg, result);
            return result;
          })
          .finally(() => {
            pendingWordAssistRequests.delete(cacheKey);
          });
        pendingWordAssistRequests.set(cacheKey, pending);
      }
      return pending;
    }

    case "explainSentence": {
      const cfg = await getConfig();
      const llmCfg = resolveLLMConfig(cfg.llm);
      if (!llmCfg.apiKey) {
        return {
          simplerEnglish: "",
          backupChinese: "",
          learningPoint: "",
        };
      }
      const cached = await getCachedSentenceAssist(message.sentence, llmCfg);
      if (cached) return cached;

      const cacheKey = buildSentenceAssistCacheKey(message.sentence, llmCfg);
      let pending = pendingSentenceAssistRequests.get(cacheKey);
      if (!pending) {
        pending = explainSentenceWithLLM(message.sentence, llmCfg)
          .then(async (result) => {
            await setCachedSentenceAssist(message.sentence, llmCfg, result);
            return result;
          })
          .finally(() => {
            pendingSentenceAssistRequests.delete(cacheKey);
          });
        pendingSentenceAssistRequests.set(cacheKey, pending);
      }
      return pending;
    }

    case "getConfig":
      return getConfig();

    case "updateConfig":
      return updateConfig(message.config);

    case "saveSentence": {
      try {
        const db = await getDB();
        const record = await pendingSentenceDAO.add(db, {
          text: message.text,
          source_url: message.source_url,
          source_hostname: message.source_hostname,
          manual: message.manual,
          new_words: message.new_words,
        });
        return { ok: true, saved: record !== null };
      } catch {
        return { ok: true, saved: false };
      }
    }

    case "analyzeSentences": {
      const { sentenceIds } = message;
      // 立即返回，异步处理
      processAnalysisBatch(sentenceIds).catch(() => {});
      return { ok: true };
    }

    default:
      return { error: "Unknown message type" };
  }
}

// ========== Badge 更新 ==========

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await getTabByIdSafe(activeInfo.tabId);
    if (tab?.url) {
      const hostname = getHostname(tab.url);
      const siteOn = hostname ? await isSiteEnabled(hostname) : false;
      const active = siteOn && !pausedTabs.has(activeInfo.tabId);
      updateIcon(activeInfo.tabId, active);
    }
  } catch {
    // tab 可能已关闭，静默忽略
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    const hostname = getHostname(tab.url);
    const siteOn = hostname ? await isSiteEnabled(hostname) : false;
    const active = siteOn && !pausedTabs.has(tabId);
    updateIcon(tabId, active);
  }
});
