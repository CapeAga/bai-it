export type BannerVariant = "browse" | "api" | "browse-with-api" | null;

interface OnboardingBannerProps {
  variant: BannerVariant;
  onGoToSettings: () => void;
}

const TEXTS: Record<string, string> = {
  browse: "以下是示例数据。去浏览几篇英文网页，你的学习数据就会出现在这里。",
  api: "以下是示例数据。配置 API 后，你的难句将获得句型分析和结构化复习。",
  "browse-with-api": "以下是示例数据。去浏览几篇英文网页，掰it 会自动分析你的难句。",
};

export function OnboardingBanner({ variant, onGoToSettings }: OnboardingBannerProps) {
  if (!variant) return null;

  return (
    <div className="onboarding-banner">
      <div className="banner-text">{TEXTS[variant]}</div>
      {variant === "api" && (
        <button className="banner-link" onClick={onGoToSettings} type="button">
          去设置 →
        </button>
      )}
    </div>
  );
}
