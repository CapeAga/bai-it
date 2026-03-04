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

import type { Message, BaitConfig, ChunkResult } from "../shared/types.ts";
import { DEFAULT_CONFIG, resolveLLMConfig, migrateLLMConfig } from "../shared/types.ts";
import { getCachedBatch, setCacheBatch } from "../shared/cache.ts";
import { chunkSentences } from "../shared/llm-adapter.ts";

// ========== 配置管理 ==========

async function getConfig(): Promise<BaitConfig> {
  const keys = Object.keys(DEFAULT_CONFIG);
  const items = await chrome.storage.sync.get(keys);
  const config = items as unknown as BaitConfig;

  if (!Array.isArray(config.disabledSites)) {
    config.disabledSites = [];
  }
  if (!Array.isArray(config.industryPacks)) {
    config.industryPacks = ["ai"];
  }
  if (!config.chunkGranularity) {
    config.chunkGranularity = "fine";
  }
  // 兼容旧格式 + 新格式
  config.llm = migrateLLMConfig(config.llm);

  return config;
}

async function updateConfig(partial: Partial<BaitConfig>): Promise<BaitConfig> {
  const current = await getConfig();
  const updated = { ...current, ...partial };
  if (partial.llm) {
    updated.llm = { ...current.llm, ...partial.llm };
  }
  await chrome.storage.sync.set(updated as Record<string, unknown>);
  return updated;
}

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
    await chrome.action.setIcon({
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

// ========== 消息监听 ==========

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    handleMessage(message, sender).then((result) => {
      try { sendResponse(result); } catch { /* tab 可能已关闭 */ }
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
            chrome.tabs.sendMessage(tab.id, {
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
      chrome.tabs.sendMessage(tabId, { type: "pause" }).catch(() => {});
      return { ok: true };
    }

    case "resumeTab": {
      const { tabId } = message;
      pausedTabs.delete(tabId);
      updateIcon(tabId, true);
      chrome.tabs.sendMessage(tabId, { type: "resume" }).catch(() => {});
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

    case "getConfig":
      return getConfig();

    case "updateConfig":
      return updateConfig(message.config);

    default:
      return { error: "Unknown message type" };
  }
}

// ========== Badge 更新 ==========

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
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
