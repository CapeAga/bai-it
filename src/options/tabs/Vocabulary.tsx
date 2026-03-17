import { useState } from "react";
import type { VocabRecord } from "../../shared/types.ts";
import { GlassCard } from "../components/GlassCard.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { useVocabulary } from "../hooks/useVocabulary.ts";

interface VocabularyProps {
  db: IDBDatabase | null;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 月前`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function Vocabulary({ db }: VocabularyProps) {
  const {
    words,
    loading,
    searchQuery,
    setSearchQuery,
    deleteWord,
    deleteWords,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
  } = useVocabulary(db);

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);

  if (loading) return null;

  // 导出功能
  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const response = await chrome.runtime.sendMessage({ type: "exportVocab" }) as {
        words?: VocabRecord[];
        error?: string;
      };

      if (response.error || !response.words) {
        alert("导出失败: " + (response.error || "未知错误"));
        return;
      }

      const exportData = {
        exportVersion: "1.0",
        exportTime: new Date().toISOString(),
        appVersion: chrome.runtime.getManifest().version,
        wordCount: response.words.length,
        words: response.words,
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const date = new Date().toISOString().slice(0, 10);
      const filename = `bait-vocabulary-${date}.json`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();

      URL.revokeObjectURL(url);
    } catch (e) {
      alert("导出失败: " + (e instanceof Error ? e.message : "未知错误"));
    } finally {
      setIsExporting(false);
    }
  };

  // 导入功能
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.words || !Array.isArray(data.words)) {
        alert("无效的文件格式：缺少 words 数组");
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: "importVocab",
        words: data.words,
      }) as { success?: boolean; added?: number; skipped?: number; error?: string };

      if (response.error) {
        alert("导入失败: " + response.error);
        return;
      }

      setImportResult({ added: response.added || 0, skipped: response.skipped || 0 });

      // 刷新列表
      window.location.reload();
    } catch (e) {
      if (e instanceof SyntaxError) {
        alert("无效的 JSON 文件");
      } else {
        alert("导入失败: " + (e instanceof Error ? e.message : "未知错误"));
      }
    } finally {
      setIsImporting(false);
      // 清空 input
      e.target.value = "";
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    const confirmed = confirm(`确定要删除选中的 ${selectedIds.size} 个单词吗？`);
    if (!confirmed) return;

    const deleted = await deleteWords([...selectedIds]);
    if (deleted > 0) {
      // 可选：显示成功提示
    }
  };

  // 空状态
  if (words.length === 0 && searchQuery === "") {
    return (
      <>
        <div className="vocab-header rv">
          <h2 className="section-title">生词本</h2>
          <div className="vocab-actions">
            <label className="vocab-btn vocab-btn-import">
              {isImporting ? "导入中..." : "导入"}
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                disabled={isImporting}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>
        <EmptyState text="暂无生词，去浏览英文网页，遇到生词点击「☆」添加到生词本" />
      </>
    );
  }

  return (
    <>
      {/* 标题和工具栏 */}
      <div className="vocab-header rv">
        <h2 className="section-title">生词本</h2>
        <div className="vocab-actions">
          {/* 搜索框 */}
          <input
            type="text"
            className="vocab-search"
            placeholder="搜索单词或释义..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* 导出按钮 */}
          <button
            className="vocab-btn"
            onClick={handleExport}
            disabled={isExporting || words.length === 0}
          >
            {isExporting ? "导出中..." : "导出"}
          </button>

          {/* 导入按钮 */}
          <label className="vocab-btn vocab-btn-import">
            {isImporting ? "导入中..." : "导入"}
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={isImporting}
              style={{ display: "none" }}
            />
          </label>
        </div>
      </div>

      {/* 导入结果提示 */}
      {importResult && (
        <div className="vocab-import-result rv">
          导入完成：新增 {importResult.added} 个单词，跳过 {importResult.skipped} 个已存在的单词
          <button className="vocab-result-close" onClick={() => setImportResult(null)}>✕</button>
        </div>
      )}

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="vocab-batch-bar rv">
          <span className="vocab-batch-count">已选中 {selectedIds.size} 个单词</span>
          <button className="vocab-btn vocab-btn-danger" onClick={handleBatchDelete}>
            删除选中
          </button>
          <button className="vocab-btn" onClick={toggleSelectAll}>
            {selectedIds.size === words.length ? "取消全选" : "全选"}
          </button>
        </div>
      )}

      {/* 单词列表 */}
      {words.length === 0 && searchQuery !== "" ? (
        <EmptyState text={`没有找到包含「${searchQuery}」的单词`} />
      ) : (
        <div className="vocab-list">
          {words.map((word) => (
            <VocabItem
              key={word.id}
              word={word}
              isSelected={selectedIds.has(word.id)}
              onToggleSelect={() => toggleSelect(word.id)}
              onDelete={() => deleteWord(word.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

interface VocabItemProps {
  word: VocabRecord;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
}

function VocabItem({ word, isSelected, onToggleSelect, onDelete }: VocabItemProps) {
  return (
    <GlassCard className="vocab-item">
      <div className="vocab-item-left">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="vocab-checkbox"
        />
        <div className="vocab-item-content">
          <div className="vocab-item-header">
            <span className="vocab-item-word">{escapeHtml(word.word)}</span>
            {word.phonetic && (
              <span className="vocab-item-phonetic">{escapeHtml(word.phonetic)}</span>
            )}
            {word.pos && (
              <span className="vocab-item-pos">{escapeHtml(word.pos)}</span>
            )}
          </div>
          {word.definition && (
            <div className="vocab-item-definition">{escapeHtml(word.definition)}</div>
          )}
          <div className="vocab-item-meta">
            <span className="vocab-item-encounters">遭遇 {word.encounter_count} 次</span>
            <span className="vocab-item-time">{formatTimeAgo(word.first_seen_at)}</span>
          </div>
        </div>
      </div>
      <button
        className="vocab-item-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="从生词本移除"
      >
        ✕
      </button>
    </GlassCard>
  );
}