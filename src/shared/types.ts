// ========== LLM 配置 ==========

/** llm-adapter 内部使用的扁平格式（从 provider 推导） */
export interface LLMConfig {
  format: "gemini" | "openai-compatible";
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** 6 种 Provider（含自定义） */
export type ProviderKey = "gemini" | "chatgpt" | "deepseek" | "qwen" | "kimi" | "custom";

/** 单个 Provider 的存储数据 */
export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string; // 自定义 base URL，为空时使用 PROVIDER_META 默认值
}

/** 多 Provider 存储结构 */
export interface LLMMultiConfig {
  activeProvider: ProviderKey;
  providers: Record<ProviderKey, ProviderConfig>;
}

// ========== 插件配置 ==========

export interface BaitConfig {
  llm: LLMMultiConfig;
  sensitivity: number; // 2-5，细读模式复杂度阈值
  scanThreshold: "short" | "medium" | "long"; // 扫读模式最小词数阈值
  chunkGranularity: "coarse" | "medium" | "fine"; // 拆分颗粒度
  chunkIntensity: number; // 1-5，渲染力度
  disabledSites: string[]; // hostname 黑名单
}

export const DEFAULT_PROVIDERS: Record<ProviderKey, ProviderConfig> = {
  gemini: { apiKey: "", model: "gemini-3.1-flash-lite-preview" },
  chatgpt: { apiKey: "", model: "gpt-4.1-mini" },
  deepseek: { apiKey: "", model: "deepseek-chat" },
  qwen: { apiKey: "", model: "qwen3-flash" },
  kimi: { apiKey: "", model: "kimi-k2.5" },
  custom: { apiKey: "", model: "", baseUrl: "" },
};

export const DEFAULT_CONFIG: BaitConfig = {
  llm: {
    activeProvider: "gemini",
    providers: { ...DEFAULT_PROVIDERS },
  },
  sensitivity: 3,
  scanThreshold: "medium",
  chunkGranularity: "fine",
  chunkIntensity: 5,
  disabledSites: [],
};

/** Provider 元数据（format / baseUrl 是常量，从 provider 名推导） */
export const PROVIDER_META: Record<ProviderKey, { format: LLMConfig["format"]; baseUrl: string; label: string }> = {
  gemini: { format: "gemini", baseUrl: "", label: "Gemini" },
  chatgpt: { format: "openai-compatible", baseUrl: "https://api.openai.com", label: "ChatGPT" },
  deepseek: { format: "openai-compatible", baseUrl: "https://api.deepseek.com", label: "DeepSeek" },
  qwen: { format: "openai-compatible", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode", label: "Qwen" },
  kimi: { format: "openai-compatible", baseUrl: "https://api.moonshot.cn", label: "Kimi" },
  custom: { format: "openai-compatible", baseUrl: "", label: "自定义" },
};

/** 从多 Provider 配置中解析出 LLMConfig（给 llm-adapter 用） */
export function resolveLLMConfig(multi: LLMMultiConfig): LLMConfig {
  const provider = multi.activeProvider;
  const pc = multi.providers[provider];
  const meta = PROVIDER_META[provider];
  return {
    format: meta.format,
    apiKey: pc.apiKey,
    baseUrl: pc.baseUrl !== undefined && pc.baseUrl !== "" ? pc.baseUrl : meta.baseUrl,
    model: pc.model,
  };
}

/** 旧格式升级到新格式（向后兼容） */
export function migrateLLMConfig(raw: unknown): LLMMultiConfig {
  if (raw && typeof raw === "object" && "activeProvider" in (raw as Record<string, unknown>)) {
    return raw as LLMMultiConfig;
  }
  // 旧格式: { format, apiKey, baseUrl, model }
  const old = raw as { format?: string; apiKey?: string; model?: string } | undefined;
  const providers = { ...DEFAULT_PROVIDERS };
  if (old?.apiKey) {
    // 猜测旧 provider
    const guessProvider: ProviderKey = old.format === "gemini" ? "gemini" : "chatgpt";
    providers[guessProvider] = { apiKey: old.apiKey, model: old.model || DEFAULT_PROVIDERS[guessProvider].model };
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
  | { type: "analyzeSentences"; sentenceIds: string[] };

export type BackgroundMessage =
  | { type: "activate" }
  | { type: "deactivate" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "sentenceAnalyzed"; pendingId: string; learningRecord: LearningRecord }
  | { type: "sentenceAnalysisFailed"; pendingId: string; error: string };

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

// ========== IndexedDB 数据层（10 张表） ==========

/** 生词状态 */
export type VocabStatus = "new" | "learning" | "mastered";

/** vocab — 生词表 */
export interface VocabRecord {
  id: string; // UUID
  word: string;
  status: VocabStatus;
  phonetic?: string;
  definition?: string; // 释义（含行业义项）
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
