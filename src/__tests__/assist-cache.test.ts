import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import {
  getCachedSentenceAssist,
  getCachedWordAssist,
  setCachedSentenceAssist,
  setCachedWordAssist,
} from "../shared/assist-cache.ts";
import type { LLMConfig, SentenceAssistResult, WordAssistResult } from "../shared/types.ts";

const deepseekConfig: LLMConfig = {
  format: "openai-compatible",
  apiKey: "sk-test",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
};

const openaiConfig: LLMConfig = {
  format: "openai-compatible",
  apiKey: "sk-test",
  baseUrl: "https://api.openai.com",
  model: "gpt-4.1-mini",
};

describe("sentence assist cache", () => {
  it("stores and retrieves sentence explanations by provider and model", async () => {
    const result: SentenceAssistResult = {
      simplerEnglish: "It can find and sort leads for agencies.",
      backupChinese: "它能帮代理机构找到并整理潜在客户。",
      learningPoint: "sort leads 是很常见的业务表达。",
    };

    await setCachedSentenceAssist(
      "Would you trust an AI to find and qualify leads for your agency?",
      deepseekConfig,
      result
    );

    await expect(
      getCachedSentenceAssist(
        "Would you trust an AI to find and qualify leads for your agency?",
        deepseekConfig
      )
    ).resolves.toEqual(result);

    await expect(
      getCachedSentenceAssist(
        "Would you trust an AI to find and qualify leads for your agency?",
        openaiConfig
      )
    ).resolves.toBeNull();
  });
});

describe("word assist cache", () => {
  it("stores and retrieves word explanations with sentence context", async () => {
    const result: WordAssistResult = {
      phonetic: "/ˈwɜːkɪŋ/",
      simpleEnglish: "doing something as a job or activity",
      chineseHint: "正在做；运作中的",
      example: "She is working on a new idea.",
    };

    await setCachedWordAssist(
      {
        word: "working",
        sentence: "I've been working on a tool that can automatically find leads.",
        chineseHint: "工作中；在做",
      },
      deepseekConfig,
      result
    );

    await expect(
      getCachedWordAssist(
        {
          word: "working",
          sentence: "I've been working on a tool that can automatically find leads.",
          chineseHint: "工作中；在做",
        },
        deepseekConfig
      )
    ).resolves.toEqual(result);

    await expect(
      getCachedWordAssist(
        {
          word: "working",
          sentence: "This printer is working again.",
          chineseHint: "运行；工作",
        },
        deepseekConfig
      )
    ).resolves.toBeNull();
  });
});
