import { describe, it, expect, beforeEach } from "vitest";
import {
  loadFrequencyList,
  loadDictionary,
  annotateWords,
  isCommonWord,
  lookupDefinitionForSelection,
  toNewWordsFormat,
  resetAll,
} from "../shared/vocab";

import frequencyWords from "../../tests/fixtures/word-frequency-test.json";
import dictEntries from "../../tests/fixtures/dict-test.json";

beforeEach(() => {
  resetAll();
  loadFrequencyList(frequencyWords);
  loadDictionary(dictEntries);
});

// ========== 验收标准：词频过滤 ==========

describe("词频过滤", () => {
  it("常用词不标注", () => {
    const result = annotateWords(
      "The team will develop a new project for the company.",
      new Set(),
    );
    // "team", "develop", "project", "company" 都在常用词表中
    const annotatedWords = result.map(a => a.word);
    expect(annotatedWords).not.toContain("team");
    expect(annotatedWords).not.toContain("develop");
    expect(annotatedWords).not.toContain("project");
    expect(annotatedWords).not.toContain("company");
  });

  it("超出词频表的词标注", () => {
    const result = annotateWords(
      "The algorithm uses a heuristic approach to refactor the codebase.",
      new Set(),
    );
    const annotatedWords = result.map(a => a.word);
    expect(annotatedWords).toContain("algorithm");
    expect(annotatedWords).toContain("heuristic");
    expect(annotatedWords).toContain("refactor");
  });

  it("isCommonWord 正确判断", () => {
    expect(isCommonWord("the")).toBe(true);
    expect(isCommonWord("algorithm")).toBe(false);
    expect(isCommonWord("The")).toBe(true); // 大小写不敏感
  });

  it("太短的词不标注", () => {
    const result = annotateWords("Is it OK to go?", new Set());
    const annotatedWords = result.map(a => a.word);
    // "is", "it", "ok", "to", "go" 都太短（< 3 字母）或在常用词中
    expect(annotatedWords.length).toBe(0);
  });

  it("纯数字不标注", () => {
    const result = annotateWords("There are 12345 items.", new Set());
    const annotatedWords = result.map(a => a.word);
    expect(annotatedWords).not.toContain("12345");
  });
});

// ========== 验收标准：AI 义项已合并到词典 ==========

describe("AI义项合并到词典", () => {
  it("含 AI 义项的词通过词典标注", () => {
    const result = annotateWords(
      "The model suffers from hallucination during inference.",
      new Set(),
    );
    const hallucination = result.find(a => a.word === "hallucination");
    expect(hallucination).toBeDefined();
    expect(hallucination!.definition).toContain("[AI]");

    const inference = result.find(a => a.word === "inference");
    expect(inference).toBeDefined();
    expect(inference!.definition).toContain("[AI]");
  });

  it("词典释义同时包含通用和 AI 义项", () => {
    const result = annotateWords(
      "The latent space representation captures semantic features.",
      new Set(),
    );
    const latent = result.find(a => a.word === "latent");
    expect(latent).toBeDefined();
    // 既有通用释义又有 AI 释义
    expect(latent!.definition).toContain("潜在的");
    expect(latent!.definition).toContain("[AI]");
  });

  it("纯 AI 术语也能通过词典标注", () => {
    const result = annotateWords(
      "Backpropagation and overfitting are key ML concepts.",
      new Set(),
    );
    const bp = result.find(a => a.word === "backpropagation");
    expect(bp).toBeDefined();
    expect(bp!.definition).toContain("反向传播");

    const of_ = result.find(a => a.word === "overfitting");
    expect(of_).toBeDefined();
    expect(of_!.definition).toContain("过拟合");
  });
});

// ========== 验收标准：已知词跳过 ==========

describe("已知词跳过", () => {
  it("标记为已掌握的词不再标注", () => {
    const known = new Set(["algorithm", "refactor"]);
    const result = annotateWords(
      "The algorithm helps refactor the infrastructure for better deployment.",
      known,
    );
    const annotatedWords = result.map(a => a.word);
    expect(annotatedWords).not.toContain("algorithm");
    expect(annotatedWords).not.toContain("refactor");
    // infrastructure 和 deployment 不在已知词中，应该被标注
    expect(annotatedWords).toContain("infrastructure");
    expect(annotatedWords).toContain("deployment");
  });

  it("已知词大小写不敏感", () => {
    const known = new Set(["algorithm"]);
    const result = annotateWords("Algorithm is important.", known);
    const annotatedWords = result.map(a => a.word);
    expect(annotatedWords).not.toContain("algorithm");
  });

  it("空已知词集不影响标注", () => {
    const result = annotateWords(
      "The algorithm uses heuristic methods.",
      new Set(),
    );
    expect(result.length).toBeGreaterThan(0);
  });
});

// ========== 辅助功能 ==========

describe("辅助功能", () => {
  it("lookupDefinitionForSelection returns a definition for common words too", () => {
    const result = lookupDefinitionForSelection("algorithm");
    expect(result).toContain("算法");
  });

  it("lookupDefinitionForSelection resolves stems", () => {
    const result = lookupDefinitionForSelection("algorithms");
    expect(result).toContain("算法");
  });

  it("toNewWordsFormat 正确转换", () => {
    const annotations = annotateWords(
      "The algorithm uses immutable data.",
      new Set(),
    );
    const newWords = toNewWordsFormat(annotations);
    expect(newWords.length).toBe(annotations.length);
    for (const nw of newWords) {
      expect(nw).toHaveProperty("word");
      expect(nw).toHaveProperty("definition");
    }
  });

  it("同一词不重复标注", () => {
    const result = annotateWords(
      "The algorithm is a good algorithm. Another algorithm here.",
      new Set(),
    );
    const algorithmAnnotations = result.filter(a => a.word === "algorithm");
    expect(algorithmAnnotations.length).toBe(1);
  });

  it("未加载数据时返回空数组", () => {
    resetAll();
    const result = annotateWords("The algorithm is great.", new Set());
    expect(result).toEqual([]);
  });

  it("无英文单词的文本返回空", () => {
    const result = annotateWords("这是一段中文文本 12345", new Set());
    expect(result).toEqual([]);
  });
});
