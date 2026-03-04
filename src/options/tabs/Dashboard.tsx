import type { PatternKey } from "../../shared/types.ts";
import { GlassCard } from "../components/GlassCard.tsx";
import { PatternTag } from "../components/PatternTag.tsx";
import { ChunkLines } from "../components/ChunkLines.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { useDashboardData } from "../hooks/useDashboardData.ts";

interface DashboardProps {
  db: IDBDatabase | null;
  isExample: boolean;
  pendingCount: number;
  hasApi: boolean;
  onGoToReview: () => void;
  onGoToSettings: () => void;
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
  return `${days} 天前`;
}

function extractDomain(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function Dashboard({ db, isExample, pendingCount, hasApi, onGoToReview, onGoToSettings }: DashboardProps) {
  const { totalSentences, totalWords, masteredWords, recentSentences, recentPending, loading } = useDashboardData(db, isExample);

  if (loading) return null;

  return (
    <>
      {/* Stats row */}
      <div className="stats-row rv">
        <GlassCard className="stat-card">
          <div className="stat-num">{totalSentences}</div>
          <div className="stat-label">难句</div>
        </GlassCard>
        <GlassCard className="stat-card">
          <div className="stat-num">{totalWords}</div>
          <div className="stat-label">生词</div>
        </GlassCard>
        <GlassCard className="stat-card">
          <div className="stat-num">{masteredWords}</div>
          <div className="stat-label">已掌握</div>
        </GlassCard>
      </div>

      {/* Recent sentences — analyzed or pending fallback */}
      {recentSentences.length > 0 ? (
        <>
          <div className="section-head rv">掰过的句子</div>
          {recentSentences.map((record) => (
            <GlassCard key={record.id} className="sentence-card rv">
              <div className="sentence-meta">
                {record.pattern_key && (
                  <PatternTag patternKey={record.pattern_key} />
                )}
                <span className="sentence-source">
                  {extractDomain(record.source_url)}
                  {record.source_url && " · "}
                  {formatTimeAgo(record.created_at)}
                </span>
              </div>
              <ChunkLines
                chunked={record.chunked}
                newWords={record.new_words}
              />
            </GlassCard>
          ))}
        </>
      ) : recentPending.length > 0 ? (
        <>
          <div className="section-head rv">最近遇到的句子</div>
          {recentPending.map((p) => (
            <GlassCard key={p.id} className="sentence-card rv">
              <div className="sentence-meta">
                <span className="sent-badge sent-badge-manual">待分析</span>
                <span className="sentence-source">
                  {p.source_hostname} · {formatTimeAgo(p.created_at)}
                </span>
              </div>
              <div className="sent-item-text" style={{ WebkitLineClamp: 3 }}>{p.text}</div>
            </GlassCard>
          ))}
        </>
      ) : (
        <EmptyState text="还没掰过句子，去浏览英文网页试试" />
      )}

      {/* Nudge banner: has pending data but no API */}
      {!isExample && pendingCount > 0 && !hasApi && (
        <div className="nudge-banner rv">
          <span className="nudge-text">
            你已积累 {pendingCount} 条待分析难句。配置 API 后即可解锁句型分析和结构化复习。
          </span>
          <button className="banner-link" onClick={onGoToSettings} type="button">
            去设置 →
          </button>
        </div>
      )}

      {/* CTA */}
      <button className="cta-btn rv" onClick={onGoToReview} type="button">
        每日回味 →
      </button>
    </>
  );
}
