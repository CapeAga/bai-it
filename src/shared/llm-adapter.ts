/**
 * LLM 适配层
 *
 * 支持三种 API 格式：Gemini、OpenAI 兼容、Anthropic。
 * 在 Service Worker 中运行，直接调用 LLM API。
 */

import type { LLMConfig, ChunkResult, FullAnalysisResult, WordDefinitionResult } from "./types.ts";

// ========== Prompt 构建 ==========

export function buildChunkPrompt(sentences: string[], knownWords: string[] = []): string {
  const knownWordsNote =
    knownWords.length > 0
      ? `The user already knows these words (do NOT mark them as new): ${knownWords.join(", ")}`
      : "The user is at an advanced English level (IELTS 7+). Be very selective — only mark words that a proficient non-native reader would genuinely not know.";

  return `You are an English reading assistant. Your job is to restructure complex English sentences into indented chunks that reveal their grammatical structure, making them easier to parse visually.

## Rules

1. **Skeleton first**: The main clause (subject-verb-object) stays at the top level (no indentation).
2. **Indent subordinate elements**: Each level of nesting gets 2 more spaces of indentation:
   - Subordinate clauses (that, which, who, if, because, although, etc.)
   - Relative clauses
   - Conditional clauses
   - Temporal clauses
   - Participial phrases, prepositional phrases, and appositive phrases
3. **Simple sentences**: If a sentence has no subordinate clauses and is straightforward, return it unchanged with is_simple=true.
4. **Preserve original text**: Do not change any words. Only add line breaks and indentation. Do NOT add brackets, parentheses, or any other symbols that are not in the original text.

## New Words

${knownWordsNote}

For each sentence, identify words that the user likely doesn't know. Provide a brief Chinese definition for each.

Important constraints for new_words:
- Do NOT mark proper nouns, brand names, or product names (e.g. ChatGPT, Google, Tesla, iPhone)
- Do NOT mark common tech/internet terms (e.g. AI, API, app, blog, email, online)
- Do NOT mark words that appear in any standard 6000-word English vocabulary list
- Only mark words that would genuinely challenge an advanced reader — rare, literary, domain-specific, or highly idiomatic expressions
- When in doubt, do NOT mark it. Fewer is better.

## Input

${sentences.map((s, i) => `[${i}] ${s}`).join("\n")}

## Output Format

Return a JSON array with one object per input sentence, in the same order:

\`\`\`json
[
  {
    "index": 0,
    "original": "the original sentence",
    "chunked": "the chunked version with\\n  indentation\\n    and nested clauses",
    "is_simple": false,
    "new_words": [
      {"word": "example", "definition": "例子，实例"}
    ]
  }
]
\`\`\`

Important:
- Use \\n for line breaks in the chunked field
- Use spaces (not tabs) for indentation, 2 spaces per level
- Return valid JSON only, no markdown fences
- The array must have exactly ${sentences.length} elements`;
}

// ========== 请求构建 ==========

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiRequestBody {
  contents: { parts: { text: string }[] }[];
  generationConfig: {
    temperature: number;
    responseMimeType: string;
    thinkingConfig: { thinkingBudget: number };
  };
}

export function buildGeminiRequest(prompt: string, config: LLMConfig): { url: string; body: GeminiRequestBody } {
  const model = config.model || "gemini-2.0-flash";
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${config.apiKey}`;

  const body: GeminiRequestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  return { url, body };
}

export interface OpenAIRequestBody {
  model: string;
  messages: { role: string; content: string }[];
  temperature: number;
  response_format?: { type: string };
  reasoning_effort?: string; // "low" | "medium" | "high" | "minimal" - for o1/o3 models
}

export function buildOpenAIRequest(prompt: string, config: LLMConfig): { url: string; body: OpenAIRequestBody; headers: Record<string, string> } {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/v1/chat/completions`;

  const body: OpenAIRequestBody = {
    model: config.model,
    messages: [
      { role: "system", content: "You are a helpful English reading assistant. Always respond with valid JSON." },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
    reasoning_effort: "minimal", // 禁用 extended thinking，适用于 o1/o3 等模型
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };

  return { url, body, headers };
}

// ========== Anthropic 请求 ==========

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  messages: { role: string; content: string }[];
  system?: string;
  thinking?: { type: "disabled"; budget_tokens: 0 }; // 禁用 extended thinking
}

export function buildAnthropicRequest(prompt: string, config: LLMConfig): { url: string; body: AnthropicRequestBody; headers: Record<string, string> } {
  const baseUrl = config.baseUrl.replace(/\/+$/, "") || "https://api.anthropic.com";
  const url = `${baseUrl}/v1/messages`;

  const body: AnthropicRequestBody = {
    model: config.model,
    max_tokens: 4096,
    messages: [
      { role: "user", content: prompt },
    ],
    system: "You are a helpful English reading assistant. Always respond with valid JSON.",
    thinking: { type: "disabled", budget_tokens: 0 }, // 禁用 extended thinking
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey,
    "anthropic-version": "2023-06-01",
  };

  return { url, body, headers };
}

// ========== 响应解析 ==========

interface LLMChunkItem {
  index: number;
  original: string;
  chunked: string;
  is_simple: boolean;
  new_words?: { word: string; definition: string }[];
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
}

interface OpenAIResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
}

interface AnthropicResponse {
  content?: {
    type: string;
    text?: string;
  }[];
}

export function parseGeminiResponse(data: unknown): LLMChunkItem[] {
  const response = data as GeminiResponse;
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini 返回了空响应");
  }
  return parseChunkJson(text);
}

export function parseOpenAIResponse(data: unknown): LLMChunkItem[] {
  const response = data as OpenAIResponse;
  const text = response?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI 返回了空响应");
  }
  return parseChunkJson(text);
}

export function parseAnthropicResponse(data: unknown): LLMChunkItem[] {
  const response = data as AnthropicResponse;
  // content 数组可能包含多个块（thinking、text 等），需要找到 type === "text" 的那个
  const textBlock = response?.content?.find(block => block.type === "text");
  const text = textBlock?.text;
  if (!text) {
    throw new Error("Anthropic 返回了空响应");
  }
  return parseChunkJson(text);
}

/**
 * 解析 LLM 返回的 JSON 文本为 ChunkItem 数组
 * 兼容 markdown fence 包裹和直接 JSON
 */
export function parseChunkJson(text: string): LLMChunkItem[] {
  // 去除可能的 markdown fence
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM 返回的 JSON 格式无效: ${cleaned.slice(0, 100)}...`);
  }

  // 处理可能的外层包装（如 { results: [...] }）
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const arrayKey = Object.keys(obj).find(k => Array.isArray(obj[k]));
    if (arrayKey) {
      parsed = obj[arrayKey];
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error("LLM 返回的不是数组格式");
  }

  return (parsed as LLMChunkItem[]).map(item => ({
    index: item.index ?? 0,
    original: item.original ?? "",
    chunked: item.chunked ?? item.original ?? "",
    is_simple: item.is_simple ?? true,
    new_words: Array.isArray(item.new_words) ? item.new_words : [],
  }));
}

// ========== 统一调用接口 ==========

/**
 * 将 LLM 返回的 items 映射为 ChunkResult 数组
 */
export function mapToChunkResults(
  sentences: string[],
  items: LLMChunkItem[]
): ChunkResult[] {
  return sentences.map((sentence, i) => {
    const match = items.find(item => item.index === i);
    if (!match) {
      return {
        original: sentence,
        chunked: sentence,
        isSimple: true,
        newWords: [],
      };
    }
    return {
      original: match.original || sentence,
      chunked: match.chunked,
      isSimple: match.is_simple,
      newWords: match.new_words ?? [],
    };
  });
}

/**
 * 调用 LLM API 对句子进行分块
 */
export async function chunkSentences(
  sentences: string[],
  config: LLMConfig,
  knownWords: string[] = []
): Promise<ChunkResult[]> {
  const prompt = buildChunkPrompt(sentences, knownWords);

  let responseData: unknown;

  if (config.format === "gemini") {
    const { url, body } = buildGeminiRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }

    responseData = await response.json();
    const items = parseGeminiResponse(responseData);
    return mapToChunkResults(sentences, items);
  } else if (config.format === "anthropic") {
    const { url, body, headers } = buildAnthropicRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }

    responseData = await response.json();
    const items = parseAnthropicResponse(responseData);
    return mapToChunkResults(sentences, items);
  } else {
    const { url, body, headers } = buildOpenAIRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }

    responseData = await response.json();
    const items = parseOpenAIResponse(responseData);
    return mapToChunkResults(sentences, items);
  }
}

// ========== 完整分析（单句，给管理端用） ==========

const VALID_PATTERN_KEYS = [
  "insertion", "background_first", "nested", "long_list", "inverted",
  "long_subject", "omission", "contrast", "condition", "long_modifier", "other",
];

export function buildFullAnalysisPrompt(sentence: string): string {
  return `You are an English reading assistant for Chinese learners. Analyze the following English sentence in depth.

## Input sentence

${sentence}

## Output format

Return a single JSON object (NOT an array) with these fields:

\`\`\`json
{
  "chunked": "the chunked version with\\n  indentation",
  "pattern_key": "one of the allowed keys",
  "sentence_analysis": "用中文解释这句话为什么难读，指出哪些结构造成了阅读障碍",
  "expression_tips": "用中文讲解这句话中值得学习的表达方式和句式，用 **加粗** 标注关键表达",
  "new_words": [{"word": "example", "definition": "例子，实例"}],
  "is_worth_practicing": true
}
\`\`\`

## Rules

### chunked
- Main clause (subject-verb-object) at top level (no indentation)
- Indent subordinate elements with 2 spaces per level
- Preserve original text exactly, only add \\n and spaces

### pattern_key
Must be one of: ${VALID_PATTERN_KEYS.join(", ")}

### sentence_analysis & expression_tips
- Write in Chinese (中文)
- Be concise but insightful

### new_words
- Only words that a IELTS 7+ Chinese reader might not know
- Do NOT mark proper nouns, brand names, common tech terms
- Provide brief Chinese definitions

### is_worth_practicing
- true if the sentence has interesting structure worth studying
- false if it's straightforward despite being long

Return valid JSON only, no markdown fences.`;
}

/**
 * 解析单条完整分析结果 JSON
 */
export function parseFullAnalysisJson(text: string): FullAnalysisResult {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM 返回的 JSON 格式无效: ${cleaned.slice(0, 100)}...`);
  }

  const obj = parsed as Record<string, unknown>;

  // 验证 pattern_key
  let patternKey = String(obj.pattern_key || "other");
  if (!VALID_PATTERN_KEYS.includes(patternKey)) {
    patternKey = "other";
  }

  return {
    chunked: String(obj.chunked || ""),
    pattern_key: patternKey,
    sentence_analysis: String(obj.sentence_analysis || ""),
    expression_tips: String(obj.expression_tips || ""),
    new_words: Array.isArray(obj.new_words)
      ? (obj.new_words as { word: string; definition: string }[]).map(w => ({
          word: String(w.word || ""),
          definition: String(w.definition || ""),
        }))
      : [],
    is_worth_practicing: Boolean(obj.is_worth_practicing),
  };
}

/**
 * 提取 LLM 响应文本（Gemini、OpenAI 或 Anthropic 格式）
 */
function extractResponseText(data: unknown, format: "gemini" | "openai-compatible" | "anthropic"): string {
  if (format === "gemini") {
    const response = data as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini 返回了空响应");
    return text;
  } else if (format === "anthropic") {
    const response = data as { content?: { type: string; text?: string }[] };
    // content 数组可能包含多个块（thinking、text 等），需要找到 type === "text" 的那个
    const textBlock = response?.content?.find(block => block.type === "text");
    const text = textBlock?.text;
    if (!text) throw new Error("Anthropic 返回了空响应");
    return text;
  } else {
    const response = data as { choices?: { message?: { content?: string } }[] };
    const text = response?.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI 返回了空响应");
    return text;
  }
}

/**
 * 对单句进行完整 LLM 分析（句式、分块、讲解、表达、生词）
 */
export async function analyzeSentenceFull(
  sentence: string,
  config: LLMConfig
): Promise<FullAnalysisResult> {
  const prompt = buildFullAnalysisPrompt(sentence);

  let responseData: unknown;

  if (config.format === "gemini") {
    const { url, body } = buildGeminiRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }
    responseData = await response.json();
  } else if (config.format === "anthropic") {
    const { url, body, headers } = buildAnthropicRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }
    responseData = await response.json();
  } else {
    const { url, body, headers } = buildOpenAIRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }
    responseData = await response.json();
  }

  const text = extractResponseText(responseData, config.format);
  return parseFullAnalysisJson(text);
}

// ========== 单词翻译 ==========

/**
 * 构建单词翻译提示词
 */
export function buildWordDefinitionPrompt(word: string): string {
  return `Define the English word "${word}" in Chinese.

## Output format
Return a single JSON object:
\`\`\`json
{
  "word": "${word}",
  "phonetic": "/example/",
  "definition": "中文释义",
  "example": "an example sentence"
}
\`\`\`

## Rules
- Keep definition under 20 characters
- Use Chinese only
- Provide 1 most common meaning
- Omit phonetic if unsure
- example is optional, keep it short
- Return valid JSON only, no markdown fences`;
}

/**
 * 解析单词翻译结果 JSON
 */
export function parseWordDefinitionJson(text: string, word: string): WordDefinitionResult {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM 返回的 JSON 格式无效: ${cleaned.slice(0, 100)}...`);
  }

  const obj = parsed as Record<string, unknown>;
  return {
    word: String(obj.word || word),
    phonetic: obj.phonetic ? String(obj.phonetic) : undefined,
    definition: String(obj.definition || ""),
    example: obj.example ? String(obj.example) : undefined,
  };
}

/**
 * 查询单词释义（使用 LLM）
 */
export async function translateWord(
  word: string,
  config: LLMConfig
): Promise<WordDefinitionResult> {
  const prompt = buildWordDefinitionPrompt(word);

  let responseData: unknown;

  if (config.format === "gemini") {
    const { url, body } = buildGeminiRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }
    responseData = await response.json();
  } else if (config.format === "anthropic") {
    const { url, body, headers } = buildAnthropicRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }
    responseData = await response.json();
  } else {
    const { url, body, headers } = buildOpenAIRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }
    responseData = await response.json();
  }

  const text = extractResponseText(responseData, config.format);
  return parseWordDefinitionJson(text, word);
}

// ========== 句子翻译 ==========

export interface TranslationResult {
  translation: string;
  keyWords?: { word: string; meaning: string }[];
}

/**
 * 构建句子翻译提示词
 */
export function buildTranslationPrompt(text: string, targetLanguage: string): string {
  const languageNames: Record<string, string> = {
    zh: "Chinese",
    ja: "Japanese",
    ko: "Korean",
    es: "Spanish",
    fr: "French",
    de: "German",
  };
  const targetLang = languageNames[targetLanguage] || targetLanguage;

  return `Translate the following English text to ${targetLang}. Be concise and natural.

Text: ${text}

Return JSON only:
{
  "translation": "翻译结果",
  "keyWords": [
    { "word": "example", "meaning": "简要释义" }
  ]
}

Rules:
- translation: natural, preserve tone and meaning
- keyWords: up to 3 important/challenging words with brief meanings in ${targetLang}
- Return valid JSON only, no markdown fences`;
}

/**
 * 翻译文本
 */
export async function translateText(
  text: string,
  targetLanguage: string,
  config: LLMConfig
): Promise<TranslationResult> {
  const prompt = buildTranslationPrompt(text, targetLanguage);

  let responseData: unknown;

  if (config.format === "gemini") {
    const { url, body } = buildGeminiRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }
    responseData = await response.json();
  } else if (config.format === "anthropic") {
    const { url, body, headers } = buildAnthropicRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }
    responseData = await response.json();
  } else {
    const { url, body, headers } = buildOpenAIRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }
    responseData = await response.json();
  }

  const resultText = extractResponseText(responseData, config.format);

  // 解析结果
  let cleaned = resultText.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // 如果解析失败，返回原文作为翻译
    return { translation: text };
  }

  const obj = parsed as Record<string, unknown>;
  return {
    translation: String(obj.translation || text),
    keyWords: Array.isArray(obj.keyWords)
      ? (obj.keyWords as { word: string; meaning: string }[]).slice(0, 3)
      : undefined,
  };
}

// ========== 单词详情（含词性） ==========

export interface WordDetailResult {
  word: string;
  phonetic?: string;
  pos?: string;
  definition: string;
  example?: string;
}

/**
 * 构建单词详情提示词
 */
export function buildWordDetailPrompt(word: string, targetLanguage: string): string {
  const languageNames: Record<string, string> = {
    zh: "Chinese",
    ja: "Japanese",
    ko: "Korean",
    es: "Spanish",
    fr: "French",
    de: "German",
  };
  const targetLang = languageNames[targetLanguage] || targetLanguage;

  return `Define the English word "${word}" for language learners. Output in ${targetLang}.

Return JSON only:
{
  "word": "${word}",
  "phonetic": "/IPA/",
  "pos": "n. / v. / adj. / adv. / prep. / conj.",
  "definition": "简要释义",
  "example": "Example sentence."
}

Rules:
- phonetic: IPA format, omit if unsure
- pos: part of speech abbreviation(s)
- definition: brief meaning in ${targetLang}, under 30 characters
- example: simple sentence using the word, under 15 words
- Return valid JSON only, no markdown fences`;
}

/**
 * 查询单词详情
 */
export async function getWordDetail(
  word: string,
  targetLanguage: string,
  config: LLMConfig
): Promise<WordDetailResult> {
  const prompt = buildWordDetailPrompt(word, targetLanguage);

  let responseData: unknown;

  if (config.format === "gemini") {
    const { url, body } = buildGeminiRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }
    responseData = await response.json();
  } else if (config.format === "anthropic") {
    const { url, body, headers } = buildAnthropicRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }
    responseData = await response.json();
  } else {
    const { url, body, headers } = buildOpenAIRequest(prompt, config);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }
    responseData = await response.json();
  }

  const resultText = extractResponseText(responseData, config.format);

  // 解析结果
  let cleaned = resultText.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      word,
      definition: "",
    };
  }

  const obj = parsed as Record<string, unknown>;
  return {
    word: String(obj.word || word),
    phonetic: obj.phonetic ? String(obj.phonetic) : undefined,
    pos: obj.pos ? String(obj.pos) : undefined,
    definition: String(obj.definition || ""),
    example: obj.example ? String(obj.example) : undefined,
  };
}
