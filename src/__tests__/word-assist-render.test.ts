import { describe, expect, it } from "vitest";
import { renderWordAssistTooltip } from "../content/word-assist.ts";

describe("renderWordAssistTooltip", () => {
  it("shows English first and folds Chinese when English is available", () => {
    const html = renderWordAssistTooltip({
      word: "commission",
      phonetic: "/kəˈmɪʃən/",
      chineseHint: "佣金；提成",
      simpleEnglish: "money earned for helping to sell something",
      example: "She gets a 10% commission on every sale she makes.",
      loading: false,
      markable: true,
      chineseExpanded: false,
      hasApiKey: true,
      requestFailed: false,
    }, false);

    expect(html).toContain("money earned for helping to sell something");
    expect(html).toContain("没看懂？展开中文");
    expect(html).not.toContain("佣金；提成");
  });

  it("shows Chinese after expansion", () => {
    const html = renderWordAssistTooltip({
      word: "commission",
      phonetic: "/kəˈmɪʃən/",
      chineseHint: "佣金；提成",
      simpleEnglish: "money earned for helping to sell something",
      example: "",
      loading: false,
      markable: true,
      chineseExpanded: true,
      hasApiKey: true,
      requestFailed: false,
    }, true);

    expect(html).toContain("佣金；提成");
    expect(html).toContain("收起中文");
    expect(html).toContain("✓ 已掌握");
  });

  it("shows Chinese directly when no English layer exists", () => {
    const html = renderWordAssistTooltip({
      word: "commission",
      phonetic: "",
      chineseHint: "佣金；提成",
      simpleEnglish: "",
      example: "",
      loading: false,
      markable: false,
      chineseExpanded: false,
      hasApiKey: false,
      requestFailed: false,
    }, false);

    expect(html).toContain("佣金；提成");
    expect(html).not.toContain("展开中文");
  });

  it("shows a retry-style fallback when API is configured but the explanation request fails", () => {
    const html = renderWordAssistTooltip({
      word: "agency",
      phonetic: "",
      chineseHint: "暂无本地释义，可配置 API 获取更贴语境的解释。",
      simpleEnglish: "",
      example: "",
      loading: false,
      markable: false,
      chineseExpanded: false,
      hasApiKey: true,
      requestFailed: true,
    }, false);

    expect(html).toContain("这次没拿到更贴语境的解释");
    expect(html).not.toContain("可配置 API");
  });
});
