import type { TabKey } from "../App.tsx";

const TAB_LABELS: Record<TabKey, string> = {
  dashboard: "总览",
  review: "每日回味",
  sentences: "难句集",
  vocabulary: "生词本",
  settings: "设置",
};

const TAB_ORDER: TabKey[] = ["dashboard", "review", "sentences", "vocabulary", "settings"];

interface NavBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

export function NavBar({ activeTab, onTabChange }: NavBarProps) {
  return (
    <div className="nav-bar">
      <div className="logo logo-nav">
        <span className="zh">掰</span>
        <span className="en">it</span>
      </div>
      <div className="nav-glass">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            className={`nav-item ${activeTab === tab ? "active" : ""}`}
            onClick={() => onTabChange(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
    </div>
  );
}
