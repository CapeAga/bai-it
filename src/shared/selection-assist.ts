export function normalizeSelectedText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export type SelectionAssistType = "none" | "word" | "sentence";

export interface SelectionAssistRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function countSelectionParagraphs(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  return trimmed
    .split(/\n\s*\n+/)
    .map(part => normalizeSelectedText(part))
    .filter(Boolean).length;
}

function countSelectionLines(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  return trimmed
    .split(/\n+/)
    .map(part => normalizeSelectedText(part))
    .filter(Boolean).length;
}

export function getSelectionAssistType(text: string): SelectionAssistType {
  const normalized = normalizeSelectedText(text);
  if (!normalized) return "none";
  if (/[\u3400-\u9fff\uf900-\ufaff]/.test(normalized)) return "none";
  if (!/[a-zA-Z]/.test(normalized)) return "none";

  const words = normalized.split(" ");
  const paragraphCount = countSelectionParagraphs(text);
  const lineCount = countSelectionLines(text);

  if (normalized.length <= 80 && words.length <= 8) {
    return "word";
  }

  if (
    normalized.length <= 700 &&
    words.length <= 120 &&
    paragraphCount <= 2 &&
    lineCount <= 6
  ) {
    return "sentence";
  }

  return "none";
}

export function shouldHandleSelection(text: string): boolean {
  return getSelectionAssistType(text) !== "none";
}

export function hasSelectionToAssist(
  selection: Pick<Selection, "rangeCount" | "isCollapsed" | "toString"> | null
): boolean {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }
  return shouldHandleSelection(selection.toString());
}

export function isPointerWithinSelectionAssistZone(input: {
  pointerX: number;
  pointerY: number;
  selectionRect: SelectionAssistRect | null;
  tooltipRect: SelectionAssistRect | null;
  padding?: number;
}): boolean {
  const rects = [input.selectionRect, input.tooltipRect].filter(Boolean) as SelectionAssistRect[];
  if (rects.length === 0) return false;

  const bounds = rects.reduce<SelectionAssistRect>((acc, rect) => ({
    left: Math.min(acc.left, rect.left),
    top: Math.min(acc.top, rect.top),
    right: Math.max(acc.right, rect.right),
    bottom: Math.max(acc.bottom, rect.bottom),
  }));
  const padding = input.padding ?? 16;

  return (
    input.pointerX >= bounds.left - padding &&
    input.pointerX <= bounds.right + padding &&
    input.pointerY >= bounds.top - padding &&
    input.pointerY <= bounds.bottom + padding
  );
}
