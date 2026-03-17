import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  openDB,
  closeDB,
  resetDBInstance,
  DB_NAME,
  DB_VERSION,
  STORES,
  vocabDAO,
  vocabContextDAO,
  patternDAO,
  patternExampleDAO,
  learningRecordDAO,
  settingsDAO,
  weeklyReportDAO,
  reviewItemDAO,
  wallpaperRecordDAO,
  pendingSentenceDAO,
} from "../shared/db";

let db: IDBDatabase;

beforeEach(async () => {
  resetDBInstance();
  db = await openDB(indexedDB);
});

afterEach(() => {
  closeDB();
  // 删掉数据库，下次测试从头建
  indexedDB.deleteDatabase(DB_NAME);
});

// ========== Schema ==========

describe("Schema 创建", () => {
  it("创建了 12 张表", () => {
    const names = Array.from(db.objectStoreNames);
    expect(names).toHaveLength(12);
    for (const store of Object.values(STORES)) {
      expect(names).toContain(store);
    }
  });

  it("vocab 表有正确的索引", () => {
    const tx = db.transaction(STORES.vocab, "readonly");
    const store = tx.objectStore(STORES.vocab);
    expect(store.keyPath).toBe("id");
    expect(Array.from(store.indexNames)).toContain("by_word");
    expect(Array.from(store.indexNames)).toContain("by_status");
  });

  it("review_items 表有 by_next_review_at 索引", () => {
    const tx = db.transaction(STORES.review_items, "readonly");
    const store = tx.objectStore(STORES.review_items);
    expect(Array.from(store.indexNames)).toContain("by_next_review_at");
  });

  it("settings 表用 key 做主键", () => {
    const tx = db.transaction(STORES.settings, "readonly");
    const store = tx.objectStore(STORES.settings);
    expect(store.keyPath).toBe("key");
  });
});

describe("Schema 升级", () => {
  it("重新打开同版本数据库不丢数据", async () => {
    // 先写入一条
    await vocabDAO.add(db, { word: "persistent", status: "new" });
    closeDB();

    // 重新打开
    db = await openDB(indexedDB);
    const record = await vocabDAO.getByWord(db, "persistent");
    expect(record).toBeDefined();
    expect(record!.word).toBe("persistent");
  });
});

// ========== Vocab ==========

describe("vocab CRUD", () => {
  it("添加生词", async () => {
    const record = await vocabDAO.add(db, {
      word: "ephemeral",
      status: "new",
      definition: "短暂的",
    });
    expect(record.id).toBeTruthy();
    expect(record.word).toBe("ephemeral");
    expect(record.status).toBe("new");
    expect(record.encounter_count).toBe(1);
    expect(record.is_dirty).toBe(true);
    expect(record.updated_at).toBeGreaterThan(0);
  });

  it("按 ID 查询", async () => {
    const created = await vocabDAO.add(db, { word: "ubiquitous", status: "new" });
    const found = await vocabDAO.getById(db, created.id);
    expect(found).toBeDefined();
    expect(found!.word).toBe("ubiquitous");
  });

  it("按 word 查询（唯一索引）", async () => {
    await vocabDAO.add(db, { word: "paradigm", status: "new" });
    const found = await vocabDAO.getByWord(db, "paradigm");
    expect(found).toBeDefined();
    expect(found!.word).toBe("paradigm");
  });

  it("按 status 查询", async () => {
    await vocabDAO.add(db, { word: "a", status: "new" });
    await vocabDAO.add(db, { word: "b", status: "mastered" });
    await vocabDAO.add(db, { word: "c", status: "new" });

    const newWords = await vocabDAO.getByStatus(db, "new");
    expect(newWords).toHaveLength(2);

    const mastered = await vocabDAO.getByStatus(db, "mastered");
    expect(mastered).toHaveLength(1);
  });

  it("更新生词", async () => {
    const created = await vocabDAO.add(db, { word: "mutable", status: "new" });
    const updated = await vocabDAO.update(db, created.id, { definition: "可变的" });
    expect(updated).toBeDefined();
    expect(updated!.definition).toBe("可变的");
    expect(updated!.word).toBe("mutable"); // 其他字段不变
    expect(updated!.updated_at).toBeGreaterThanOrEqual(created.updated_at);
  });

  it("更新不存在的记录返回 undefined", async () => {
    const result = await vocabDAO.update(db, "nonexistent-id", { status: "mastered" });
    expect(result).toBeUndefined();
  });

  it("删除生词", async () => {
    const created = await vocabDAO.add(db, { word: "deletable", status: "new" });
    await vocabDAO.delete(db, created.id);
    const found = await vocabDAO.getById(db, created.id);
    expect(found).toBeUndefined();
  });

  it("recordEncounter 增加遭遇次数", async () => {
    const created = await vocabDAO.add(db, { word: "frequent", status: "new" });
    expect(created.encounter_count).toBe(1);

    const updated = await vocabDAO.recordEncounter(db, created.id);
    expect(updated!.encounter_count).toBe(2);

    const again = await vocabDAO.recordEncounter(db, updated!.id);
    expect(again!.encounter_count).toBe(3);
  });

  it("markMastered 标记已掌握", async () => {
    const created = await vocabDAO.add(db, { word: "known", status: "new" });
    const mastered = await vocabDAO.markMastered(db, created.id);
    expect(mastered!.status).toBe("mastered");
    expect(mastered!.mastered_at).toBeGreaterThan(0);
  });

  it("getMasteredWords 返回已掌握词集合", async () => {
    await vocabDAO.add(db, { word: "apple", status: "mastered" });
    await vocabDAO.add(db, { word: "banana", status: "mastered" });
    await vocabDAO.add(db, { word: "cherry", status: "new" });

    const set = await vocabDAO.getMasteredWords(db);
    expect(set.size).toBe(2);
    expect(set.has("apple")).toBe(true);
    expect(set.has("banana")).toBe(true);
    expect(set.has("cherry")).toBe(false);
  });

  it("getAll 返回所有生词", async () => {
    await vocabDAO.add(db, { word: "x", status: "new" });
    await vocabDAO.add(db, { word: "y", status: "new" });
    const all = await vocabDAO.getAll(db);
    expect(all).toHaveLength(2);
  });
});

// ========== VocabContexts ==========

describe("vocab_contexts CRUD", () => {
  it("添加并按 vocab_id 查询", async () => {
    const vocab = await vocabDAO.add(db, { word: "context", status: "new" });

    const ctx1 = await vocabContextDAO.add(db, {
      vocab_id: vocab.id,
      sentence: "The context of the discussion was important.",
      context_definition: "上下文、背景",
      source_url: "https://example.com/article1",
    });
    await vocabContextDAO.add(db, {
      vocab_id: vocab.id,
      sentence: "In this context, the word means something different.",
      context_definition: "语境",
      source_url: "https://example.com/article2",
    });

    expect(ctx1.id).toBeTruthy();
    expect(ctx1.is_dirty).toBe(true);

    const contexts = await vocabContextDAO.getByVocabId(db, vocab.id);
    expect(contexts).toHaveLength(2);
  });

  it("删除", async () => {
    const ctx = await vocabContextDAO.add(db, {
      vocab_id: "v1",
      sentence: "test",
      context_definition: "测试",
      source_url: "https://example.com",
    });
    await vocabContextDAO.delete(db, ctx.id);
    const all = await vocabContextDAO.getAll(db);
    expect(all).toHaveLength(0);
  });
});

// ========== Patterns ==========

describe("patterns CRUD", () => {
  it("添加句式类型", async () => {
    const pattern = await patternDAO.add(db, { key: "nested" });
    expect(pattern.key).toBe("nested");
    expect(pattern.count).toBe(1);
  });

  it("按 key 查询（唯一索引）", async () => {
    await patternDAO.add(db, { key: "insertion" });
    const found = await patternDAO.getByKey(db, "insertion");
    expect(found).toBeDefined();
    expect(found!.key).toBe("insertion");
  });

  it("incrementCount 增加计数", async () => {
    await patternDAO.add(db, { key: "contrast" });
    const updated = await patternDAO.incrementCount(db, "contrast");
    expect(updated!.count).toBe(2);

    const again = await patternDAO.incrementCount(db, "contrast");
    expect(again!.count).toBe(3);
  });

  it("incrementCount 对不存在的 key 返回 undefined", async () => {
    const result = await patternDAO.incrementCount(db, "nonexistent");
    expect(result).toBeUndefined();
  });

  it("删除", async () => {
    const p = await patternDAO.add(db, { key: "inverted" });
    await patternDAO.delete(db, p.id);
    const found = await patternDAO.getById(db, p.id);
    expect(found).toBeUndefined();
  });

  it("getAll 返回所有句式", async () => {
    await patternDAO.add(db, { key: "nested" });
    await patternDAO.add(db, { key: "insertion" });
    const all = await patternDAO.getAll(db);
    expect(all).toHaveLength(2);
  });
});

// ========== PatternExamples ==========

describe("pattern_examples CRUD", () => {
  it("添加并按 pattern_id 查询", async () => {
    const pattern = await patternDAO.add(db, { key: "nested" });

    await patternExampleDAO.add(db, {
      pattern_id: pattern.id,
      sentence: "The book that the teacher who I met recommended was great.",
      chunked: "The book\n  that the teacher\n    who I met\n  recommended\nwas great.",
      explanation: "三层嵌套：主句套定从套定从",
      source_url: "https://x.com/post/123",
    });
    await patternExampleDAO.add(db, {
      pattern_id: pattern.id,
      sentence: "Another nested sentence.",
      chunked: "Another\n  nested sentence.",
    });

    const examples = await patternExampleDAO.getByPatternId(db, pattern.id);
    expect(examples).toHaveLength(2);
    expect(examples[0].sentence).toBeTruthy();
  });

  it("删除", async () => {
    const ex = await patternExampleDAO.add(db, {
      pattern_id: "p1",
      sentence: "test",
      chunked: "test",
    });
    await patternExampleDAO.delete(db, ex.id);
    const all = await patternExampleDAO.getAll(db);
    expect(all).toHaveLength(0);
  });
});

// ========== LearningRecords ==========

describe("learning_records CRUD", () => {
  it("添加阅读记录", async () => {
    const record = await learningRecordDAO.add(db, {
      sentence: "The algorithm that powers the recommendation engine uses collaborative filtering.",
      chunked: "The algorithm\n  that powers the recommendation engine\nuses collaborative filtering.",
      sentence_analysis: "主语后面跟了一个 that 定语从句修饰 algorithm",
      expression_tips: "the X that powers Y — 驱动 Y 的 X",
      pattern_key: "nested",
      new_words: [{ word: "collaborative", definition: "协作的" }],
      source_url: "https://example.com",
      llm_provider: "gemini",
      tokens_used: 150,
    });

    expect(record.id).toBeTruthy();
    expect(record.sentence_analysis).toBeTruthy();
    expect(record.new_words).toHaveLength(1);
  });

  it("按 ID 查询", async () => {
    const created = await learningRecordDAO.add(db, {
      sentence: "test",
      chunked: "test",
      new_words: [],
    });
    const found = await learningRecordDAO.getById(db, created.id);
    expect(found).toBeDefined();
    expect(found!.sentence).toBe("test");
  });

  it("按 pattern_key 查询", async () => {
    await learningRecordDAO.add(db, {
      sentence: "s1",
      chunked: "s1",
      pattern_key: "nested",
      new_words: [],
    });
    await learningRecordDAO.add(db, {
      sentence: "s2",
      chunked: "s2",
      pattern_key: "insertion",
      new_words: [],
    });
    await learningRecordDAO.add(db, {
      sentence: "s3",
      chunked: "s3",
      pattern_key: "nested",
      new_words: [],
    });

    const nested = await learningRecordDAO.getByPatternKey(db, "nested");
    expect(nested).toHaveLength(2);
  });

  it("按 source_url 查询", async () => {
    const url = "https://x.com/post/456";
    await learningRecordDAO.add(db, {
      sentence: "s1",
      chunked: "s1",
      source_url: url,
      new_words: [],
    });
    const found = await learningRecordDAO.getBySourceUrl(db, url);
    expect(found).toHaveLength(1);
  });

  it("按时间范围查询", async () => {
    const r1 = await learningRecordDAO.add(db, { sentence: "old", chunked: "old", new_words: [] });
    // 模拟一条更早的记录
    await learningRecordDAO.update(db, r1.id, { created_at: 1000 });

    const r2 = await learningRecordDAO.add(db, { sentence: "new", chunked: "new", new_words: [] });

    const range = await learningRecordDAO.getByDateRange(db, r2.created_at - 1, r2.created_at + 1);
    expect(range).toHaveLength(1);
    expect(range[0].sentence).toBe("new");
  });

  it("更新", async () => {
    const created = await learningRecordDAO.add(db, {
      sentence: "original",
      chunked: "original",
      new_words: [],
    });
    const updated = await learningRecordDAO.update(db, created.id, {
      sentence_analysis: "added later",
    });
    expect(updated!.sentence_analysis).toBe("added later");
    expect(updated!.sentence).toBe("original");
  });

  it("删除", async () => {
    const created = await learningRecordDAO.add(db, {
      sentence: "bye",
      chunked: "bye",
      new_words: [],
    });
    await learningRecordDAO.delete(db, created.id);
    const found = await learningRecordDAO.getById(db, created.id);
    expect(found).toBeUndefined();
  });
});

// ========== Settings ==========

describe("settings CRUD", () => {
  it("设置和获取", async () => {
    await settingsDAO.set(db, "review_time", "09:00");
    const value = await settingsDAO.get(db, "review_time");
    expect(value).toBe("09:00");
  });

  it("获取不存在的 key 返回 undefined", async () => {
    const value = await settingsDAO.get(db, "nonexistent");
    expect(value).toBeUndefined();
  });

  it("覆盖已有值", async () => {
    await settingsDAO.set(db, "theme", "light");
    await settingsDAO.set(db, "theme", "dark");
    const value = await settingsDAO.get(db, "theme");
    expect(value).toBe("dark");
  });

  it("支持复杂值（对象/数组）", async () => {
    const complexValue = { schedule: [1, 3, 7], enabled: true };
    await settingsDAO.set(db, "review_schedule", complexValue);
    const value = await settingsDAO.get(db, "review_schedule");
    expect(value).toEqual(complexValue);
  });

  it("删除", async () => {
    await settingsDAO.set(db, "to_delete", "value");
    await settingsDAO.delete(db, "to_delete");
    const value = await settingsDAO.get(db, "to_delete");
    expect(value).toBeUndefined();
  });

  it("getAll 返回所有设置", async () => {
    await settingsDAO.set(db, "a", 1);
    await settingsDAO.set(db, "b", 2);
    const all = await settingsDAO.getAll(db);
    expect(all).toHaveLength(2);
  });
});

// ========== WeeklyReports ==========

describe("weekly_reports CRUD", () => {
  const sampleStats = {
    total_sentences: 42,
    total_new_words: 15,
    pattern_distribution: { nested: 10, insertion: 8 },
    top_words: [{ word: "algorithm", count: 5 }],
  };

  it("添加周报", async () => {
    const report = await weeklyReportDAO.add(db, {
      week_start: "2026-02-23",
      content: "本周你阅读了 42 个难句...",
      stats: sampleStats,
    });
    expect(report.id).toBeTruthy();
    expect(report.week_start).toBe("2026-02-23");
    expect(report.stats.total_sentences).toBe(42);
  });

  it("按 week_start 查询（唯一索引）", async () => {
    await weeklyReportDAO.add(db, {
      week_start: "2026-02-23",
      content: "report",
      stats: sampleStats,
    });
    const found = await weeklyReportDAO.getByWeekStart(db, "2026-02-23");
    expect(found).toBeDefined();
    expect(found!.content).toBe("report");
  });

  it("查询不存在的周报返回 undefined", async () => {
    const found = await weeklyReportDAO.getByWeekStart(db, "2099-01-01");
    expect(found).toBeUndefined();
  });

  it("更新周报", async () => {
    const created = await weeklyReportDAO.add(db, {
      week_start: "2026-03-02",
      content: "draft",
      stats: sampleStats,
    });
    const updated = await weeklyReportDAO.update(db, created.id, { content: "final" });
    expect(updated!.content).toBe("final");
  });

  it("删除", async () => {
    const created = await weeklyReportDAO.add(db, {
      week_start: "2026-03-09",
      content: "bye",
      stats: sampleStats,
    });
    await weeklyReportDAO.delete(db, created.id);
    const all = await weeklyReportDAO.getAll(db);
    expect(all).toHaveLength(0);
  });
});

// ========== ReviewItems ==========

describe("review_items CRUD", () => {
  it("添加复习项（SM-2 默认值）", async () => {
    const item = await reviewItemDAO.add(db, {
      type: "sentence",
      reference_id: "lr-123",
      next_review_at: Date.now() + 86400000,
    });
    expect(item.ease_factor).toBe(2.5);
    expect(item.interval).toBe(1);
    expect(item.repetitions).toBe(0);
  });

  it("getDueItems 获取到期项", async () => {
    const now = Date.now();
    // 到期的
    await reviewItemDAO.add(db, {
      type: "sentence",
      reference_id: "r1",
      next_review_at: now - 1000,
    });
    // 未到期的
    await reviewItemDAO.add(db, {
      type: "word",
      reference_id: "r2",
      next_review_at: now + 86400000,
    });

    const due = await reviewItemDAO.getDueItems(db, now);
    expect(due).toHaveLength(1);
    expect(due[0].reference_id).toBe("r1");
  });

  it("按 reference_id 查询", async () => {
    await reviewItemDAO.add(db, {
      type: "sentence",
      reference_id: "lr-abc",
      next_review_at: Date.now(),
    });
    const found = await reviewItemDAO.getByReferenceId(db, "lr-abc");
    expect(found).toHaveLength(1);
  });

  it("删除", async () => {
    const item = await reviewItemDAO.add(db, {
      type: "word",
      reference_id: "v1",
      next_review_at: Date.now(),
    });
    await reviewItemDAO.delete(db, item.id);
    const found = await reviewItemDAO.getById(db, item.id);
    expect(found).toBeUndefined();
  });
});

describe("review_items SM-2 算法", () => {
  it("quality >= 3：间隔递增", async () => {
    const item = await reviewItemDAO.add(db, {
      type: "sentence",
      reference_id: "lr-1",
      next_review_at: Date.now(),
    });

    // 第一次复习（quality=4，记得）
    const r1 = await reviewItemDAO.review(db, item.id, 4);
    expect(r1!.repetitions).toBe(1);
    expect(r1!.interval).toBe(1); // 首次 → 1 天

    // 第二次复习
    const r2 = await reviewItemDAO.review(db, r1!.id, 4);
    expect(r2!.repetitions).toBe(2);
    expect(r2!.interval).toBe(6); // 第二次 → 6 天

    // 第三次复习
    const r3 = await reviewItemDAO.review(db, r2!.id, 4);
    expect(r3!.repetitions).toBe(3);
    expect(r3!.interval).toBeGreaterThan(6); // interval * ease_factor
  });

  it("quality < 3：重置进度", async () => {
    const item = await reviewItemDAO.add(db, {
      type: "sentence",
      reference_id: "lr-2",
      next_review_at: Date.now(),
    });

    // 先成功复习几次
    let current = await reviewItemDAO.review(db, item.id, 5);
    current = await reviewItemDAO.review(db, current!.id, 5);
    expect(current!.repetitions).toBe(2);

    // 忘了（quality=1）
    const forgot = await reviewItemDAO.review(db, current!.id, 1);
    expect(forgot!.repetitions).toBe(0);
    expect(forgot!.interval).toBe(1);
  });

  it("ease_factor 不低于 1.3", async () => {
    const item = await reviewItemDAO.add(db, {
      type: "word",
      reference_id: "v-1",
      next_review_at: Date.now(),
    });

    // 连续低分复习，ease_factor 会下降但不会低于 1.3
    let current = item;
    for (let i = 0; i < 10; i++) {
      current = (await reviewItemDAO.review(db, current.id, 3))!;
    }
    expect(current.ease_factor).toBeGreaterThanOrEqual(1.3);
  });

  it("review 更新 next_review_at 和 last_reviewed_at", async () => {
    const item = await reviewItemDAO.add(db, {
      type: "sentence",
      reference_id: "lr-3",
      next_review_at: Date.now(),
    });

    const before = Date.now();
    const reviewed = await reviewItemDAO.review(db, item.id, 4);
    expect(reviewed!.last_reviewed_at).toBeGreaterThanOrEqual(before);
    expect(reviewed!.next_review_at).toBeGreaterThan(reviewed!.last_reviewed_at!);
  });

  it("review 不存在的 ID 返回 undefined", async () => {
    const result = await reviewItemDAO.review(db, "nonexistent", 4);
    expect(result).toBeUndefined();
  });
});

// ========== WallpaperRecords ==========

describe("wallpaper_records CRUD", () => {
  it("添加壁纸记录", async () => {
    const record = await wallpaperRecordDAO.add(db, {
      sentence: "The beauty of code is in its simplicity.",
      style: "gradient",
    });
    expect(record.id).toBeTruthy();
    expect(record.sentence).toBeTruthy();
    expect(record.is_dirty).toBe(true);
  });

  it("getAll 返回所有记录", async () => {
    await wallpaperRecordDAO.add(db, { sentence: "s1" });
    await wallpaperRecordDAO.add(db, { sentence: "s2" });
    const all = await wallpaperRecordDAO.getAll(db);
    expect(all).toHaveLength(2);
  });

  it("删除", async () => {
    const r = await wallpaperRecordDAO.add(db, { sentence: "bye" });
    await wallpaperRecordDAO.delete(db, r.id);
    const all = await wallpaperRecordDAO.getAll(db);
    expect(all).toHaveLength(0);
  });
});

// ========== PendingSentences ==========

describe("pending_sentences CRUD", () => {
  it("添加待分析句子", async () => {
    const record = await pendingSentenceDAO.add(db, {
      text: "The algorithm that powers the recommendation engine uses collaborative filtering.",
      source_url: "https://example.com/article",
      source_hostname: "example.com",
      manual: false,
      new_words: ["collaborative", "filtering"],
    });
    expect(record).not.toBeNull();
    expect(record!.id).toBeTruthy();
    expect(record!.analyzed).toBe(false);
    expect(record!.manual).toBe(false);
    expect(record!.new_words).toEqual(["collaborative", "filtering"]);
  });

  it("去重：相同文本返回 null", async () => {
    const text = "Duplicate sentence for testing.";
    const first = await pendingSentenceDAO.add(db, {
      text,
      source_url: "https://a.com",
      source_hostname: "a.com",
      manual: false,
      new_words: [],
    });
    expect(first).not.toBeNull();

    const second = await pendingSentenceDAO.add(db, {
      text,
      source_url: "https://b.com",
      source_hostname: "b.com",
      manual: true,
      new_words: ["test"],
    });
    expect(second).toBeNull();
  });

  it("getByText 按唯一索引查找", async () => {
    const text = "Unique sentence here.";
    await pendingSentenceDAO.add(db, {
      text,
      source_url: "https://example.com",
      source_hostname: "example.com",
      manual: false,
      new_words: [],
    });

    const found = await pendingSentenceDAO.getByText(db, text);
    expect(found).toBeDefined();
    expect(found!.text).toBe(text);

    const notFound = await pendingSentenceDAO.getByText(db, "nonexistent");
    expect(notFound).toBeUndefined();
  });

  it("getUnanalyzed 返回未分析记录，manual 优先", async () => {
    await pendingSentenceDAO.add(db, {
      text: "Auto sentence 1",
      source_url: "https://a.com",
      source_hostname: "a.com",
      manual: false,
      new_words: [],
    });
    await pendingSentenceDAO.add(db, {
      text: "Manual sentence",
      source_url: "https://b.com",
      source_hostname: "b.com",
      manual: true,
      new_words: [],
    });
    await pendingSentenceDAO.add(db, {
      text: "Auto sentence 2",
      source_url: "https://c.com",
      source_hostname: "c.com",
      manual: false,
      new_words: [],
    });

    const unanalyzed = await pendingSentenceDAO.getUnanalyzed(db);
    expect(unanalyzed).toHaveLength(3);
    // manual first
    expect(unanalyzed[0].manual).toBe(true);
    expect(unanalyzed[0].text).toBe("Manual sentence");
  });

  it("markAnalyzed 标记已分析", async () => {
    const record = await pendingSentenceDAO.add(db, {
      text: "To be analyzed.",
      source_url: "https://example.com",
      source_hostname: "example.com",
      manual: false,
      new_words: [],
    });

    await pendingSentenceDAO.markAnalyzed(db, record!.id);
    const updated = await pendingSentenceDAO.getById(db, record!.id);
    expect(updated!.analyzed).toBe(true);

    // 不再出现在 unanalyzed 列表
    const unanalyzed = await pendingSentenceDAO.getUnanalyzed(db);
    expect(unanalyzed).toHaveLength(0);
  });

  it("getPage 分页", async () => {
    for (let i = 0; i < 5; i++) {
      await pendingSentenceDAO.add(db, {
        text: `Sentence ${i}`,
        source_url: "https://example.com",
        source_hostname: "example.com",
        manual: i === 2, // 第 3 条是 manual
        new_words: [],
      });
    }

    const page1 = await pendingSentenceDAO.getPage(db, 1, 2);
    expect(page1.total).toBe(5);
    expect(page1.records).toHaveLength(2);
    // manual 排第一
    expect(page1.records[0].manual).toBe(true);

    const page2 = await pendingSentenceDAO.getPage(db, 2, 2);
    expect(page2.records).toHaveLength(2);

    const page3 = await pendingSentenceDAO.getPage(db, 3, 2);
    expect(page3.records).toHaveLength(1);
  });

  it("delete 删除", async () => {
    const record = await pendingSentenceDAO.add(db, {
      text: "To be deleted.",
      source_url: "https://example.com",
      source_hostname: "example.com",
      manual: false,
      new_words: [],
    });
    await pendingSentenceDAO.delete(db, record!.id);
    const found = await pendingSentenceDAO.getById(db, record!.id);
    expect(found).toBeUndefined();
  });
});

// ========== Schema v1→v2 升级 ==========

describe("Schema v1→v2 升级", () => {
  it("v1 数据库升级到 v2：旧数据不丢 + 新表存在", async () => {
    // 先关闭当前 v2 数据库
    closeDB();
    indexedDB.deleteDatabase(DB_NAME);

    // 手动创建 v1 数据库
    const v1db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        // 只建 v1 的 9 张表（简化版：只建几张关键的）
        const vocab = d.createObjectStore("vocab", { keyPath: "id" });
        vocab.createIndex("by_word", "word", { unique: true });
        vocab.createIndex("by_status", "status");
        vocab.createIndex("by_updated_at", "updated_at");

        d.createObjectStore("vocab_contexts", { keyPath: "id" })
          .createIndex("by_vocab_id", "vocab_id");
        d.createObjectStore("patterns", { keyPath: "id" })
          .createIndex("by_key", "key", { unique: true });
        d.createObjectStore("pattern_examples", { keyPath: "id" })
          .createIndex("by_pattern_id", "pattern_id");

        const lr = d.createObjectStore("learning_records", { keyPath: "id" });
        lr.createIndex("by_created_at", "created_at");
        lr.createIndex("by_pattern_key", "pattern_key");
        lr.createIndex("by_source_url", "source_url");
        lr.createIndex("by_updated_at", "updated_at");

        d.createObjectStore("settings", { keyPath: "key" });
        d.createObjectStore("weekly_reports", { keyPath: "id" });
        d.createObjectStore("review_items", { keyPath: "id" });
        d.createObjectStore("wallpaper_records", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    // 写入一条 v1 数据
    const txn = v1db.transaction("vocab", "readwrite");
    txn.objectStore("vocab").put({
      id: "test-v1",
      word: "legacy",
      status: "new",
      encounter_count: 1,
      first_seen_at: Date.now(),
      updated_at: Date.now(),
      is_dirty: true,
    });
    await new Promise<void>((resolve) => { txn.oncomplete = () => resolve(); });
    v1db.close();

    // 用 openDB 触发 v1→v2 升级
    resetDBInstance();
    db = await openDB(indexedDB);

    // 旧数据不丢
    const vocab = await vocabDAO.getByWord(db, "legacy");
    expect(vocab).toBeDefined();
    expect(vocab!.word).toBe("legacy");

    // 新表存在
    const names = Array.from(db.objectStoreNames);
    expect(names).toContain("pending_sentences");

    // learning_records 有新的 by_sentence 索引
    const lrTx = db.transaction("learning_records", "readonly");
    const lrStore = lrTx.objectStore("learning_records");
    expect(Array.from(lrStore.indexNames)).toContain("by_sentence");
  });
});

// ========== learningRecordDAO.getBySentence ==========

describe("learningRecordDAO.getBySentence", () => {
  it("按 sentence 查找", async () => {
    const sentence = "The quick brown fox jumps over the lazy dog.";
    await learningRecordDAO.add(db, {
      sentence,
      chunked: sentence,
      new_words: [],
      source_url: "https://example.com",
    });

    const found = await learningRecordDAO.getBySentence(db, sentence);
    expect(found).toBeDefined();
    expect(found!.sentence).toBe(sentence);
  });

  it("未找到返回 undefined", async () => {
    const found = await learningRecordDAO.getBySentence(db, "nonexistent sentence");
    expect(found).toBeUndefined();
  });
});

// ========== 跨表场景 ==========

describe("跨表业务场景", () => {
  it("完整的生词采集流程：添加生词 → 记录语境 → 标记掌握", async () => {
    // 1. 遇到生词
    const vocab = await vocabDAO.add(db, {
      word: "ephemeral",
      status: "new",
      definition: "短暂的",
    });

    // 2. 记录出处
    await vocabContextDAO.add(db, {
      vocab_id: vocab.id,
      sentence: "The ephemeral nature of social media trends.",
      context_definition: "（潮流等）转瞬即逝的",
      source_url: "https://x.com/post/789",
    });

    // 3. 第二次遇到
    await vocabDAO.recordEncounter(db, vocab.id);
    await vocabContextDAO.add(db, {
      vocab_id: vocab.id,
      sentence: "Container storage is ephemeral by design.",
      context_definition: "（存储等）临时的、非持久的",
      source_url: "https://docs.k8s.io/storage",
    });

    // 验证
    const updated = await vocabDAO.getById(db, vocab.id);
    expect(updated!.encounter_count).toBe(2);

    const contexts = await vocabContextDAO.getByVocabId(db, vocab.id);
    expect(contexts).toHaveLength(2);

    // 4. 标记掌握
    await vocabDAO.markMastered(db, vocab.id);
    const mastered = await vocabDAO.getMasteredWords(db);
    expect(mastered.has("ephemeral")).toBe(true);
  });

  it("完整的句式学习流程：记录难句 → 归类句式 → 加入复习", async () => {
    // 1. 确保句式类型存在
    let pattern = await patternDAO.getByKey(db, "nested");
    if (!pattern) {
      pattern = await patternDAO.add(db, { key: "nested" });
    }

    // 2. 记录难句
    const lr = await learningRecordDAO.add(db, {
      sentence: "The system that the team who built it designed works well.",
      chunked: "The system\n  that the team\n    who built it\n  designed\nworks well.",
      sentence_analysis: "三层嵌套定语从句",
      expression_tips: "the X that Y designed — Y 设计的 X",
      pattern_key: "nested",
      new_words: [{ word: "nested", definition: "嵌套的" }],
      source_url: "https://example.com",
      llm_provider: "gemini",
      tokens_used: 200,
    });

    // 3. 添加为句式实例
    await patternExampleDAO.add(db, {
      pattern_id: pattern.id,
      sentence: lr.sentence,
      chunked: lr.chunked,
      explanation: lr.sentence_analysis,
      source_url: lr.source_url,
    });

    // 4. 增加句式计数
    await patternDAO.incrementCount(db, "nested");

    // 5. 加入复习队列
    const reviewItem = await reviewItemDAO.add(db, {
      type: "sentence",
      reference_id: lr.id,
      next_review_at: Date.now() + 86400000,
    });

    // 验证
    const examples = await patternExampleDAO.getByPatternId(db, pattern.id);
    expect(examples).toHaveLength(1);

    const updatedPattern = await patternDAO.getByKey(db, "nested");
    expect(updatedPattern!.count).toBe(2);

    const dueItems = await reviewItemDAO.getDueItems(db, Date.now() + 86400001);
    expect(dueItems.some((i) => i.id === reviewItem.id)).toBe(true);
  });
});
