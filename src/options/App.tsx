import { useState, useEffect, useCallback } from "react";
import { NavBar } from "./components/NavBar.tsx";
import { OnboardingBanner } from "./components/OnboardingBanner.tsx";
import type { BannerVariant } from "./components/OnboardingBanner.tsx";
import { WordTooltip } from "./components/WordTooltip.tsx";
import { Dashboard } from "./tabs/Dashboard.tsx";
import { DailyReview } from "./tabs/DailyReview.tsx";
import { Sentences } from "./tabs/Sentences.tsx";
import { Settings } from "./tabs/Settings.tsx";
import { useDB } from "./hooks/useDB.ts";
import { useConfig } from "./hooks/useConfig.ts";
import { useOnboardingState } from "./hooks/useOnboardingState.ts";
import { MasteredWordsContext, useMasteredWordsProvider } from "./hooks/useMasteredWords.ts";

export type TabKey = "dashboard" | "review" | "sentences" | "settings";

const TABS: TabKey[] = ["dashboard", "review", "sentences", "settings"];

function getTabFromHash(): TabKey {
  const hash = window.location.hash.slice(1);
  if (TABS.includes(hash as TabKey)) return hash as TabKey;
  return "dashboard";
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>(getTabFromHash);
  // Increment key on tab change to retrigger stagger animation
  const [tabKey, setTabKey] = useState(0);

  // Lifted state: DB and config
  const db = useDB();
  const { config, loading: configLoading, saveConfig, updateLLM } = useConfig();
  const onboarding = useOnboardingState(db, config, configLoading);

  // Per-tab isExample
  const dashboardIsExample = !onboarding.hasData;
  const reviewSentencesIsExample = !onboarding.hasAnalyzedData;

  const masteredWordsValue = useMasteredWordsProvider(db);

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    setTabKey((k) => k + 1);
    window.location.hash = tab;
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setActiveTab(getTabFromHash());
      setTabKey((k) => k + 1);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Banner variant based on active tab
  function getBannerVariant(): BannerVariant {
    if (onboarding.loading) return null;
    if (activeTab === "settings") return null;

    if (activeTab === "dashboard") {
      if (!onboarding.hasData) {
        return onboarding.hasApi ? "browse-with-api" : "browse";
      }
      return null;
    }

    // review / sentences — based on hasAnalyzedData
    if (!onboarding.hasAnalyzedData) {
      if (!onboarding.hasApi) return "api";
      return "browse-with-api";
    }
    return null;
  }

  return (
    <>
      <div className="noise" />
      <div className="ambience" />
      <div className="inner">
        <MasteredWordsContext.Provider value={masteredWordsValue}>
          <NavBar activeTab={activeTab} onTabChange={handleTabChange} />

          {/* Onboarding banner — variant depends on active tab */}
          <OnboardingBanner
            variant={getBannerVariant()}
            onGoToSettings={() => handleTabChange("settings")}
          />

          <div style={{ position: "relative" }}>
            <div className={`tab-panel ${activeTab === "dashboard" ? "active" : ""}`}>
              {activeTab === "dashboard" && (
                <Dashboard
                  key={tabKey}
                  db={db}
                  isExample={dashboardIsExample}
                  pendingCount={onboarding.pendingCount}
                  hasApi={onboarding.hasApi}
                  onGoToReview={() => handleTabChange("review")}
                  onGoToSettings={() => handleTabChange("settings")}
                />
              )}
            </div>
            <div className={`tab-panel ${activeTab === "review" ? "active" : ""}`}>
              {activeTab === "review" && <DailyReview key={tabKey} db={db} isExample={reviewSentencesIsExample} />}
            </div>
            <div className={`tab-panel ${activeTab === "sentences" ? "active" : ""}`}>
              {activeTab === "sentences" && <Sentences key={tabKey} db={db} isExample={reviewSentencesIsExample} />}
            </div>
            <div className={`tab-panel ${activeTab === "settings" ? "active" : ""}`}>
              {activeTab === "settings" && (
                <Settings
                  key={tabKey}
                  db={db}
                  config={config}
                  configLoading={configLoading}
                  saveConfig={saveConfig}
                  updateLLM={updateLLM}
                />
              )}
            </div>
          </div>

          <WordTooltip />
        </MasteredWordsContext.Provider>
      </div>
    </>
  );
}
