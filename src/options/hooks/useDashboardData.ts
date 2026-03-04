import { useState, useEffect } from "react";
import type { LearningRecord, PendingSentenceRecord } from "../../shared/types.ts";
import { learningRecordDAO, vocabDAO, pendingSentenceDAO } from "../../shared/db.ts";
import { EXAMPLE_DASHBOARD } from "../exampleData.ts";

export interface DashboardData {
  totalSentences: number;
  totalWords: number;
  masteredWords: number;
  recentSentences: LearningRecord[];
  recentPending: PendingSentenceRecord[];
  pendingCount: number;
  loading: boolean;
}

export function useDashboardData(db: IDBDatabase | null, isExample?: boolean): DashboardData {
  const [data, setData] = useState<DashboardData>({
    totalSentences: 0,
    totalWords: 0,
    masteredWords: 0,
    recentSentences: [],
    recentPending: [],
    pendingCount: 0,
    loading: true,
  });

  useEffect(() => {
    if (isExample) {
      setData({ ...EXAMPLE_DASHBOARD, recentPending: [], pendingCount: 0 });
      return;
    }

    if (!db) return;

    async function load() {
      const [records, allVocab, pending] = await Promise.all([
        learningRecordDAO.getAll(db!),
        vocabDAO.getAll(db!),
        pendingSentenceDAO.getAll(db!),
      ]);

      const mastered = allVocab.filter((v) => v.status === "mastered");
      const unanalyzedCount = pending.filter(p => !p.analyzed).length;

      // Sort by created_at descending, take 3 most recent
      const sorted = [...records].sort((a, b) => b.created_at - a.created_at);
      const recent = sorted.slice(0, 3);

      // When no analyzed sentences, show recent pending as fallback
      const unanalyzed = pending.filter(p => !p.analyzed);
      const recentPend = recent.length > 0
        ? []
        : [...unanalyzed].sort((a, b) => b.created_at - a.created_at).slice(0, 3);

      setData({
        totalSentences: records.length + unanalyzedCount,
        totalWords: allVocab.length,
        masteredWords: mastered.length,
        recentSentences: recent,
        recentPending: recentPend,
        pendingCount: unanalyzedCount,
        loading: false,
      });
    }

    load();
  }, [db, isExample]);

  return data;
}
