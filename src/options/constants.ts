import type { ProviderKey, PatternKey } from "../shared/types.ts";

/** Provider 显示名 + 可用模型列表 + 提示文字 */
export const PROVIDER_INFO: Record<
  ProviderKey,
  { label: string; models: string[]; hint: string }
> = {
  gemini: {
    label: "Gemini",
    models: ["gemini-3.1-flash-lite-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
    hint: "3.1 Flash-Lite 最新最快，有免费额度。2.5 Flash 更稳定。",
  },
  chatgpt: {
    label: "ChatGPT",
    models: ["gpt-4.1-mini", "gpt-5-nano", "gpt-5-mini"],
    hint: "4.1-mini 结构化输出稳定，适合掰句分析。nano 更便宜但质量略低。",
  },
  deepseek: {
    label: "DeepSeek",
    models: ["deepseek-chat"],
    hint: "中文输出最自然，价格便宜，推荐首选。",
  },
  qwen: {
    label: "Qwen",
    models: ["qwen3-flash", "qwen-plus"],
    hint: "qwen3-flash 速度快价格低。qwen-plus 质量更好。",
  },
  kimi: {
    label: "Kimi",
    models: ["kimi-k2.5", "moonshot-v1-8k"],
    hint: "K2.5 是当前主力模型。moonshot-v1 是旧版。",
  },
  mimo: {
    label: "MiMo",
    models: ["MiMo-V2-Flash", "MiMo-V2-Pro", "MiMo-V2-Omni", "MiMo-V2-TTS"],
    hint: "Flash 速度最快。Pro 推理能力最强。Omni 支持多模态。",
  },
};

/** 句式 key → 中文名映射 */
export const PATTERN_LABELS: Record<PatternKey, string> = {
  insertion: "插入补充",
  background_first: "先说背景",
  nested: "层层嵌套",
  long_list: "超长列举",
  inverted: "倒装",
  long_subject: "超长主语",
  omission: "省略",
  contrast: "对比转折",
  condition: "条件假设",
  long_modifier: "超长修饰",
  other: "其他",
};
