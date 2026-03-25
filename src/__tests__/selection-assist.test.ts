import { describe, expect, it } from "vitest";
import {
  getSelectionAssistType,
  hasSelectionToAssist,
  isPointerWithinSelectionAssistZone,
  normalizeSelectedText,
  shouldHandleSelection,
} from "../shared/selection-assist.ts";

const extremelyLargeSelection = Array.from(
  { length: 160 },
  (_, index) => `token${index + 1}`
).join(" ");

describe("normalizeSelectedText", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeSelectedText("  from   scratch \n today ")).toBe("from scratch today");
  });
});

describe("shouldHandleSelection", () => {
  it("accepts short English selections", () => {
    expect(shouldHandleSelection("scratch")).toBe(true);
    expect(shouldHandleSelection("from scratch")).toBe(true);
    expect(shouldHandleSelection("Started building an AI trader from scratch 2 days ago.")).toBe(true);
  });

  it("rejects empty or non-English selections", () => {
    expect(shouldHandleSelection("")).toBe(false);
    expect(shouldHandleSelection("   ")).toBe(false);
    expect(shouldHandleSelection("这是中文")).toBe(false);
    expect(shouldHandleSelection("对你这种情况，我的真实建议 最优路线 不要从“终极自动识别”开始。")).toBe(false);
    expect(shouldHandleSelection("第一版 MVP 微信小程序 支持拍照或上传")).toBe(false);
  });

  it("rejects only extremely large selections", () => {
    expect(shouldHandleSelection("one two three four five six seven eight nine")).toBe(true);
    expect(shouldHandleSelection(extremelyLargeSelection)).toBe(false);
  });
});

describe("getSelectionAssistType", () => {
  it("uses word mode for short selections", () => {
    expect(getSelectionAssistType("scratch")).toBe("word");
    expect(getSelectionAssistType("from scratch")).toBe("word");
  });

  it("uses sentence mode for longer sentence selections", () => {
    expect(getSelectionAssistType("Started building an AI trader from scratch 2 days ago.")).toBe("sentence");
  });

  it("uses sentence mode for two short paragraphs", () => {
    const selection = `I've been working on a tool that can automatically find potential leads, qualify them, and even organize them for agencies.
The idea is to save time so you can focus on actually serving clients instead of chasing prospects all day.

I'm curious: would you actually trust an AI to handle this for your agency? Or do you feel like lead qualification still needs a human touch?`;

    expect(getSelectionAssistType(selection)).toBe("sentence");
  });

  it("rejects overly large selections", () => {
    expect(getSelectionAssistType(extremelyLargeSelection)).toBe("none");
  });

  it("rejects mixed Chinese selections even when they contain some English tokens", () => {
    expect(getSelectionAssistType("第一版 MVP 微信小程序 支持拍照或上传")).toBe("none");
    expect(getSelectionAssistType("对你这种情况，我的真实建议 最优路线 不要从“终极自动识别”开始。")).toBe("none");
  });
});

describe("hasSelectionToAssist", () => {
  it("accepts a non-collapsed English selection", () => {
    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      toString: () => "from scratch",
    };

    expect(hasSelectionToAssist(selection)).toBe(true);
  });

  it("rejects collapsed or invalid selections", () => {
    expect(hasSelectionToAssist(null)).toBe(false);
    expect(hasSelectionToAssist({
      rangeCount: 1,
      isCollapsed: true,
      toString: () => "scratch",
    })).toBe(false);
    expect(hasSelectionToAssist({
      rangeCount: 1,
      isCollapsed: false,
      toString: () => "这是中文",
    })).toBe(false);
  });
});

describe("isPointerWithinSelectionAssistZone", () => {
  it("keeps the assist visible while moving from selection to tooltip", () => {
    const selectionRect = { left: 100, top: 240, right: 420, bottom: 320 };
    const tooltipRect = { left: 140, top: 80, right: 460, bottom: 220 };

    expect(isPointerWithinSelectionAssistZone({
      pointerX: 220,
      pointerY: 160,
      selectionRect,
      tooltipRect,
    })).toBe(true);
  });

  it("hides once the pointer leaves both the selection and tooltip region", () => {
    const selectionRect = { left: 100, top: 240, right: 420, bottom: 320 };
    const tooltipRect = { left: 140, top: 80, right: 460, bottom: 220 };

    expect(isPointerWithinSelectionAssistZone({
      pointerX: 40,
      pointerY: 32,
      selectionRect,
      tooltipRect,
    })).toBe(false);
  });
});
