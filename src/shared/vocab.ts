/**
 * 生词标注系统
 *
 * 词汇源：
 * 1. 通用离线词典（ECDICT 31K 词条）— 基础释义
 * 2. LLM 语境化释义 — 仅在调 LLM 时获得
 *
 * 过滤规则：
 * - 常用词（ECDICT BNC/FRQ ≤ 5000）不标注
 * - 词形变体还原到原形后判断（ECDICT exchange 字段）
 * - 用户已标记"已掌握"的词不标注
 * - 太短的词（< 3 字母）不标注
 */

// ========== 类型 ==========

export interface VocabAnnotation {
  word: string;
  definition: string;
}

// ========== 数据存储 ==========

let frequencySet: Set<string> | null = null;
let dictMap: Map<string, string> | null = null;
let lemmaMap: Map<string, string> | null = null;

// ========== 数据加载 ==========

/**
 * 初始化词频表
 * @param words 常用词数组
 */
export function loadFrequencyList(words: string[]): void {
  frequencySet = new Set(words.map(w => w.toLowerCase()));
}

/**
 * 初始化通用词典
 * @param entries word → definition 映射对象
 */
export function loadDictionary(entries: Record<string, string>): void {
  dictMap = new Map();
  for (const [word, def] of Object.entries(entries)) {
    dictMap.set(word.toLowerCase(), def);
  }
}

/**
 * 初始化词形映射表（variant → base form）
 * @param entries variant → base 映射对象
 */
export function loadLemmaMap(entries: Record<string, string>): void {
  lemmaMap = new Map();
  for (const [variant, base] of Object.entries(entries)) {
    lemmaMap.set(variant.toLowerCase(), base.toLowerCase());
  }
}

/**
 * 检查数据是否已加载
 */
export function isLoaded(): boolean {
  return frequencySet !== null && dictMap !== null;
}

// ========== 核心逻辑 ==========

/** 不标注的词：太短、纯数字、含特殊字符、缩写 */
function shouldSkipWord(word: string): boolean {
  if (word.length < 3) return true;
  if (/^\d+$/.test(word)) return true;
  if (/[^a-zA-Z'-]/.test(word)) return true;
  // 跳过英文缩写：don't, won't, I'm, he's, they're 等
  if (word.includes("'")) return true;
  return false;
}

/**
 * 获取词的原形候选（通过 lemma 映射表 + 简单后缀规则兜底）
 *
 * 优先用 ECDICT exchange 字段生成的 lemma 映射（准确），
 * 如果映射表没有，用简单后缀规则兜底（覆盖常见变形）。
 */
export function getStemCandidates(word: string): string[] {
  const w = word.toLowerCase();
  const candidates: string[] = [w];

  // 1. 查 lemma 映射表（最准确）
  if (lemmaMap) {
    const base = lemmaMap.get(w);
    if (base) {
      candidates.push(base);
      return candidates; // lemma 表有结果就不需要猜了
    }
  }

  // 2. 兜底：简单后缀规则（处理 lemma 表未覆盖的变形）
  if (w.endsWith("ing") && w.length > 5) {
    const stem = w.slice(0, -3);
    candidates.push(stem);
    candidates.push(stem + "e");
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      candidates.push(stem.slice(0, -1));
    }
  }

  if (w.endsWith("ed") && w.length > 4) {
    candidates.push(w.slice(0, -2));
    candidates.push(w.slice(0, -1));
    const stem = w.slice(0, -2);
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      candidates.push(stem.slice(0, -1));
    }
    if (w.endsWith("ied")) {
      candidates.push(w.slice(0, -3) + "y");
    }
  }

  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes") ||
      w.endsWith("ches") || w.endsWith("shes")) {
    candidates.push(w.slice(0, -2));
  } else if (w.endsWith("ies") && w.length > 4) {
    candidates.push(w.slice(0, -3) + "y");
  } else if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) {
    candidates.push(w.slice(0, -1));
  }

  if (w.endsWith("ly") && w.length > 4) {
    candidates.push(w.slice(0, -2));
    if (w.endsWith("ally") && w.length > 6) {
      candidates.push(w.slice(0, -4));
      candidates.push(w.slice(0, -4) + "al");
    }
    if (w.endsWith("ily")) {
      candidates.push(w.slice(0, -3) + "y");
    }
  }

  return [...new Set(candidates)];
}

/** 检查是否为常用词（含词形变体） */
export function isCommonWord(word: string): boolean {
  if (!frequencySet) return false;
  const candidates = getStemCandidates(word);
  return candidates.some(c => frequencySet!.has(c));
}

/** 在通用词典中查找（含词形变体） */
function lookupDictionary(word: string): string | null {
  if (!dictMap) return null;
  const candidates = getStemCandidates(word);
  for (const c of candidates) {
    if (dictMap.has(c)) return dictMap.get(c)!;
  }
  return null;
}

export function lookupDefinitionForSelection(text: string): string | null {
  if (!dictMap) return null;
  const direct = dictMap.get(text.toLowerCase());
  if (direct) return direct;
  return lookupDictionary(text);
}

/**
 * 标注文本中的生词
 *
 * @param text 要标注的文本
 * @param knownWords 用户已掌握的词（Set<lowercase word>）
 * @returns 需要标注的生词及释义
 */
export function annotateWords(
  text: string,
  knownWords: Set<string>,
): VocabAnnotation[] {
  if (!frequencySet || !dictMap) return [];

  // 提取所有英文单词（去重）
  const wordMatches = text.match(/\b[a-zA-Z][a-zA-Z'-]*[a-zA-Z]\b|[a-zA-Z]{3,}\b/g);
  if (!wordMatches) return [];

  const seen = new Set<string>();
  const annotations: VocabAnnotation[] = [];

  for (const word of wordMatches) {
    const lower = word.toLowerCase();

    // 去重
    if (seen.has(lower)) continue;
    seen.add(lower);

    // 跳过条件
    if (shouldSkipWord(word)) continue;
    if (isCommonWord(word)) continue;
    if (knownWords.has(lower)) continue;

    // 在词典中查找释义
    const dictDef = lookupDictionary(word);
    if (dictDef) {
      annotations.push({ word: lower, definition: dictDef });
    }
    // 无释义来源 → 不标注（不猜测）
  }

  return annotations;
}

/**
 * 将 VocabAnnotation[] 转为 ChunkResult.newWords 格式
 */
export function toNewWordsFormat(
  annotations: VocabAnnotation[],
): { word: string; definition: string }[] {
  return annotations.map(a => ({
    word: a.word,
    definition: a.definition,
  }));
}

// ========== 重置（测试用）==========

export function resetAll(): void {
  frequencySet = null;
  dictMap = null;
  lemmaMap = null;
}
