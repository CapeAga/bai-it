import { describe, expect, it } from "vitest";
import {
  WORD_ASSIST_MAX_OUTPUT_TOKENS,
  buildWordAssistPrompt,
  parseWordAssistJson,
} from "../shared/llm-adapter.ts";
import {
  getBritishVoice,
  getSpeechUtteranceConfig,
} from "../shared/tts.ts";

describe("buildWordAssistPrompt", () => {
  it("includes the word, sentence, and Chinese hint", () => {
    const prompt = buildWordAssistPrompt({
      word: "meticulous",
      sentence: "She was meticulous in documenting every small change.",
      chineseHint: "一丝不苟的；非常仔细的",
    });

    expect(prompt).toContain("meticulous");
    expect(prompt).toContain("She was meticulous in documenting every small change.");
    expect(prompt).toContain("一丝不苟的；非常仔细的");
    expect(prompt).toContain("simple_english");
    expect(prompt).toContain("chinese_hint");
  });
});

describe("WORD_ASSIST_MAX_OUTPUT_TOKENS", () => {
  it("stays high enough to avoid truncating DeepSeek word explanations", () => {
    expect(WORD_ASSIST_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(200);
  });
});

describe("parseWordAssistJson", () => {
  it("parses valid JSON", () => {
    const result = parseWordAssistJson(JSON.stringify({
      simple_english: "very careful, with attention to small details",
      chinese_hint: "非常仔细的；一丝不苟的",
      example: "A meticulous person checks every detail.",
      phonetic: "/məˈtɪkjələs/",
    }));

    expect(result.simpleEnglish).toBe("very careful, with attention to small details");
    expect(result.chineseHint).toBe("非常仔细的；一丝不苟的");
    expect(result.example).toBe("A meticulous person checks every detail.");
    expect(result.phonetic).toBe("/məˈtɪkjələs/");
  });

  it("handles markdown fences and missing fields", () => {
    const result = parseWordAssistJson("```json\n{\"simple_english\":\"easy to understand\"}\n```");

    expect(result.simpleEnglish).toBe("easy to understand");
    expect(result.chineseHint).toBe("");
    expect(result.example).toBe("");
    expect(result.phonetic).toBe("");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseWordAssistJson("{")).toThrow("JSON 格式无效");
  });
});

describe("getBritishVoice", () => {
  it("prefers explicit en-GB voices", () => {
    const voice = getBritishVoice([
      { lang: "en-US", name: "Google US English" } as SpeechSynthesisVoice,
      { lang: "en-GB", name: "Google UK English Male" } as SpeechSynthesisVoice,
    ]);

    expect(voice?.name).toBe("Google UK English Male");
  });

  it("falls back to UK-like voice names", () => {
    const voice = getBritishVoice([
      { lang: "en-US", name: "Microsoft Sonia Online (Natural) - English (United Kingdom)" } as SpeechSynthesisVoice,
    ]);

    expect(voice?.name).toContain("United Kingdom");
  });
});

describe("getSpeechUtteranceConfig", () => {
  it("returns British defaults", () => {
    const config = getSpeechUtteranceConfig("meticulous", []);

    expect(config.text).toBe("meticulous");
    expect(config.lang).toBe("en-GB");
    expect(config.rate).toBe(0.92);
    expect(config.pitch).toBe(1);
  });
});
