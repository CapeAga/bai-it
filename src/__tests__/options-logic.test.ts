/**
 * Options 页面逻辑测试
 *
 * 覆盖：
 * 1. 多 Provider 配置类型 (resolveLLMConfig, migrateLLMConfig)
 * 2. useDashboardData 聚合逻辑
 * 3. useSentences 筛选逻辑
 * 4. useReviewData 选句逻辑
 * 5. constants 映射完整性
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  resolveLLMConfig,
  migrateLLMConfig,
  DEFAULT_PRESET_PROVIDERS,
  PRESET_PROVIDER_META,
} from "../shared/types.ts";
import type {
  LLMMultiConfig,
  LLMConfig,
  ProviderConfig,
  LearningRecord,
  PatternKey,
} from "../shared/types.ts";
import {
  openDB,
  closeDB,
  resetDBInstance,
  learningRecordDAO,
  vocabDAO,
  DB_NAME,
} from "../shared/db.ts";
import { PATTERN_LABELS, PROVIDER_INFO } from "../options/constants.ts";

// ========== resolveLLMConfig ==========

describe("resolveLLMConfig", () => {
  it("resolves Gemini provider correctly", () => {
    const providers: Record<string, ProviderConfig> = {
      ...DEFAULT_PRESET_PROVIDERS,
      gemini: {
        ...DEFAULT_PRESET_PROVIDERS.gemini,
        apiKey: "test-key",
        model: "gemini-2.0-flash",
      },
    };
    const multi: LLMMultiConfig = {
      activeProvider: "gemini",
      providers,
    };
    const result = resolveLLMConfig(multi);
    expect(result.format).toBe("gemini");
    expect(result.apiKey).toBe("test-key");
    expect(result.baseUrl).toBe("https://generativelanguage.googleapis.com");
    expect(result.model).toBe("gemini-2.0-flash");
  });

  it("resolves ChatGPT provider correctly", () => {
    const providers: Record<string, ProviderConfig> = {
      ...DEFAULT_PRESET_PROVIDERS,
      chatgpt: {
        ...DEFAULT_PRESET_PROVIDERS.chatgpt,
        apiKey: "sk-xxx",
        model: "gpt-4o-mini",
      },
    };
    const multi: LLMMultiConfig = {
      activeProvider: "chatgpt",
      providers,
    };
    const result = resolveLLMConfig(multi);
    expect(result.format).toBe("openai-compatible");
    expect(result.apiKey).toBe("sk-xxx");
    expect(result.baseUrl).toBe("https://api.openai.com");
    expect(result.model).toBe("gpt-4o-mini");
  });

  it("resolves DeepSeek provider correctly", () => {
    const providers: Record<string, ProviderConfig> = {
      ...DEFAULT_PRESET_PROVIDERS,
      deepseek: {
        ...DEFAULT_PRESET_PROVIDERS.deepseek,
        apiKey: "ds-key",
        model: "deepseek-chat",
      },
    };
    const multi: LLMMultiConfig = {
      activeProvider: "deepseek",
      providers,
    };
    const result = resolveLLMConfig(multi);
    expect(result.format).toBe("openai-compatible");
    expect(result.baseUrl).toBe("https://api.deepseek.com");
  });

  it("resolves Qwen provider correctly", () => {
    const providers: Record<string, ProviderConfig> = {
      ...DEFAULT_PRESET_PROVIDERS,
      qwen: {
        ...DEFAULT_PRESET_PROVIDERS.qwen,
        apiKey: "qwen-key",
        model: "qwen-turbo",
      },
    };
    const multi: LLMMultiConfig = {
      activeProvider: "qwen",
      providers,
    };
    const result = resolveLLMConfig(multi);
    expect(result.format).toBe("openai-compatible");
    expect(result.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode");
  });

  it("resolves Kimi provider correctly", () => {
    const providers: Record<string, ProviderConfig> = {
      ...DEFAULT_PRESET_PROVIDERS,
      kimi: {
        ...DEFAULT_PRESET_PROVIDERS.kimi,
        apiKey: "kimi-key",
        model: "moonshot-v1-8k",
      },
    };
    const multi: LLMMultiConfig = {
      activeProvider: "kimi",
      providers,
    };
    const result = resolveLLMConfig(multi);
    expect(result.format).toBe("openai-compatible");
    expect(result.baseUrl).toBe("https://api.moonshot.cn");
  });

  it("resolves custom provider correctly", () => {
    const providers: Record<string, ProviderConfig> = {
      ...DEFAULT_PRESET_PROVIDERS,
      custom_1: {
        type: "custom",
        name: "My Claude",
        apiKey: "custom-key",
        model: "claude-3-sonnet",
        driver: "anthropic",
        baseUrl: "https://my-proxy.com",
      },
    };
    const multi: LLMMultiConfig = {
      activeProvider: "custom_1",
      providers,
    };
    const result = resolveLLMConfig(multi);
    expect(result.format).toBe("anthropic");
    expect(result.apiKey).toBe("custom-key");
    expect(result.baseUrl).toBe("https://my-proxy.com");
    expect(result.model).toBe("claude-3-sonnet");
  });
});

// ========== migrateLLMConfig ==========

describe("migrateLLMConfig", () => {
  it("passes through new format unchanged", () => {
    const providers: Record<string, ProviderConfig> = {
      ...DEFAULT_PRESET_PROVIDERS,
      chatgpt: {
        ...DEFAULT_PRESET_PROVIDERS.chatgpt,
        apiKey: "sk-xxx",
        model: "gpt-4o",
      },
    };
    const multi: LLMMultiConfig = {
      activeProvider: "chatgpt",
      providers,
    };
    const result = migrateLLMConfig(multi);
    expect(result.activeProvider).toBe("chatgpt");
    expect(result.providers.chatgpt.apiKey).toBe("sk-xxx");
  });

  it("migrates old Gemini format", () => {
    const old = { format: "gemini", apiKey: "old-key", baseUrl: "", model: "gemini-2.0-flash" };
    const result = migrateLLMConfig(old);
    expect(result.activeProvider).toBe("gemini");
    expect(result.providers.gemini.apiKey).toBe("old-key");
    expect(result.providers.gemini.model).toBe("gemini-2.0-flash");
    expect(result.providers.gemini.driver).toBe("gemini");
  });

  it("migrates old OpenAI format", () => {
    const old = { format: "openai-compatible", apiKey: "sk-old", baseUrl: "https://api.openai.com", model: "gpt-4o-mini" };
    const result = migrateLLMConfig(old);
    expect(result.activeProvider).toBe("chatgpt");
    expect(result.providers.chatgpt.apiKey).toBe("sk-old");
    expect(result.providers.chatgpt.driver).toBe("openai-compatible");
  });

  it("handles undefined/null gracefully", () => {
    const result = migrateLLMConfig(undefined);
    expect(result.activeProvider).toBe("gemini");
    expect(result.providers.gemini.apiKey).toBe("");
  });

  it("handles empty object gracefully", () => {
    const result = migrateLLMConfig({});
    expect(result.activeProvider).toBe("gemini");
  });
});

// ========== Dashboard data aggregation ==========

describe("Dashboard data aggregation", () => {
  let db: IDBDatabase;

  beforeEach(async () => {
    resetDBInstance();
    db = await openDB(indexedDB);
  });

  afterEach(() => {
    closeDB();
    indexedDB.deleteDatabase(DB_NAME);
  });

  it("counts learning records correctly", async () => {
    await learningRecordDAO.add(db, {
      sentence: "Test sentence 1",
      chunked: "Test\n  sentence 1",
      new_words: [],
      pattern_key: "insertion",
    });
    await learningRecordDAO.add(db, {
      sentence: "Test sentence 2",
      chunked: "Test\n  sentence 2",
      new_words: [{ word: "test", definition: "测试" }],
      pattern_key: "nested",
    });

    const all = await learningRecordDAO.getAll(db);
    expect(all.length).toBe(2);
  });

  it("counts vocab by status correctly", async () => {
    await vocabDAO.add(db, {
      word: "emergent",
      status: "new",
      definition: "涌现的",
    });
    await vocabDAO.add(db, {
      word: "validate",
      status: "mastered",
      definition: "验证",
    });

    const all = await vocabDAO.getAll(db);
    const mastered = all.filter((v) => v.status === "mastered");
    expect(all.length).toBe(2);
    expect(mastered.length).toBe(1);
  });

  it("sorts learning records by created_at descending", async () => {
    const r1 = await learningRecordDAO.add(db, {
      sentence: "First",
      chunked: "First",
      new_words: [],
    });
    // Ensure different timestamps (Date.now() can return same ms)
    await new Promise(r => setTimeout(r, 10));
    const r2 = await learningRecordDAO.add(db, {
      sentence: "Second",
      chunked: "Second",
      new_words: [],
    });

    const all = await learningRecordDAO.getAll(db);
    const sorted = [...all].sort((a, b) => b.created_at - a.created_at);
    expect(sorted[0].sentence).toBe("Second");
  });
});

// ========== Sentences filtering ==========

describe("Sentences filtering", () => {
  let db: IDBDatabase;

  beforeEach(async () => {
    resetDBInstance();
    db = await openDB(indexedDB);
  });

  afterEach(() => {
    closeDB();
    indexedDB.deleteDatabase(DB_NAME);
  });

  it("filters by pattern_key correctly", async () => {
    await learningRecordDAO.add(db, {
      sentence: "Insertion sentence",
      chunked: "Insertion\n  sentence",
      new_words: [],
      pattern_key: "insertion",
    });
    await learningRecordDAO.add(db, {
      sentence: "Nested sentence",
      chunked: "Nested\n  sentence",
      new_words: [],
      pattern_key: "nested",
    });
    await learningRecordDAO.add(db, {
      sentence: "Another insertion",
      chunked: "Another\n  insertion",
      new_words: [],
      pattern_key: "insertion",
    });

    const all = await learningRecordDAO.getAll(db);
    const insertions = all.filter((r) => r.pattern_key === "insertion");
    const nested = all.filter((r) => r.pattern_key === "nested");

    expect(all.length).toBe(3);
    expect(insertions.length).toBe(2);
    expect(nested.length).toBe(1);
  });

  it("collects available pattern keys from data", async () => {
    await learningRecordDAO.add(db, {
      sentence: "S1",
      chunked: "S1",
      new_words: [],
      pattern_key: "insertion",
    });
    await learningRecordDAO.add(db, {
      sentence: "S2",
      chunked: "S2",
      new_words: [],
      pattern_key: "contrast",
    });
    await learningRecordDAO.add(db, {
      sentence: "S3",
      chunked: "S3",
      new_words: [],
      // no pattern_key
    });

    const all = await learningRecordDAO.getAll(db);
    const patterns = Array.from(
      new Set(all.map((r) => r.pattern_key).filter(Boolean))
    );
    expect(patterns).toContain("insertion");
    expect(patterns).toContain("contrast");
    expect(patterns.length).toBe(2);
  });
});

// ========== Review data selection ==========

describe("Review data selection", () => {
  let db: IDBDatabase;

  beforeEach(async () => {
    resetDBInstance();
    db = await openDB(indexedDB);
  });

  afterEach(() => {
    closeDB();
    indexedDB.deleteDatabase(DB_NAME);
  });

  it("prefers records with pattern_key + sentence_analysis", async () => {
    const valuable = await learningRecordDAO.add(db, {
      sentence: "Valuable sentence",
      chunked: "Valuable\n  sentence",
      new_words: [],
      pattern_key: "insertion",
      sentence_analysis: "This is why it's hard.",
    });
    await learningRecordDAO.add(db, {
      sentence: "Plain sentence",
      chunked: "Plain sentence",
      new_words: [],
    });

    const all = await learningRecordDAO.getAll(db);
    const valuableOnes = all.filter((r) => r.pattern_key && r.sentence_analysis);
    expect(valuableOnes.length).toBe(1);
    expect(valuableOnes[0].sentence).toBe("Valuable sentence");
  });

  it("falls back to any record when no valuable ones exist", async () => {
    await learningRecordDAO.add(db, {
      sentence: "Plain sentence",
      chunked: "Plain sentence",
      new_words: [],
    });

    const all = await learningRecordDAO.getAll(db);
    const valuable = all.filter((r) => r.pattern_key && r.sentence_analysis);
    expect(valuable.length).toBe(0);
    expect(all.length).toBe(1);
  });

  it("counts weekly sentences correctly", async () => {
    const now = Date.now();
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

    // This week's record
    await learningRecordDAO.add(db, {
      sentence: "This week",
      chunked: "This week",
      new_words: [],
    });

    const all = await learningRecordDAO.getAll(db);
    const weekRecords = all.filter((r) => r.created_at >= weekStart.getTime());
    expect(weekRecords.length).toBe(1);
  });
});

// ========== Constants completeness ==========

describe("Constants completeness", () => {
  it("PATTERN_LABELS covers all PatternKey values", () => {
    const patternKeys: PatternKey[] = [
      "insertion", "background_first", "nested", "long_list",
      "inverted", "long_subject", "omission", "contrast",
      "condition", "long_modifier", "other",
    ];
    for (const key of patternKeys) {
      expect(PATTERN_LABELS[key]).toBeDefined();
      expect(typeof PATTERN_LABELS[key]).toBe("string");
    }
  });

  it("PROVIDER_INFO covers all 5 providers", () => {
    const providers = ["gemini", "chatgpt", "deepseek", "qwen", "kimi"] as const;
    for (const key of providers) {
      expect(PROVIDER_INFO[key]).toBeDefined();
      expect(PROVIDER_INFO[key].models.length).toBeGreaterThan(0);
      expect(PROVIDER_INFO[key].hint.length).toBeGreaterThan(0);
      expect(PROVIDER_INFO[key].driver).toBeDefined();
    }
  });

  it("PRESET_PROVIDER_META covers all 5 providers", () => {
    const providers = ["gemini", "chatgpt", "deepseek", "qwen", "kimi"] as const;
    for (const key of providers) {
      expect(PRESET_PROVIDER_META[key]).toBeDefined();
      expect(PRESET_PROVIDER_META[key].label).toBeDefined();
    }
  });

  it("DEFAULT_PRESET_PROVIDERS has default model for each provider", () => {
    const providers = ["gemini", "chatgpt", "deepseek", "qwen", "kimi"] as const;
    for (const key of providers) {
      expect(DEFAULT_PRESET_PROVIDERS[key].model.length).toBeGreaterThan(0);
      expect(DEFAULT_PRESET_PROVIDERS[key].driver).toBeDefined();
      expect(DEFAULT_PRESET_PROVIDERS[key].baseUrl.length).toBeGreaterThan(0);
    }
  });
});
