import { describe, it, expect } from "vitest";
import {
  buildChunkPrompt,
  buildGeminiRequest,
  buildOpenAIRequest,
  parseGeminiResponse,
  parseOpenAIResponse,
  parseChunkJson,
  mapToChunkResults,
} from "../shared/llm-adapter.ts";
import type { LLMConfig } from "../shared/types.ts";

import geminiValid from "../../tests/fixtures/llm-responses/gemini-valid.json";
import openaiValid from "../../tests/fixtures/llm-responses/openai-valid.json";
import malformed from "../../tests/fixtures/llm-responses/malformed.json";

const TEST_SENTENCES = [
  "The researchers who had been studying the effects of climate change on coral reefs published their findings in a prestigious journal.",
  "I like cats.",
];

const geminiConfig: LLMConfig = {
  format: "gemini",
  apiKey: "test-key-123",
  baseUrl: "",
  model: "gemini-2.0-flash",
};

const openaiConfig: LLMConfig = {
  format: "openai-compatible",
  apiKey: "sk-test-key-456",
  baseUrl: "https://api.openai.com",
  model: "gpt-4o-mini",
};

// ========== Prompt 构建 ==========

describe("buildChunkPrompt", () => {
  it("包含所有输入句子", () => {
    const prompt = buildChunkPrompt(TEST_SENTENCES);
    expect(prompt).toContain("[0] The researchers");
    expect(prompt).toContain("[1] I like cats.");
  });

  it("包含句子数量约束", () => {
    const prompt = buildChunkPrompt(TEST_SENTENCES);
    expect(prompt).toContain("exactly 2 elements");
  });

  it("有 knownWords 时包含已知词列表", () => {
    const prompt = buildChunkPrompt(TEST_SENTENCES, ["the", "and"]);
    expect(prompt).toContain("the, and");
    expect(prompt).toContain("do NOT mark them as new");
  });

  it("无 knownWords 时用默认提示", () => {
    const prompt = buildChunkPrompt(TEST_SENTENCES);
    expect(prompt).toContain("IELTS 7+");
  });
});

// ========== Gemini 请求格式 ==========

describe("buildGeminiRequest", () => {
  it("URL 包含模型名和 API key", () => {
    const { url } = buildGeminiRequest("test prompt", geminiConfig);
    expect(url).toContain("gemini-2.0-flash");
    expect(url).toContain("key=test-key-123");
  });

  it("请求体符合 Gemini API schema", () => {
    const { body } = buildGeminiRequest("test prompt", geminiConfig);
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].parts).toHaveLength(1);
    expect(body.contents[0].parts[0].text).toBe("test prompt");
    expect(body.generationConfig.temperature).toBe(0.1);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });

  it("默认模型为 gemini-2.0-flash", () => {
    const configNoModel = { ...geminiConfig, model: "" };
    const { url } = buildGeminiRequest("test", configNoModel);
    expect(url).toContain("gemini-2.0-flash");
  });
});

// ========== OpenAI 请求格式 ==========

describe("buildOpenAIRequest", () => {
  it("URL 使用 baseUrl + /v1/chat/completions", () => {
    const { url } = buildOpenAIRequest("test prompt", openaiConfig);
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("去除 baseUrl 末尾斜杠", () => {
    const config = { ...openaiConfig, baseUrl: "https://api.example.com/" };
    const { url } = buildOpenAIRequest("test", config);
    expect(url).toBe("https://api.example.com/v1/chat/completions");
  });

  it("请求体符合 OpenAI chat completions schema", () => {
    const { body } = buildOpenAIRequest("test prompt", openaiConfig);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toBe("test prompt");
    expect(body.temperature).toBe(0.1);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("headers 包含 Authorization", () => {
    const { headers } = buildOpenAIRequest("test", openaiConfig);
    expect(headers.Authorization).toBe("Bearer sk-test-key-456");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("支持为短解释请求设置更紧的输出上限", () => {
    const { body } = buildOpenAIRequest("test prompt", openaiConfig, { maxOutputTokens: 180 });
    expect(body.max_tokens).toBe(180);
  });
});

// ========== 响应解析 — 正常 ==========

describe("parseGeminiResponse — 正常响应", () => {
  it("正确提取分块结果", () => {
    const items = parseGeminiResponse(geminiValid);
    expect(items).toHaveLength(2);

    expect(items[0].index).toBe(0);
    expect(items[0].is_simple).toBe(false);
    expect(items[0].chunked).toContain("\n");
    expect(items[0].new_words).toHaveLength(1);
    expect(items[0].new_words![0].word).toBe("prestigious");

    expect(items[1].index).toBe(1);
    expect(items[1].is_simple).toBe(true);
    expect(items[1].new_words).toHaveLength(0);
  });
});

describe("parseOpenAIResponse — 正常响应", () => {
  it("正确提取分块结果", () => {
    const items = parseOpenAIResponse(openaiValid);
    expect(items).toHaveLength(2);

    expect(items[0].is_simple).toBe(false);
    expect(items[0].new_words).toHaveLength(1);
    expect(items[1].is_simple).toBe(true);
  });
});

// ========== 响应解析 — 异常 ==========

describe("响应解析 — 异常情况", () => {
  it("空 Gemini 响应抛错", () => {
    expect(() => parseGeminiResponse(malformed.cases.empty_gemini_response)).toThrow("空响应");
  });

  it("空 OpenAI 响应抛错", () => {
    expect(() => parseOpenAIResponse(malformed.cases.empty_openai_response)).toThrow("空响应");
  });

  it("null content Gemini 抛错", () => {
    expect(() => parseGeminiResponse(malformed.cases.null_content_gemini)).toThrow("空响应");
  });

  it("null content OpenAI 抛错", () => {
    expect(() => parseOpenAIResponse(malformed.cases.null_content_openai)).toThrow("空响应");
  });

  it("无效 JSON 文本抛错", () => {
    expect(() => parseGeminiResponse(malformed.cases.invalid_json_text)).toThrow("JSON 格式无效");
  });

  it("markdown fence 包裹的 JSON 能正确解析", () => {
    const items = parseGeminiResponse(malformed.cases.markdown_fence_wrapped);
    expect(items).toHaveLength(1);
    expect(items[0].is_simple).toBe(true);
  });

  it("对象包裹的数组能正确解析", () => {
    const items = parseGeminiResponse(malformed.cases.wrapped_in_object);
    expect(items).toHaveLength(1);
    expect(items[0].is_simple).toBe(true);
  });
});

// ========== parseChunkJson 边界情况 ==========

describe("parseChunkJson", () => {
  it("缺少字段时使用默认值", () => {
    const items = parseChunkJson('[{"index": 0}]');
    expect(items[0].original).toBe("");
    expect(items[0].chunked).toBe("");
    expect(items[0].is_simple).toBe(true);
    expect(items[0].new_words).toEqual([]);
  });

  it("非数组的 new_words 被修正为空数组", () => {
    const items = parseChunkJson('[{"index": 0, "new_words": "not an array"}]');
    expect(items[0].new_words).toEqual([]);
  });

  it("完全无效的 JSON 抛错", () => {
    expect(() => parseChunkJson("{{{")).toThrow("JSON 格式无效");
  });

  it("不是数组也不是对象包裹的值抛错", () => {
    expect(() => parseChunkJson('"just a string"')).toThrow("不是数组格式");
  });
});

// ========== mapToChunkResults ==========

describe("mapToChunkResults", () => {
  it("正确映射 LLM items 到 ChunkResult", () => {
    const items = parseGeminiResponse(geminiValid);
    const results = mapToChunkResults(TEST_SENTENCES, items);

    expect(results).toHaveLength(2);

    expect(results[0].isSimple).toBe(false);
    expect(results[0].newWords).toHaveLength(1);
    expect(results[0].newWords[0].word).toBe("prestigious");

    expect(results[1].isSimple).toBe(true);
    expect(results[1].newWords).toHaveLength(0);
  });

  it("LLM 缺少某个句子的结果时返回默认值", () => {
    const items = parseChunkJson('[{"index": 0, "original": "Hello", "chunked": "Hello", "is_simple": true, "new_words": []}]');
    const results = mapToChunkResults(["Hello", "World"], items);

    expect(results).toHaveLength(2);
    expect(results[0].isSimple).toBe(true);
    // index 1 没有对应 item，应该返回默认值
    expect(results[1].original).toBe("World");
    expect(results[1].isSimple).toBe(true);
    expect(results[1].newWords).toEqual([]);
  });
});
