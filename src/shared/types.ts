// ========== LLM 配置 ==========

/** 接口驱动类型 */
export type ApiDriverType = "gemini" | "openai-compatible" | "anthropic";

/** Provider 类型 */
export type ProviderType = "preset" | "custom";

/** llm-adapter 内部使用的扁平格式（从 provider 推导） */
export interface LLMConfig {
  format: ApiDriverType;
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** 预设 Provider Key */
export type PresetProviderKey = "gemini" | "chatgpt" | "deepseek" | "qwen" | "kimi";

/** 自定义 Provider Key 格式 */
export type CustomProviderKey = `custom_${string}`;

/** Provider Key（预设或自定义） */
export type ProviderKey = PresetProviderKey | CustomProviderKey;

/** 单个 Provider 的存储数据 */
export interface ProviderConfig {
  type: ProviderType;
  name: string;
  apiKey: string;
  model: string;
  driver: ApiDriverType;
  baseUrl: string;
}

/** 多 Provider 存储结构 */
export interface LLMMultiConfig {
  activeProvider: ProviderKey;
  providers: Record<string, ProviderConfig>;
}

// ========== 插件配置 ==========

export interface BaitConfig {
  llm: LLMMultiConfig;
  sensitivity: number; // 2-5，细读模式复杂度阈值
  scanThreshold: "short" | "medium" | "long"; // 扫读模式最小词数阈值
  chunkGranularity: "coarse" | "medium" | "fine"; // 拆分颗粒度
  chunkIntensity: number; // 1-5，渲染力度
  disabledSites: string[]; // hostname 黑名单
  targetLanguage: string; // 目标语言，如 "zh", "ja", "ko" 等
  theme: "dark" | "light" | "auto"; // 主题模式
}

/** 预设 Provider 默认配置 */
export const DEFAULT_PRESET_PROVIDERS: Record<PresetProviderKey, ProviderConfig> = {
  gemini: {
    type: "preset",
    name: "Gemini",
    apiKey: "",
    model: "gemini-3.1-flash-lite-preview",
    driver: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
  },
  chatgpt: {
    type: "preset",
    name: "ChatGPT",
    apiKey: "",
    model: "gpt-4.1-mini",
    driver: "openai-compatible",
    baseUrl: "https://api.openai.com",
  },
  deepseek: {
    type: "preset",
    name: "DeepSeek",
    apiKey: "",
    model: "deepseek-chat",
    driver: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
  },
  qwen: {
    type: "preset",
    name: "Qwen",
    apiKey: "",
    model: "qwen3-flash",
    driver: "openai-compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode",
  },
  kimi: {
    type: "preset",
    name: "Kimi",
    apiKey: "",
    model: "kimi-k2.5",
    driver: "openai-compatible",
    baseUrl: "https://api.moonshot.cn",
  },
};

// 兼容旧代码的别名
export const DEFAULT_PROVIDERS = DEFAULT_PRESET_PROVIDERS;

export const DEFAULT_CONFIG: BaitConfig = {
  llm: {
    activeProvider: "gemini",
    providers: { ...DEFAULT_PRESET_PROVIDERS },
  },
  sensitivity: 3,
  scanThreshold: "medium",
  chunkGranularity: "fine",
  chunkIntensity: 5,
  disabledSites: [],
  targetLanguage: "zh",
  theme: "auto",
};

/** 预设 Provider 元数据 */
export const PRESET_PROVIDER_META: Record<PresetProviderKey, { label: string }> = {
  gemini: { label: "Gemini" },
  chatgpt: { label: "ChatGPT" },
  deepseek: { label: "DeepSeek" },
  qwen: { label: "Qwen" },
  kimi: { label: "Kimi" },
};

// 兼容旧代码
export const PROVIDER_META = PRESET_PROVIDER_META;

/** 从多 Provider 配置中解析出 LLMConfig（给 llm-adapter 用） */
export function resolveLLMConfig(multi: LLMMultiConfig): LLMConfig {
  const provider = multi.activeProvider;
  const pc = multi.providers[provider];
  if (!pc) {
    // 降级到默认
    const defaultPc = DEFAULT_PRESET_PROVIDERS.gemini;
    return {
      format: defaultPc.driver,
      apiKey: defaultPc.apiKey,
      baseUrl: defaultPc.baseUrl,
      model: defaultPc.model,
    };
  }
  return {
    format: pc.driver,
    apiKey: pc.apiKey,
    baseUrl: pc.baseUrl,
    model: pc.model,
  };
}

/** 旧格式升级到新格式（向后兼容） */
export function migrateLLMConfig(raw: unknown): LLMMultiConfig {
  // 新格式：已有 activeProvider 和 providers
  if (raw && typeof raw === "object" && "activeProvider" in (raw as Record<string, unknown>)) {
    const config = raw as LLMMultiConfig;
    // 迁移：确保所有 provider 都有新字段
    const migratedProviders: Record<string, ProviderConfig> = {};
    for (const [key, pc] of Object.entries(config.providers || {})) {
      const oldPc = pc as Partial<ProviderConfig> & { apiKey?: string; model?: string };
      // 检查是否是旧格式（缺少新字段）
      if (!("driver" in oldPc)) {
        // 旧格式迁移
        const isPreset = DEFAULT_PRESET_PROVIDERS[key as PresetProviderKey];
        if (isPreset) {
          migratedProviders[key] = {
            type: "preset",
            name: isPreset.name,
            apiKey: oldPc.apiKey || "",
            model: oldPc.model || isPreset.model,
            driver: isPreset.driver,
            baseUrl: isPreset.baseUrl,
          };
        } else {
          // 自定义 provider 保留原样但补充默认值
          migratedProviders[key] = {
            type: "custom",
            name: key,
            apiKey: oldPc.apiKey || "",
            model: oldPc.model || "",
            driver: "openai-compatible",
            baseUrl: "",
          };
        }
      } else {
        migratedProviders[key] = oldPc as ProviderConfig;
      }
    }
    return { activeProvider: config.activeProvider, providers: migratedProviders };
  }

  // 超旧格式: { format, apiKey, baseUrl, model }
  const old = raw as { format?: string; apiKey?: string; model?: string; baseUrl?: string } | undefined;
  const providers = { ...DEFAULT_PRESET_PROVIDERS };
  if (old?.apiKey) {
    // 猜测旧 provider
    const guessProvider: PresetProviderKey = old.format === "gemini" ? "gemini" : "chatgpt";
    providers[guessProvider] = {
      ...providers[guessProvider],
      apiKey: old.apiKey,
      model: old.model || providers[guessProvider].model,
    };
    return { activeProvider: guessProvider, providers };
  }
  return { activeProvider: "gemini", providers };
}

// ========== Content Script ↔ Service Worker 消息 ==========

export type Message =
  | { type: "chunk"; sentences: string[]; source_url?: string }
  | { type: "hasApiKey" }
  | { type: "getConfig" }
  | { type: "updateConfig"; config: Partial<BaitConfig> }
  | { type: "checkActive" }
  | { type: "toggleSite"; hostname: string }
  | { type: "pauseTab"; tabId: number }
  | { type: "resumeTab"; tabId: number }
  | { type: "getTabState"; tabId: number; hostname: string }
  | { type: "saveSentence"; text: string; source_url: string; source_hostname: string; manual: boolean; new_words: string[] }
  | { type: "analyzeSentences"; sentenceIds: string[] }
  | { type: "translateWord"; word: string }
  | { type: "translateSelection"; text: string }
  | { type: "getWordDetail"; word: string }
  | { type: "addToVocab"; word: string; phonetic?: string; pos?: string; definition: string; example?: string }
  | { type: "removeFromVocab"; word: string }
  | { type: "checkVocab"; word: string }
  | { type: "getVocabWords" }
  | { type: "exportVocab" }
  | { type: "importVocab"; words: Array<{ word: string; phonetic?: string; pos?: string; definition?: string; example?: string; status?: VocabStatus }> };

export type BackgroundMessage =
  | { type: "activate" }
  | { type: "deactivate" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "sentenceAnalyzed"; pendingId: string; learningRecord: LearningRecord }
  | { type: "sentenceAnalysisFailed"; pendingId: string; error: string }
  | { type: "translationResult"; text: string; result: TranslationResult }
  | { type: "wordDetailResult"; word: string; result: WordDetailResult }
  | { type: "showTranslationTooltip"; text: string }
  | { type: "show-translation"; word: string };

// ========== 分块结果 ==========

export interface ChunkResult {
  original: string;
  chunked: string;
  isSimple: boolean;
  newWords: { word: string; definition: string }[];
  sentenceAnalysis?: string;
  expressionTips?: string;
}

// ========== 缓存 ==========

export interface CacheEntry {
  hash: string;
  result: ChunkResult;
  timestamp: number;
}

export const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天

// ========== LLM 完整分析结果 ==========

export interface FullAnalysisResult {
  chunked: string;
  pattern_key: string;
  sentence_analysis: string;
  expression_tips: string;
  new_words: { word: string; definition: string }[];
  is_worth_practicing: boolean;
}

// ========== 单词翻译结果 ==========

export interface WordDefinitionResult {
  word: string;
  phonetic?: string;
  definition: string;
  example?: string;
}

// ========== 句子翻译结果 ==========

export interface TranslationResult {
  translation: string;
  keyWords?: { word: string; meaning: string }[];
}

// ========== 单词详情结果（含词性） ==========

export interface WordDetailResult {
  word: string;
  phonetic?: string;
  pos?: string; // part of speech: n./v./adj./adv.
  definition: string;
  example?: string;
}

// ========== IndexedDB 数据层（10 张表） ==========

/** 生词状态 */
export type VocabStatus = "new" | "learning" | "mastered";

/** vocab — 生词表 */
export interface VocabRecord {
  id: string; // UUID
  word: string;
  status: VocabStatus;
  phonetic?: string;
  pos?: string; // 词性：n./v./adj./adv.
  definition?: string; // 释义（含行业义项）
  example?: string; // 例句
  encounter_count: number; // 遭遇次数
  first_seen_at: number;
  mastered_at?: number;
  updated_at: number;
  is_dirty: boolean;
}

/** vocab_contexts — 生词出处（每次遭遇记一条） */
export interface VocabContextRecord {
  id: string; // UUID
  vocab_id: string;
  sentence: string; // 出现的原句
  context_definition: string; // 语境释义
  source_url: string;
  created_at: number;
  updated_at: number;
  is_dirty: boolean;
}

/** 句式类型 key（与 PRD 对齐） */
export type PatternKey =
  | "insertion"
  | "background_first"
  | "nested"
  | "long_list"
  | "inverted"
  | "long_subject"
  | "omission"
  | "contrast"
  | "condition"
  | "long_modifier"
  | "other";

/** patterns — 句式类型 */
export interface PatternRecord {
  id: string; // UUID
  key: PatternKey;
  count: number; // 遇到次数
  updated_at: number;
  is_dirty: boolean;
}

/** pattern_examples — 句式实例 */
export interface PatternExampleRecord {
  id: string; // UUID
  pattern_id: string;
  sentence: string;
  chunked: string;
  explanation?: string;
  source_url?: string;
  created_at: number;
  updated_at: number;
  is_dirty: boolean;
}

/** learning_records — 阅读记录（只记 LLM 处理过的复杂句子） */
export interface LearningRecord {
  id: string; // UUID
  sentence: string;
  chunked: string;
  sentence_analysis?: string; // 句式讲解
  expression_tips?: string; // 学会表达
  pattern_key?: PatternKey;
  new_words: { word: string; definition: string }[];
  source_url?: string;
  llm_provider?: string;
  tokens_used?: number;
  created_at: number;
  updated_at: number;
  is_dirty: boolean;
}

/** settings — 键值对设置（学习系统用） */
export interface SettingsRecord {
  key: string; // 主键
  value: unknown;
  updated_at: number;
  is_dirty: boolean;
}

/** weekly_reports — 周报缓存 */
export interface WeeklyReportRecord {
  id: string; // UUID
  week_start: string; // ISO date，如 "2026-02-23"
  content: string; // LLM 生成的周报文本
  stats: {
    total_sentences: number;
    total_new_words: number;
    pattern_distribution: Record<string, number>;
    top_words: { word: string; count: number }[];
  };
  created_at: number;
  updated_at: number;
  is_dirty: boolean;
}

/** review_items — 间隔重复队列（SM-2 算法） */
export interface ReviewItemRecord {
  id: string; // UUID
  type: "sentence" | "word";
  reference_id: string; // 关联 learning_records.id 或 vocab.id
  ease_factor: number; // SM-2 难度系数，默认 2.5
  interval: number; // 当前间隔（天）
  repetitions: number; // 连续正确次数
  next_review_at: number; // 下次复习时间戳
  last_reviewed_at?: number;
  created_at: number;
  updated_at: number;
  is_dirty: boolean;
}

/** wallpaper_records — 壁纸生成记录 */
export interface WallpaperRecord {
  id: string; // UUID
  sentence: string;
  image_data?: string; // base64 或 blob URL
  style?: string;
  created_at: number;
  updated_at: number;
  is_dirty: boolean;
}

/** pending_sentences — 待分析句子（浏览时静默采集） */
export interface PendingSentenceRecord {
  id: string; // UUID
  text: string;
  source_url: string;
  source_hostname: string;
  manual: boolean;
  new_words: string[]; // 只存词，不存释义（释义后续由 LLM 给）
  analyzed: boolean;
  created_at: number;
  updated_at: number;
  is_dirty: boolean;
}

/** translation_cache — 翻译缓存（永久） */
export interface TranslationCacheRecord {
  id: string; // hash of text + targetLanguage
  text: string;
  targetLanguage: string;
  translation: string;
  keyWords?: { word: string; meaning: string }[];
  created_at: number;
}

/** word_detail_cache — 单词详情缓存（永久） */
export interface WordDetailCacheRecord {
  id: string; // hash of word + targetLanguage
  word: string;
  targetLanguage: string;
  phonetic?: string;
  pos?: string;
  definition: string;
  example?: string;
  created_at: number;
}
