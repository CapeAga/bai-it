/**
 * LLM 适配层
 *
 * 支持两种 API 格式：Gemini 和 OpenAI 兼容。
 * 在 Service Worker 中运行，直接调用 LLM API。
 */

import type { LLMConfig, ChunkResult, FullAnalysisResult, WordAssistResult, SentenceAssistResult } from "./types.ts";

export const WORD_ASSIST_MAX_OUTPUT_TOKENS = 220;
export const SENTENCE_ASSIST_MAX_OUTPUT_TOKENS = 220;

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

export function buildWordAssistPrompt(input: {
  word: string;
  sentence?: string;
  chineseHint?: string;
}): string {
  const sentenceBlock = input.sentence
    ? `## Sentence Context\n${input.sentence}\n`
    : "";
  const chineseBlock = input.chineseHint
    ? `## Existing Chinese Hint\n${input.chineseHint}\n`
    : "";

  return `You are helping a Chinese learner understand one English word or phrase while staying in English mode.

## Target Word Or Phrase
${input.word}

${sentenceBlock}${chineseBlock}## Task
Return a very short JSON object with:
- "phonetic": the IPA pronunciation wrapped in slashes if you are confident, otherwise an empty string
- "simple_english": one learner-friendly English explanation, written with easy words
- "chinese_hint": one short Chinese hint for backup
- "example": one short natural English example sentence

Rules:
- Prefer British IPA when the pronunciation is standard enough to provide
- Keep the English explanation under 18 words
- Use plain, natural English, like a learner's dictionary
- Match the meaning to the sentence context if provided
- The Chinese hint should be short and natural, not wordy
- Return valid JSON only, no markdown fences

Example output:
{
  "phonetic": "/məˈtɪkjələs/",
  "simple_english": "very careful and attentive to small details",
  "chinese_hint": "非常仔细的；一丝不苟的",
  "example": "She is meticulous about her notes."
}`;
}

export function buildSentenceAssistPrompt(sentence: string): string {
  return `You are helping a Chinese learner understand one difficult English sentence without making them rely on Chinese first.

## Input Sentence
${sentence}

## Task
Return a short JSON object with:
- "simpler_english": rewrite the sentence in simpler, more natural English first
- "backup_chinese": one short Chinese backup translation
- "learning_point": one short note about the single most useful phrase or structure, or an empty string

Rules:
- English first: the simpler English rewrite is the primary help layer
- Keep the simpler English concise and easy to read
- The Chinese backup should be natural, short, and only act as a fallback
- The learning point must be just one point, not a list
- Return valid JSON only, no markdown fences

Example output:
{
  "simpler_english": "It looked stable for months, but then it suddenly failed in real use.",
  "backup_chinese": "它之前看起来一直很稳定，但后来在线上突然出问题了。",
  "learning_point": "look stable 是高频表达，fail in production 也很常见。"
}`;
}

// ========== 请求构建 ==========

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiRequestBody {
  contents: { parts: { text: string }[] }[];
  generationConfig: {
    temperature: number;
    responseMimeType: string;
    thinkingConfig: { thinkingBudget: number };
    maxOutputTokens?: number;
  };
}

interface RequestBuildOptions {
  maxOutputTokens?: number;
}

export function buildGeminiRequest(
  prompt: string,
  config: LLMConfig,
  options: RequestBuildOptions = {}
): { url: string; body: GeminiRequestBody } {
  const model = config.model || "gemini-2.0-flash";
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${config.apiKey}`;

  const body: GeminiRequestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
      ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
    },
  };

  return { url, body };
}

export interface OpenAIRequestBody {
  model: string;
  messages: { role: string; content: string }[];
  temperature: number;
  response_format?: { type: string };
  max_tokens?: number;
}

export function buildOpenAIRequest(
  prompt: string,
  config: LLMConfig,
  options: RequestBuildOptions = {}
): { url: string; body: OpenAIRequestBody; headers: Record<string, string> } {
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
    ...(options.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
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

/**
 * 解析 LLM 返回的 JSON 文本为 ChunkItem 数组
 * 兼容 markdown fence 包裹和直接 JSON
 */
export function parseChunkJson(text: string): LLMChunkItem[] {
  let parsed = parseJsonText(text);

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

function parseJsonText(text: string): unknown {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM 返回的 JSON 格式无效: ${cleaned.slice(0, 100)}...`);
  }
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
  const obj = parseJsonText(text) as Record<string, unknown>;

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

export function parseWordAssistJson(text: string): WordAssistResult {
  const obj = parseJsonText(text) as Record<string, unknown>;
  return {
    phonetic: String(obj.phonetic || ""),
    simpleEnglish: String(obj.simple_english || ""),
    chineseHint: String(obj.chinese_hint || ""),
    example: String(obj.example || ""),
  };
}

export function hasUsefulWordAssistResult(result: WordAssistResult): boolean {
  return Boolean(
    result.simpleEnglish.trim() ||
    result.example.trim() ||
    result.phonetic.trim()
  );
}

export function parseSentenceAssistJson(text: string): SentenceAssistResult {
  const obj = parseJsonText(text) as Record<string, unknown>;
  return {
    simplerEnglish: String(obj.simpler_english || ""),
    backupChinese: String(obj.backup_chinese || ""),
    learningPoint: String(obj.learning_point || ""),
  };
}

/**
 * 提取 LLM 响应文本（Gemini 或 OpenAI 格式）
 */
function extractResponseText(data: unknown, format: "gemini" | "openai-compatible"): string {
  if (format === "gemini") {
    const response = data as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini 返回了空响应");
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

export async function explainWordWithLLM(
  input: {
    word: string;
    sentence?: string;
    chineseHint?: string;
  },
  config: LLMConfig
): Promise<WordAssistResult> {
  const prompt = buildWordAssistPrompt(input);

  let responseData: unknown;
  const requestOptions: RequestBuildOptions = { maxOutputTokens: WORD_ASSIST_MAX_OUTPUT_TOKENS };

  if (config.format === "gemini") {
    const { url, body } = buildGeminiRequest(prompt, config, requestOptions);
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
  } else {
    const { url, body, headers } = buildOpenAIRequest(prompt, config, requestOptions);
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
  return parseWordAssistJson(text);
}

export async function explainSentenceWithLLM(
  sentence: string,
  config: LLMConfig
): Promise<SentenceAssistResult> {
  const prompt = buildSentenceAssistPrompt(sentence);

  let responseData: unknown;
  const requestOptions: RequestBuildOptions = { maxOutputTokens: SENTENCE_ASSIST_MAX_OUTPUT_TOKENS };

  if (config.format === "gemini") {
    const { url, body } = buildGeminiRequest(prompt, config, requestOptions);
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
  } else {
    const { url, body, headers } = buildOpenAIRequest(prompt, config, requestOptions);
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
  return parseSentenceAssistJson(text);
}
