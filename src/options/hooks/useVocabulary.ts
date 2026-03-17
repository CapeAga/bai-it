import { useState, useEffect, useCallback } from "react";
import type { VocabRecord } from "../../shared/types.ts";
import { vocabDAO } from "../../shared/db.ts";

interface UseVocabularyResult {
  words: VocabRecord[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  refresh: () => Promise<void>;
  deleteWord: (id: string) => Promise<boolean>;
  deleteWords: (ids: string[]) => Promise<number>;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;
}

export function useVocabulary(db: IDBDatabase | null): UseVocabularyResult {
  const [allWords, setAllWords] = useState<VocabRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 加载所有单词
  const loadWords = useCallback(async () => {
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const records = await vocabDAO.getAll(db);
      // 按添加时间倒序排列
      records.sort((a, b) => b.first_seen_at - a.first_seen_at);
      setAllWords(records);
    } catch (e) {
      console.error("Failed to load vocabulary:", e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadWords();
  }, [loadWords]);

  // 根据搜索词过滤
  const words = searchQuery
    ? allWords.filter(
        (w) =>
          w.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
          w.definition?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allWords;

  // 删除单个单词
  const deleteWord = useCallback(
    async (id: string): Promise<boolean> => {
      if (!db) return false;

      try {
        await vocabDAO.delete(db, id);
        setAllWords((prev) => prev.filter((w) => w.id !== id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        return true;
      } catch (e) {
        console.error("Failed to delete word:", e);
        return false;
      }
    },
    [db]
  );

  // 批量删除
  const deleteWords = useCallback(
    async (ids: string[]): Promise<number> => {
      if (!db || ids.length === 0) return 0;

      let deleted = 0;
      for (const id of ids) {
        try {
          await vocabDAO.delete(db, id);
          deleted++;
        } catch {
          // 静默失败
        }
      }

      setAllWords((prev) => prev.filter((w) => !ids.includes(w.id)));
      setSelectedIds(new Set());
      return deleted;
    },
    [db]
  );

  // 切换单个选中状态
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === words.length) {
        // 已全选，取消全选
        return new Set();
      } else {
        // 未全选，全选当前过滤后的单词
        return new Set(words.map((w) => w.id));
      }
    });
  }, [words]);

  // 清空选择
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    words,
    loading,
    searchQuery,
    setSearchQuery,
    refresh: loadWords,
    deleteWord,
    deleteWords,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
  };
}