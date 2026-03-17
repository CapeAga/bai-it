/**
 * IndexedDB 数据层
 *
 * 9 张表，服务学习系统（Options 页）。
 * 与 cache.ts 的分块缓存互不干扰（不同的 IndexedDB 数据库）。
 *
 * 全局规则：
 * - 主键全部 UUID
 * - 所有表有 updated_at + is_dirty（V2 同步预留）
 * - onupgradeneeded 做 schema 版本管理
 */

import type {
  VocabRecord,
  VocabContextRecord,
  PatternRecord,
  PatternExampleRecord,
  LearningRecord,
  SettingsRecord,
  WeeklyReportRecord,
  ReviewItemRecord,
  WallpaperRecord,
  PendingSentenceRecord,
  TranslationCacheRecord,
  WordDetailCacheRecord,
} from "./types.ts";

// ========== 常量 ==========

export const DB_NAME = "openen-data";
export const DB_VERSION = 3;

export const STORES = {
  vocab: "vocab",
  vocab_contexts: "vocab_contexts",
  patterns: "patterns",
  pattern_examples: "pattern_examples",
  learning_records: "learning_records",
  settings: "settings",
  weekly_reports: "weekly_reports",
  review_items: "review_items",
  wallpaper_records: "wallpaper_records",
  pending_sentences: "pending_sentences",
  translation_cache: "translation_cache",
  word_detail_cache: "word_detail_cache",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

// ========== UUID 生成 ==========

export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback（旧环境）
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ========== 数据库连接 ==========

let dbInstance: IDBDatabase | null = null;

export function openDB(idb: IDBFactory = indexedDB): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;
      const transaction = request.transaction!;
      migrateSchema(db, oldVersion, transaction);
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // 连接异常断开时清理缓存
      dbInstance.onclose = () => {
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

/** 关闭连接（测试用） */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/** 清理缓存的连接引用（测试用，不关闭连接本身） */
export function resetDBInstance(): void {
  dbInstance = null;
}

// ========== Schema 迁移 ==========

function migrateSchema(db: IDBDatabase, oldVersion: number, transaction: IDBTransaction): void {
  if (oldVersion < 1) {
    migrateV1(db);
  }
  if (oldVersion < 2) {
    migrateV2(db, transaction);
  }
  if (oldVersion < 3) {
    migrateV3(db, transaction);
  }
}

function migrateV1(db: IDBDatabase): void {
  // vocab
  const vocab = db.createObjectStore(STORES.vocab, { keyPath: "id" });
  vocab.createIndex("by_word", "word", { unique: true });
  vocab.createIndex("by_status", "status");
  vocab.createIndex("by_updated_at", "updated_at");

  // vocab_contexts
  const vocabCtx = db.createObjectStore(STORES.vocab_contexts, { keyPath: "id" });
  vocabCtx.createIndex("by_vocab_id", "vocab_id");
  vocabCtx.createIndex("by_updated_at", "updated_at");

  // patterns
  const patterns = db.createObjectStore(STORES.patterns, { keyPath: "id" });
  patterns.createIndex("by_key", "key", { unique: true });
  patterns.createIndex("by_updated_at", "updated_at");

  // pattern_examples
  const patternEx = db.createObjectStore(STORES.pattern_examples, { keyPath: "id" });
  patternEx.createIndex("by_pattern_id", "pattern_id");
  patternEx.createIndex("by_updated_at", "updated_at");

  // learning_records
  const lr = db.createObjectStore(STORES.learning_records, { keyPath: "id" });
  lr.createIndex("by_created_at", "created_at");
  lr.createIndex("by_pattern_key", "pattern_key");
  lr.createIndex("by_source_url", "source_url");
  lr.createIndex("by_updated_at", "updated_at");

  // settings（主键是 key，不是 UUID）
  const settings = db.createObjectStore(STORES.settings, { keyPath: "key" });
  settings.createIndex("by_updated_at", "updated_at");

  // weekly_reports
  const wr = db.createObjectStore(STORES.weekly_reports, { keyPath: "id" });
  wr.createIndex("by_week_start", "week_start", { unique: true });
  wr.createIndex("by_updated_at", "updated_at");

  // review_items
  const ri = db.createObjectStore(STORES.review_items, { keyPath: "id" });
  ri.createIndex("by_type", "type");
  ri.createIndex("by_reference_id", "reference_id");
  ri.createIndex("by_next_review_at", "next_review_at");
  ri.createIndex("by_updated_at", "updated_at");

  // wallpaper_records
  const wall = db.createObjectStore(STORES.wallpaper_records, { keyPath: "id" });
  wall.createIndex("by_created_at", "created_at");
  wall.createIndex("by_updated_at", "updated_at");
}

function migrateV2(db: IDBDatabase, transaction: IDBTransaction): void {
  // pending_sentences
  const ps = db.createObjectStore(STORES.pending_sentences, { keyPath: "id" });
  ps.createIndex("by_text", "text", { unique: true });
  ps.createIndex("by_analyzed", "analyzed");
  ps.createIndex("by_created_at", "created_at");
  ps.createIndex("by_source_hostname", "source_hostname");
  ps.createIndex("by_manual", "manual");
  ps.createIndex("by_updated_at", "updated_at");

  // 给已有的 learning_records 加 by_sentence 索引
  const lrStore = transaction.objectStore(STORES.learning_records);
  lrStore.createIndex("by_sentence", "sentence");
}

function migrateV3(db: IDBDatabase, transaction: IDBTransaction): void {
  // translation_cache - 翻译缓存
  const tc = db.createObjectStore(STORES.translation_cache, { keyPath: "id" });
  tc.createIndex("by_text", "text");
  tc.createIndex("by_targetLanguage", "targetLanguage");
  tc.createIndex("by_created_at", "created_at");

  // word_detail_cache - 单词详情缓存
  const wdc = db.createObjectStore(STORES.word_detail_cache, { keyPath: "id" });
  wdc.createIndex("by_word", "word");
  wdc.createIndex("by_targetLanguage", "targetLanguage");
  wdc.createIndex("by_created_at", "created_at");
}

// ========== 通用 CRUD 工具 ==========

function tx(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode
): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** 按主键获取 */
async function getById<T>(db: IDBDatabase, store: StoreName, id: string): Promise<T | undefined> {
  return reqToPromise<T | undefined>(tx(db, store, "readonly").get(id));
}

/** 按索引获取所有匹配项 */
async function getAllByIndex<T>(
  db: IDBDatabase,
  store: StoreName,
  indexName: string,
  value: IDBValidKey
): Promise<T[]> {
  const s = tx(db, store, "readonly");
  const index = s.index(indexName);
  return reqToPromise<T[]>(index.getAll(value));
}

/** 获取表中所有记录 */
async function getAll<T>(db: IDBDatabase, store: StoreName): Promise<T[]> {
  return reqToPromise<T[]>(tx(db, store, "readonly").getAll());
}

/** 写入（put 覆盖） */
async function put<T>(db: IDBDatabase, store: StoreName, record: T): Promise<void> {
  const transaction = db.transaction(store, "readwrite");
  transaction.objectStore(store).put(record);
  await txToPromise(transaction);
}

/** 删除 */
async function del(db: IDBDatabase, store: StoreName, id: string): Promise<void> {
  const transaction = db.transaction(store, "readwrite");
  transaction.objectStore(store).delete(id);
  await txToPromise(transaction);
}

/** 按索引获取一条 */
async function getOneByIndex<T>(
  db: IDBDatabase,
  store: StoreName,
  indexName: string,
  value: IDBValidKey
): Promise<T | undefined> {
  const s = tx(db, store, "readonly");
  const index = s.index(indexName);
  return reqToPromise<T | undefined>(index.get(value));
}

// ========== Vocab ==========

export const vocabDAO = {
  async add(
    db: IDBDatabase,
    data: Omit<VocabRecord, "id" | "encounter_count" | "first_seen_at" | "updated_at" | "is_dirty">
  ): Promise<VocabRecord> {
    const now = Date.now();
    const record: VocabRecord = {
      id: generateId(),
      encounter_count: 1,
      first_seen_at: now,
      updated_at: now,
      is_dirty: true,
      ...data,
    };
    await put(db, STORES.vocab, record);
    return record;
  },

  async getById(db: IDBDatabase, id: string): Promise<VocabRecord | undefined> {
    return getById<VocabRecord>(db, STORES.vocab, id);
  },

  async getByWord(db: IDBDatabase, word: string): Promise<VocabRecord | undefined> {
    return getOneByIndex<VocabRecord>(db, STORES.vocab, "by_word", word);
  },

  async getByStatus(db: IDBDatabase, status: string): Promise<VocabRecord[]> {
    return getAllByIndex<VocabRecord>(db, STORES.vocab, "by_status", status);
  },

  async getAll(db: IDBDatabase): Promise<VocabRecord[]> {
    return getAll<VocabRecord>(db, STORES.vocab);
  },

  async update(db: IDBDatabase, id: string, changes: Partial<VocabRecord>): Promise<VocabRecord | undefined> {
    const existing = await this.getById(db, id);
    if (!existing) return undefined;
    const updated = { ...existing, ...changes, id, updated_at: Date.now(), is_dirty: true };
    await put(db, STORES.vocab, updated);
    return updated;
  },

  async delete(db: IDBDatabase, id: string): Promise<void> {
    await del(db, STORES.vocab, id);
  },

  /** 记录一次遭遇（encounter_count +1） */
  async recordEncounter(db: IDBDatabase, id: string): Promise<VocabRecord | undefined> {
    const existing = await this.getById(db, id);
    if (!existing) return undefined;
    return this.update(db, id, { encounter_count: existing.encounter_count + 1 });
  },

  /** 标记为已掌握 */
  async markMastered(db: IDBDatabase, id: string): Promise<VocabRecord | undefined> {
    return this.update(db, id, { status: "mastered", mastered_at: Date.now() });
  },

  /** 获取所有已掌握词的 word 集合（Content Script 启动时加载） */
  async getMasteredWords(db: IDBDatabase): Promise<Set<string>> {
    const mastered = await this.getByStatus(db, "mastered");
    return new Set(mastered.map((v) => v.word));
  },
};

// ========== VocabContexts ==========

export const vocabContextDAO = {
  async add(
    db: IDBDatabase,
    data: Omit<VocabContextRecord, "id" | "created_at" | "updated_at" | "is_dirty">
  ): Promise<VocabContextRecord> {
    const now = Date.now();
    const record: VocabContextRecord = {
      id: generateId(),
      created_at: now,
      updated_at: now,
      is_dirty: true,
      ...data,
    };
    await put(db, STORES.vocab_contexts, record);
    return record;
  },

  async getByVocabId(db: IDBDatabase, vocabId: string): Promise<VocabContextRecord[]> {
    return getAllByIndex<VocabContextRecord>(db, STORES.vocab_contexts, "by_vocab_id", vocabId);
  },

  async getAll(db: IDBDatabase): Promise<VocabContextRecord[]> {
    return getAll<VocabContextRecord>(db, STORES.vocab_contexts);
  },

  async delete(db: IDBDatabase, id: string): Promise<void> {
    await del(db, STORES.vocab_contexts, id);
  },
};

// ========== Patterns ==========

export const patternDAO = {
  async add(
    db: IDBDatabase,
    data: Omit<PatternRecord, "id" | "count" | "updated_at" | "is_dirty">
  ): Promise<PatternRecord> {
    const now = Date.now();
    const record: PatternRecord = {
      id: generateId(),
      count: 1,
      updated_at: now,
      is_dirty: true,
      ...data,
    };
    await put(db, STORES.patterns, record);
    return record;
  },

  async getById(db: IDBDatabase, id: string): Promise<PatternRecord | undefined> {
    return getById<PatternRecord>(db, STORES.patterns, id);
  },

  async getByKey(db: IDBDatabase, key: string): Promise<PatternRecord | undefined> {
    return getOneByIndex<PatternRecord>(db, STORES.patterns, "by_key", key);
  },

  async getAll(db: IDBDatabase): Promise<PatternRecord[]> {
    return getAll<PatternRecord>(db, STORES.patterns);
  },

  async update(db: IDBDatabase, id: string, changes: Partial<PatternRecord>): Promise<PatternRecord | undefined> {
    const existing = await this.getById(db, id);
    if (!existing) return undefined;
    const updated = { ...existing, ...changes, id, updated_at: Date.now(), is_dirty: true };
    await put(db, STORES.patterns, updated);
    return updated;
  },

  async delete(db: IDBDatabase, id: string): Promise<void> {
    await del(db, STORES.patterns, id);
  },

  /** 增加计数（遇到同类句式时调用） */
  async incrementCount(db: IDBDatabase, key: string): Promise<PatternRecord | undefined> {
    const existing = await this.getByKey(db, key);
    if (!existing) return undefined;
    return this.update(db, existing.id, { count: existing.count + 1 });
  },
};

// ========== PatternExamples ==========

export const patternExampleDAO = {
  async add(
    db: IDBDatabase,
    data: Omit<PatternExampleRecord, "id" | "created_at" | "updated_at" | "is_dirty">
  ): Promise<PatternExampleRecord> {
    const now = Date.now();
    const record: PatternExampleRecord = {
      id: generateId(),
      created_at: now,
      updated_at: now,
      is_dirty: true,
      ...data,
    };
    await put(db, STORES.pattern_examples, record);
    return record;
  },

  async getByPatternId(db: IDBDatabase, patternId: string): Promise<PatternExampleRecord[]> {
    return getAllByIndex<PatternExampleRecord>(db, STORES.pattern_examples, "by_pattern_id", patternId);
  },

  async getAll(db: IDBDatabase): Promise<PatternExampleRecord[]> {
    return getAll<PatternExampleRecord>(db, STORES.pattern_examples);
  },

  async delete(db: IDBDatabase, id: string): Promise<void> {
    await del(db, STORES.pattern_examples, id);
  },
};

// ========== LearningRecords ==========

export const learningRecordDAO = {
  async add(
    db: IDBDatabase,
    data: Omit<LearningRecord, "id" | "created_at" | "updated_at" | "is_dirty">
  ): Promise<LearningRecord> {
    const now = Date.now();
    const record: LearningRecord = {
      id: generateId(),
      created_at: now,
      updated_at: now,
      is_dirty: true,
      ...data,
    };
    await put(db, STORES.learning_records, record);
    return record;
  },

  async getById(db: IDBDatabase, id: string): Promise<LearningRecord | undefined> {
    return getById<LearningRecord>(db, STORES.learning_records, id);
  },

  async getAll(db: IDBDatabase): Promise<LearningRecord[]> {
    return getAll<LearningRecord>(db, STORES.learning_records);
  },

  async getByPatternKey(db: IDBDatabase, patternKey: string): Promise<LearningRecord[]> {
    return getAllByIndex<LearningRecord>(db, STORES.learning_records, "by_pattern_key", patternKey);
  },

  async getBySourceUrl(db: IDBDatabase, sourceUrl: string): Promise<LearningRecord[]> {
    return getAllByIndex<LearningRecord>(db, STORES.learning_records, "by_source_url", sourceUrl);
  },

  async update(db: IDBDatabase, id: string, changes: Partial<LearningRecord>): Promise<LearningRecord | undefined> {
    const existing = await this.getById(db, id);
    if (!existing) return undefined;
    const updated = { ...existing, ...changes, id, updated_at: Date.now(), is_dirty: true };
    await put(db, STORES.learning_records, updated);
    return updated;
  },

  async delete(db: IDBDatabase, id: string): Promise<void> {
    await del(db, STORES.learning_records, id);
  },

  async getBySentence(db: IDBDatabase, sentence: string): Promise<LearningRecord | undefined> {
    return getOneByIndex<LearningRecord>(db, STORES.learning_records, "by_sentence", sentence);
  },

  /** 按时间范围查询（Dashboard 用） */
  async getByDateRange(db: IDBDatabase, startTime: number, endTime: number): Promise<LearningRecord[]> {
    const s = tx(db, STORES.learning_records, "readonly");
    const index = s.index("by_created_at");
    const range = IDBKeyRange.bound(startTime, endTime);
    return reqToPromise<LearningRecord[]>(index.getAll(range));
  },
};

// ========== Settings ==========

export const settingsDAO = {
  async get(db: IDBDatabase, key: string): Promise<unknown | undefined> {
    const record = await getById<SettingsRecord>(db, STORES.settings, key);
    return record?.value;
  },

  async set(db: IDBDatabase, key: string, value: unknown): Promise<void> {
    const record: SettingsRecord = {
      key,
      value,
      updated_at: Date.now(),
      is_dirty: true,
    };
    await put(db, STORES.settings, record);
  },

  async delete(db: IDBDatabase, key: string): Promise<void> {
    await del(db, STORES.settings, key);
  },

  async getAll(db: IDBDatabase): Promise<SettingsRecord[]> {
    return getAll<SettingsRecord>(db, STORES.settings);
  },
};

// ========== WeeklyReports ==========

export const weeklyReportDAO = {
  async add(
    db: IDBDatabase,
    data: Omit<WeeklyReportRecord, "id" | "created_at" | "updated_at" | "is_dirty">
  ): Promise<WeeklyReportRecord> {
    const now = Date.now();
    const record: WeeklyReportRecord = {
      id: generateId(),
      created_at: now,
      updated_at: now,
      is_dirty: true,
      ...data,
    };
    await put(db, STORES.weekly_reports, record);
    return record;
  },

  async getByWeekStart(db: IDBDatabase, weekStart: string): Promise<WeeklyReportRecord | undefined> {
    return getOneByIndex<WeeklyReportRecord>(db, STORES.weekly_reports, "by_week_start", weekStart);
  },

  async getAll(db: IDBDatabase): Promise<WeeklyReportRecord[]> {
    return getAll<WeeklyReportRecord>(db, STORES.weekly_reports);
  },

  async update(
    db: IDBDatabase,
    id: string,
    changes: Partial<WeeklyReportRecord>
  ): Promise<WeeklyReportRecord | undefined> {
    const existing = await getById<WeeklyReportRecord>(db, STORES.weekly_reports, id);
    if (!existing) return undefined;
    const updated = { ...existing, ...changes, id, updated_at: Date.now(), is_dirty: true };
    await put(db, STORES.weekly_reports, updated);
    return updated;
  },

  async delete(db: IDBDatabase, id: string): Promise<void> {
    await del(db, STORES.weekly_reports, id);
  },
};

// ========== ReviewItems ==========

export const reviewItemDAO = {
  async add(
    db: IDBDatabase,
    data: Omit<ReviewItemRecord, "id" | "ease_factor" | "interval" | "repetitions" | "created_at" | "updated_at" | "is_dirty">
  ): Promise<ReviewItemRecord> {
    const now = Date.now();
    const record: ReviewItemRecord = {
      id: generateId(),
      ease_factor: 2.5, // SM-2 默认值
      interval: 1, // 首次间隔 1 天
      repetitions: 0,
      created_at: now,
      updated_at: now,
      is_dirty: true,
      ...data,
    };
    await put(db, STORES.review_items, record);
    return record;
  },

  async getById(db: IDBDatabase, id: string): Promise<ReviewItemRecord | undefined> {
    return getById<ReviewItemRecord>(db, STORES.review_items, id);
  },

  async getAll(db: IDBDatabase): Promise<ReviewItemRecord[]> {
    return getAll<ReviewItemRecord>(db, STORES.review_items);
  },

  async getByReferenceId(db: IDBDatabase, refId: string): Promise<ReviewItemRecord[]> {
    return getAllByIndex<ReviewItemRecord>(db, STORES.review_items, "by_reference_id", refId);
  },

  /** 获取到期的复习项（next_review_at <= now） */
  async getDueItems(db: IDBDatabase, now?: number): Promise<ReviewItemRecord[]> {
    const timestamp = now ?? Date.now();
    const s = tx(db, STORES.review_items, "readonly");
    const index = s.index("by_next_review_at");
    const range = IDBKeyRange.upperBound(timestamp);
    return reqToPromise<ReviewItemRecord[]>(index.getAll(range));
  },

  async update(
    db: IDBDatabase,
    id: string,
    changes: Partial<ReviewItemRecord>
  ): Promise<ReviewItemRecord | undefined> {
    const existing = await this.getById(db, id);
    if (!existing) return undefined;
    const updated = { ...existing, ...changes, id, updated_at: Date.now(), is_dirty: true };
    await put(db, STORES.review_items, updated);
    return updated;
  },

  async delete(db: IDBDatabase, id: string): Promise<void> {
    await del(db, STORES.review_items, id);
  },

  /**
   * SM-2 算法：根据用户评分更新复习计划
   * @param quality 0-5，0-2 = 不记得，3 = 勉强记得，4-5 = 轻松记得
   */
  async review(db: IDBDatabase, id: string, quality: number): Promise<ReviewItemRecord | undefined> {
    const item = await this.getById(db, id);
    if (!item) return undefined;

    const q = Math.max(0, Math.min(5, Math.round(quality)));
    let { ease_factor, interval, repetitions } = item;

    if (q < 3) {
      // 忘记了，重新开始
      repetitions = 0;
      interval = 1;
    } else {
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * ease_factor);
      }
      repetitions += 1;
    }

    // 更新 ease_factor（不低于 1.3）
    ease_factor = ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ease_factor < 1.3) ease_factor = 1.3;

    const now = Date.now();
    return this.update(db, id, {
      ease_factor,
      interval,
      repetitions,
      next_review_at: now + interval * 24 * 60 * 60 * 1000,
      last_reviewed_at: now,
    });
  },
};

// ========== WallpaperRecords ==========

export const wallpaperRecordDAO = {
  async add(
    db: IDBDatabase,
    data: Omit<WallpaperRecord, "id" | "created_at" | "updated_at" | "is_dirty">
  ): Promise<WallpaperRecord> {
    const now = Date.now();
    const record: WallpaperRecord = {
      id: generateId(),
      created_at: now,
      updated_at: now,
      is_dirty: true,
      ...data,
    };
    await put(db, STORES.wallpaper_records, record);
    return record;
  },

  async getAll(db: IDBDatabase): Promise<WallpaperRecord[]> {
    return getAll<WallpaperRecord>(db, STORES.wallpaper_records);
  },

  async delete(db: IDBDatabase, id: string): Promise<void> {
    await del(db, STORES.wallpaper_records, id);
  },
};

// ========== PendingSentences ==========

export const pendingSentenceDAO = {
  async add(
    db: IDBDatabase,
    data: Omit<PendingSentenceRecord, "id" | "analyzed" | "created_at" | "updated_at" | "is_dirty">
  ): Promise<PendingSentenceRecord | null> {
    // 先查去重
    const existing = await this.getByText(db, data.text);
    if (existing) return null;

    const now = Date.now();
    const record: PendingSentenceRecord = {
      id: generateId(),
      analyzed: false,
      created_at: now,
      updated_at: now,
      is_dirty: true,
      ...data,
    };
    await put(db, STORES.pending_sentences, record);
    return record;
  },

  async getById(db: IDBDatabase, id: string): Promise<PendingSentenceRecord | undefined> {
    return getById<PendingSentenceRecord>(db, STORES.pending_sentences, id);
  },

  async getByText(db: IDBDatabase, text: string): Promise<PendingSentenceRecord | undefined> {
    return getOneByIndex<PendingSentenceRecord>(db, STORES.pending_sentences, "by_text", text);
  },

  async getAll(db: IDBDatabase): Promise<PendingSentenceRecord[]> {
    return getAll<PendingSentenceRecord>(db, STORES.pending_sentences);
  },

  async getUnanalyzed(db: IDBDatabase): Promise<PendingSentenceRecord[]> {
    const all = await this.getAll(db);
    return all
      .filter(r => !r.analyzed)
      .sort((a, b) => {
        // manual 优先
        if (a.manual !== b.manual) return a.manual ? -1 : 1;
        // 同类按 created_at desc
        return b.created_at - a.created_at;
      });
  },

  async getPage(
    db: IDBDatabase,
    page: number,
    pageSize: number
  ): Promise<{ records: PendingSentenceRecord[]; total: number }> {
    const all = await this.getAll(db);
    // manual 优先, 然后按 created_at desc
    all.sort((a, b) => {
      if (a.manual !== b.manual) return a.manual ? -1 : 1;
      return b.created_at - a.created_at;
    });
    const start = (page - 1) * pageSize;
    return {
      records: all.slice(start, start + pageSize),
      total: all.length,
    };
  },

  async markAnalyzed(db: IDBDatabase, id: string): Promise<void> {
    const existing = await this.getById(db, id);
    if (!existing) return;
    await put(db, STORES.pending_sentences, {
      ...existing,
      analyzed: true,
      updated_at: Date.now(),
      is_dirty: true,
    });
  },

  async delete(db: IDBDatabase, id: string): Promise<void> {
    await del(db, STORES.pending_sentences, id);
  },
};

// ========== TranslationCache ==========

/** 生成翻译缓存 ID */
export function makeTranslationCacheId(text: string, targetLanguage: string): string {
  // 简单 hash
  const str = `${text}:${targetLanguage}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `tc_${Math.abs(hash).toString(36)}`;
}

export const translationCacheDAO = {
  async get(db: IDBDatabase, text: string, targetLanguage: string): Promise<TranslationCacheRecord | undefined> {
    const id = makeTranslationCacheId(text, targetLanguage);
    return getById<TranslationCacheRecord>(db, STORES.translation_cache, id);
  },

  async set(
    db: IDBDatabase,
    data: { text: string; targetLanguage: string; translation: string; keyWords?: { word: string; meaning: string }[] }
  ): Promise<TranslationCacheRecord> {
    const id = makeTranslationCacheId(data.text, data.targetLanguage);
    const record: TranslationCacheRecord = {
      id,
      text: data.text,
      targetLanguage: data.targetLanguage,
      translation: data.translation,
      keyWords: data.keyWords,
      created_at: Date.now(),
    };
    await put(db, STORES.translation_cache, record);
    return record;
  },

  async delete(db: IDBDatabase, id: string): Promise<void> {
    await del(db, STORES.translation_cache, id);
  },
};

// ========== WordDetailCache ==========

/** 生成单词详情缓存 ID */
export function makeWordDetailCacheId(word: string, targetLanguage: string): string {
  return `wdc_${word.toLowerCase()}_${targetLanguage}`;
}

export const wordDetailCacheDAO = {
  async get(db: IDBDatabase, word: string, targetLanguage: string): Promise<WordDetailCacheRecord | undefined> {
    const id = makeWordDetailCacheId(word, targetLanguage);
    return getById<WordDetailCacheRecord>(db, STORES.word_detail_cache, id);
  },

  async set(
    db: IDBDatabase,
    data: { word: string; targetLanguage: string; phonetic?: string; pos?: string; definition: string; example?: string }
  ): Promise<WordDetailCacheRecord> {
    const id = makeWordDetailCacheId(data.word, data.targetLanguage);
    const record: WordDetailCacheRecord = {
      id,
      word: data.word,
      targetLanguage: data.targetLanguage,
      phonetic: data.phonetic,
      pos: data.pos,
      definition: data.definition,
      example: data.example,
      created_at: Date.now(),
    };
    await put(db, STORES.word_detail_cache, record);
    return record;
  },

  async delete(db: IDBDatabase, id: string): Promise<void> {
    await del(db, STORES.word_detail_cache, id);
  },
};
