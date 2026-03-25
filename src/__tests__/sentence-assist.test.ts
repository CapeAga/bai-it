import { describe, expect, it } from "vitest";
import {
  buildSentenceAssistPrompt,
  parseSentenceAssistJson,
} from "../shared/llm-adapter.ts";
import { renderSentenceAssistCard } from "../content/sentence-assist.ts";

describe("buildSentenceAssistPrompt", () => {
  it("asks for simpler English first and keeps Chinese as backup", () => {
    const prompt = buildSentenceAssistPrompt(
      "The product, which had looked stable for months, suddenly failed in production."
    );

    expect(prompt).toContain("simpler_english");
    expect(prompt).toContain("backup_chinese");
    expect(prompt).toContain("learning_point");
    expect(prompt).toContain("English first");
  });
});

describe("parseSentenceAssistJson", () => {
  it("parses valid JSON with all fields", () => {
    const result = parseSentenceAssistJson(JSON.stringify({
      simpler_english: "It looked stable, but then it suddenly failed in real use.",
      backup_chinese: "它看起来一直很稳定，但后来在线上突然出问题了。",
      learning_point: "look + adjective 描述状态，failed in production 是很常见的技术表达。",
    }));

    expect(result.simplerEnglish).toBe("It looked stable, but then it suddenly failed in real use.");
    expect(result.backupChinese).toBe("它看起来一直很稳定，但后来在线上突然出问题了。");
    expect(result.learningPoint).toBe("look + adjective 描述状态，failed in production 是很常见的技术表达。");
  });

  it("uses safe defaults for missing fields", () => {
    const result = parseSentenceAssistJson('{"simpler_english":"It suddenly failed."}');

    expect(result.simplerEnglish).toBe("It suddenly failed.");
    expect(result.backupChinese).toBe("");
    expect(result.learningPoint).toBe("");
  });
});

describe("renderSentenceAssistCard", () => {
  it("hides backup Chinese until expanded", () => {
    const html = renderSentenceAssistCard({
      sentence: "It suddenly failed in production.",
      simplerEnglish: "It suddenly failed in real use.",
      backupChinese: "它在线上突然出问题了。",
      learningPoint: "",
      chineseExpanded: false,
      learningPointExpanded: false,
      loading: false,
      hasApiKey: true,
    });

    expect(html).toContain("Simpler English");
    expect(html).toContain("It suddenly failed in real use.");
    expect(html).toContain("展开中文");
    expect(html).not.toContain("它在线上突然出问题了。");
  });

  it("shows the Chinese fallback after expansion", () => {
    const html = renderSentenceAssistCard({
      sentence: "It suddenly failed in production.",
      simplerEnglish: "It suddenly failed in real use.",
      backupChinese: "它在线上突然出问题了。",
      learningPoint: "fail in production 是常见搭配。",
      chineseExpanded: true,
      learningPointExpanded: true,
      loading: false,
      hasApiKey: true,
    });

    expect(html).toContain("它在线上突然出问题了。");
    expect(html).toContain("收起中文");
    expect(html).toContain("收起学习点");
    expect(html).toContain("fail in production 是常见搭配。");
    expect(html).toContain("英音");
  });

  it("keeps the learning point folded by default", () => {
    const html = renderSentenceAssistCard({
      sentence: "It suddenly failed in production.",
      simplerEnglish: "It suddenly failed in real use.",
      backupChinese: "",
      learningPoint: "fail in production 是常见搭配。",
      chineseExpanded: false,
      learningPointExpanded: false,
      loading: false,
      hasApiKey: true,
    });

    expect(html).toContain("顺手学一点");
    expect(html).not.toContain("fail in production 是常见搭配。");
  });
});
