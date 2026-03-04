/**
 * 扫读模式本地拆分规则
 *
 * 在逻辑转换点断行：并列（and/or/but）、转折（however/although）、
 * 条件（if/unless）、因果（because/therefore）、从句（which/who/that）。
 *
 * 三级颗粒度：
 * - coarse: 仅在逗号+连词处拆分（最保守）
 * - medium: 长句允许无逗号拆分
 * - fine:   更低阈值 + 介词短语 + 引语边界拆分
 *
 * 设计原则：
 * - 即时完成（< 1ms），零 API 成本
 * - 宁可多拆不漏拆（扫读场景，快速理解优先）
 * - 复杂句（3+ 从句标记 + 本地拆不动）降级给 LLM
 */

// ========== 类型 ==========

export type Granularity = "coarse" | "medium" | "fine";

export interface ScanChunk {
  text: string;
  level: number; // 0 = 主句, 1 = 从句/修饰
}

export interface ScanResult {
  chunks: ScanChunk[];
  needsLLM: boolean;
}

// ========== 长度阈值 ==========

const THRESHOLD_WORDS: Record<string, number> = {
  short: 8,
  medium: 12,
  long: 18,
};

// ========== 关键词集合 ==========

/** 并列连词：逗号后出现时拆分，同级 */
const COORDINATE = new Set(["and", "or", "but", "nor", "yet", "so"]);

/** 强从属连词：无需逗号也可拆分 */
const STRONG_SUBORDINATE = new Set([
  "because", "although", "though", "whereas", "unless",
  "whenever", "wherever", "whether",
]);

/** 弱从属连词：需要逗号才拆分（有非连词用法） */
const WEAK_SUBORDINATE = new Set([
  "since", "while", "if", "when", "until", "before", "after", "once",
]);

/** 关系代词：逗号后出现时拆分 */
const RELATIVE = new Set(["which", "who", "whom", "whose", "where", "that"]);

/** 关系代词（宽松模式，排除 that — 歧义太大）*/
const RELATIVE_RELAXED = new Set(["which", "who", "whom", "whose", "where"]);

/** 转折/过渡词：逗号后或句首出现时拆分 */
const TRANSITION = new Set([
  "however", "therefore", "thus", "hence",
  "nevertheless", "nonetheless", "moreover", "furthermore",
  "meanwhile", "otherwise", "consequently", "accordingly",
]);

/** fine 模式介词拆分：常见引出新信息的介词/短语标记 */
const PREPOSITION_FINE = new Set([
  "about", "from", "into", "through", "across",
  "toward", "towards", "without", "despite",
  // 高频介词（配合 4+词前/4+词后约束，不会过度拆分）
  "between", "on", "for", "with", "by", "in",
  "over", "under", "beyond", "against",
  // 分词/比较短语标记
  "compared", "including",
]);

/** fine 模式疑问/关系副词：引出从句 */
const CLAUSE_STARTER_FINE = new Set(["how", "why", "what"]);

/** 所有从属标记（用于复杂度计数） */
const ALL_SUBORDINATE = new Set([
  ...STRONG_SUBORDINATE, ...WEAK_SUBORDINATE, ...RELATIVE,
]);

// ========== 工具函数 ==========

function cleanWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z'-]/g, "");
}

function endsWithPunct(word: string): boolean {
  return /[,;]$/.test(word);
}

function countSubordinateMarkers(words: string[]): number {
  let count = 0;
  for (const w of words) {
    const clean = cleanWord(w);
    if (ALL_SUBORDINATE.has(clean)) count++;
  }
  return count;
}

// ========== 核心拆分 ==========

function isSubordinateStart(word: string): boolean {
  const clean = cleanWord(word);
  return STRONG_SUBORDINATE.has(clean) || WEAK_SUBORDINATE.has(clean);
}

/**
 * 合并过短的片段（< 3 词）到相邻片段
 */
function mergeShortChunks(chunks: ScanChunk[]): ScanChunk[] {
  if (chunks.length <= 1) return chunks;

  const result: ScanChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const wordCount = chunk.text.split(/\s+/).length;

    if (wordCount < 3 && result.length > 0) {
      // Merge into previous chunk
      const prev = result[result.length - 1];
      prev.text += " " + chunk.text;
    } else if (wordCount < 3 && i < chunks.length - 1) {
      // Merge into next chunk
      chunks[i + 1] = {
        text: chunk.text + " " + chunks[i + 1].text,
        level: chunks[i + 1].level,
      };
    } else {
      result.push({ ...chunk });
    }
  }

  return result;
}

function splitAtBoundaries(sentence: string, granularity: Granularity = "medium"): ScanChunk[] {
  const words = sentence.match(/\S+/g);
  if (!words || words.length === 0) return [];

  // 颗粒度决定宽松规则的门槛
  const longThreshold = granularity === "fine" ? 12 : 15;
  const minBefore = granularity === "fine" ? 3 : 5;
  const minAfterCoord = granularity === "fine" ? 3 : 5;
  const minAfterSub = granularity === "fine" ? 3 : 4;

  const isLongSentence = words.length >= longThreshold;
  const chunks: ScanChunk[] = [];
  let currentWords: string[] = [];
  let currentLevel = isSubordinateStart(words[0]) ? 1 : 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const clean = cleanWord(word);
    const prev = i > 0 ? words[i - 1] : "";
    const prevHasPunct = endsWithPunct(prev);

    let shouldSplit = false;
    let nextLevel = 0;

    if (currentWords.length >= 2) {
      // === 严格规则（所有颗粒度）===

      // 1. 分号后拆分
      if (prev.endsWith(";")) {
        shouldSplit = true;
        nextLevel = isSubordinateStart(word) ? 1 : 0;
      }
      // 2. 并列连词（逗号后）
      else if (COORDINATE.has(clean) && prevHasPunct) {
        shouldSplit = true;
        nextLevel = 0;
      }
      // 3. 强从属连词（不需要逗号）
      else if (STRONG_SUBORDINATE.has(clean)) {
        shouldSplit = true;
        nextLevel = 1;
      }
      // 4. "even" + 从属连词 → 在 "even" 处拆分
      else if (clean === "even" && i + 1 < words.length) {
        const nextClean = cleanWord(words[i + 1]);
        if (WEAK_SUBORDINATE.has(nextClean) || STRONG_SUBORDINATE.has(nextClean)) {
          shouldSplit = true;
          nextLevel = 1;
        }
      }
      // 5. 弱从属连词（需要逗号）
      else if (WEAK_SUBORDINATE.has(clean) && prevHasPunct) {
        shouldSplit = true;
        nextLevel = 1;
      }
      // 6. 关系代词（逗号后）
      else if (RELATIVE.has(clean) && prevHasPunct) {
        shouldSplit = true;
        nextLevel = 1;
      }
      // 7. 转折/过渡词
      else if (TRANSITION.has(clean) && (prevHasPunct || i === 0)) {
        shouldSplit = true;
        nextLevel = 0;
      }
      // 8. 从属子句结束：当前在 level 1，遇到逗号后的非标记词 → 回到主句
      else if (currentLevel === 1 && prevHasPunct &&
        !COORDINATE.has(clean) && !STRONG_SUBORDINATE.has(clean) &&
        !WEAK_SUBORDINATE.has(clean) && !RELATIVE.has(clean) &&
        !TRANSITION.has(clean)) {
        shouldSplit = true;
        nextLevel = 0;
      }

      // === 宽松规则（medium + fine，无逗号也拆）===
      if (!shouldSplit && granularity !== "coarse" &&
          isLongSentence && currentWords.length >= minBefore) {
        const remaining = words.length - i;

        // 并列连词
        if (COORDINATE.has(clean) && remaining >= minAfterCoord) {
          shouldSplit = true;
          nextLevel = 0;
        }
        // 弱从属连词
        else if (WEAK_SUBORDINATE.has(clean) && remaining >= minAfterSub) {
          shouldSplit = true;
          nextLevel = 1;
        }
        // 关系代词（排除 that）
        else if (RELATIVE_RELAXED.has(clean) && remaining >= minAfterSub) {
          shouldSplit = true;
          nextLevel = 1;
        }
      }

      // === fine 模式额外规则 ===
      if (!shouldSplit && granularity === "fine" &&
          isLongSentence && currentWords.length >= 4) {
        const remaining = words.length - i;

        // 介词短语拆分（前 4+ 词，后 4+ 词）
        if (PREPOSITION_FINE.has(clean) && remaining >= 4) {
          shouldSplit = true;
          nextLevel = 1;
        }
        // 疑问/关系副词引出的从句（how/why/what）
        else if (CLAUSE_STARTER_FINE.has(clean) && remaining >= 4) {
          shouldSplit = true;
          nextLevel = 1;
        }
        // 引语边界：引号开头（前 3+ 词）
        else if (/^["'\u201C\u2018]/.test(word) && currentWords.length >= 3) {
          shouldSplit = true;
          nextLevel = 0;
        }
      }
    }

    if (shouldSplit && currentWords.length > 0) {
      chunks.push({ text: currentWords.join(" "), level: currentLevel });
      currentWords = [word];
      currentLevel = nextLevel;
    } else {
      currentWords.push(word);
    }
  }

  if (currentWords.length > 0) {
    chunks.push({ text: currentWords.join(" "), level: currentLevel });
  }

  return mergeShortChunks(chunks);
}

// ========== 导出函数 ==========

/**
 * 扫读模式本地拆分
 *
 * @param sentence 要拆分的句子
 * @param threshold 长度阈值 ("short" | "medium" | "long")
 * @param granularity 拆分颗粒度 ("coarse" | "medium" | "fine")
 * @returns 拆分结果，包含分块和是否需要 LLM 降级
 */
export function scanSplit(
  sentence: string,
  threshold: "short" | "medium" | "long" = "medium",
  granularity: Granularity = "medium",
): ScanResult {
  const trimmed = sentence.trim();
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  const minWords = THRESHOLD_WORDS[threshold];

  // 太短不拆
  if (words.length < minWords) {
    return { chunks: [{ text: trimmed, level: 0 }], needsLLM: false };
  }

  // 先尝试本地拆分
  const chunks = splitAtBoundaries(trimmed, granularity);

  // 本地拆分成功 → 直接用
  if (chunks.length > 1) {
    return { chunks, needsLLM: false };
  }

  // 本地拆不动 + 复杂句（3+ 从属标记）→ 降级 LLM
  const markerCount = countSubordinateMarkers(words);
  if (markerCount >= 3) {
    return { chunks: [{ text: trimmed, level: 0 }], needsLLM: true };
  }

  // 本地拆不动 + 不复杂 → 保持原样
  return { chunks: [{ text: trimmed, level: 0 }], needsLLM: false };
}

/**
 * 将 ScanChunk[] 转为 renderer 期望的缩进文本格式
 *
 * 格式：每行用前导空格表示缩进级别（2 空格 = 1 级）
 */
export function toChunkedString(chunks: ScanChunk[]): string {
  return chunks.map(c => "  ".repeat(c.level) + c.text).join("\n");
}
