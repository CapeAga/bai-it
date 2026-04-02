import { useState, useCallback } from "react";
import type { ProviderKey, LLMMultiConfig } from "../../shared/types.ts";
import { DEFAULT_PROVIDERS, PROVIDER_META, resolveLLMConfig } from "../../shared/types.ts";
import { chunkSentences } from "../../shared/llm-adapter.ts";
import { GlassCard } from "../components/GlassCard.tsx";
import { PROVIDER_INFO } from "../constants.ts";

const PROVIDER_KEYS: ProviderKey[] = ["gemini", "chatgpt", "deepseek", "qwen", "kimi", "custom"];

const TEST_SENTENCE = "Although the project had been delayed by several unexpected issues, the team managed to deliver a working prototype on time.";

interface SettingsProps {
  config: { llm: LLMMultiConfig };
  configLoading: boolean;
  updateLLM: (partial: Partial<LLMMultiConfig>) => Promise<void>;
}

export function Settings({ config, configLoading: loading, updateLLM }: SettingsProps) {
  const [activeProvider, setActiveProvider] = useState<ProviderKey>("gemini");
  const [verifyStatus, setVerifyStatus] = useState<Record<ProviderKey, "idle" | "checking" | "ok" | "error">>({
    gemini: "idle", chatgpt: "idle", deepseek: "idle", qwen: "idle", kimi: "idle", custom: "idle",
  });
  const [verifyError, setVerifyError] = useState<string>("");

  // Sync activeProvider from config once loaded
  useState(() => {
    if (!loading && config.llm.activeProvider) {
      setActiveProvider(config.llm.activeProvider);
    }
  });

  const handleProviderSwitch = useCallback((p: ProviderKey) => {
    setActiveProvider(p);
    updateLLM({ activeProvider: p });
  }, [updateLLM]);

  const handleKeyChange = useCallback((value: string) => {
    const providers = { ...config.llm.providers };
    providers[activeProvider] = { ...providers[activeProvider], apiKey: value };
    updateLLM({ providers });
    setVerifyStatus((prev) => ({ ...prev, [activeProvider]: "idle" }));
    setVerifyError("");
  }, [activeProvider, config.llm.providers, updateLLM]);

  const handleModelChange = useCallback((value: string) => {
    const providers = { ...config.llm.providers };
    providers[activeProvider] = { ...providers[activeProvider], model: value };
    updateLLM({ providers });
    setVerifyStatus((prev) => ({ ...prev, [activeProvider]: "idle" }));
  }, [activeProvider, config.llm.providers, updateLLM]);

  const handleBaseUrlChange = useCallback((value: string) => {
    const providers = { ...config.llm.providers };
    providers[activeProvider] = { ...providers[activeProvider], baseUrl: value };
    updateLLM({ providers });
    setVerifyStatus((prev) => ({ ...prev, [activeProvider]: "idle" }));
    setVerifyError("");
  }, [activeProvider, config.llm.providers, updateLLM]);

  const handleVerify = useCallback(async () => {
    const pc = config.llm.providers[activeProvider] ?? DEFAULT_PROVIDERS[activeProvider];
    if (!pc.apiKey) {
      setVerifyError("请先填入 API Key");
      return;
    }

    setVerifyStatus((prev) => ({ ...prev, [activeProvider]: "checking" }));
    setVerifyError("");

    try {
      // 端到端验证：用真实句子走完整 chunkSentences 链路
      const llmConfig = resolveLLMConfig({
        activeProvider,
        providers: config.llm.providers,
      });
      const results = await chunkSentences([TEST_SENTENCE], llmConfig);

      if (!results || results.length === 0 || !results[0].chunked) {
        throw new Error("API 返回了空结果，请检查模型是否可用");
      }

      setVerifyStatus((prev) => ({ ...prev, [activeProvider]: "ok" }));
    } catch (err) {
      setVerifyStatus((prev) => ({ ...prev, [activeProvider]: "error" }));
      const msg = err instanceof Error ? err.message : "连接失败";
      // 友好化常见错误
      if (msg.includes("401") || msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
        setVerifyError("API Key 无效");
      } else if (msg.includes("404") || msg.includes("not found")) {
        setVerifyError("模型不存在，请换一个模型试试");
      } else {
        setVerifyError(msg);
      }
    }
  }, [activeProvider, config.llm.providers]);

  if (loading) return null;

  const currentProviderConfig = config.llm.providers[activeProvider] ?? DEFAULT_PROVIDERS[activeProvider];
  const providerInfo = PROVIDER_INFO[activeProvider];
  const status = verifyStatus[activeProvider];

  return (
    <div className="settings-section rv">
      <div className="settings-section-title">API Key</div>
      <GlassCard className="settings-card">
        <div className="settings-provider-row">
          {PROVIDER_KEYS.map((p) => (
            <button
              key={p}
              className={`settings-provider-btn ${activeProvider === p ? "active" : ""}`}
              onClick={() => handleProviderSwitch(p)}
              type="button"
            >
              {PROVIDER_INFO[p].label}
            </button>
          ))}
        </div>
        <div className="settings-row" style={{ borderBottom: "none", paddingTop: 8 }}>
          <div>
            <div className="settings-label">{providerInfo.label} API Key</div>
            <div className="settings-desc">你的 Key 只存在本地，不会上传到任何地方</div>
          </div>
          <div className="settings-key-row">
            <input
              className="settings-input"
              type="password"
              value={currentProviderConfig.apiKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="填入你的 API Key"
              style={{ width: 240 }}
            />
            <button
              className="settings-verify-btn"
              onClick={handleVerify}
              disabled={status === "checking"}
              type="button"
            >
              {status === "checking" ? "验证中..." : "测试连接"}
            </button>
          </div>
        </div>
        {(status === "ok" || status === "error") && (
          <div className={`settings-verify-result ${status}`}>
            {status === "ok" ? "✓ 连接成功" : `✗ ${verifyError}`}
          </div>
        )}
        {PROVIDER_META[activeProvider].format === "openai-compatible" && (
          <div className="settings-row" style={{ paddingTop: 4 }}>
            <div>
              <div className="settings-label">自定义端点</div>
              <div className="settings-desc">留空使用默认地址。以 / 结尾的地址会直接拼接 /chat/completions，否则拼接 /v1/chat/completions</div>
            </div>
            <input
              className="settings-input"
              type="text"
              value={currentProviderConfig.baseUrl || ""}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              placeholder={PROVIDER_META[activeProvider].baseUrl}
              style={{ width: 360 }}
            />
          </div>
        )}
        <div className="settings-row" style={{ paddingTop: 4 }}>
          <div>
            <div className="settings-label">模型</div>
          </div>
          {activeProvider === "custom" ? (
            <input
              className="settings-input"
              type="text"
              list="custom-model-list"
              value={currentProviderConfig.model}
              onChange={(e) => handleModelChange(e.target.value)}
              placeholder="输入模型名称"
              style={{ minWidth: 180 }}
            />
          ) : (
            <select
              className="settings-select"
              value={currentProviderConfig.model}
              onChange={(e) => handleModelChange(e.target.value)}
              style={{ minWidth: 180 }}
            >
              {providerInfo.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
        </div>
        <div className="settings-model-info">{providerInfo.hint}</div>
        <datalist id="custom-model-list">
          {PROVIDER_INFO.custom.models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </GlassCard>
    </div>
  );
}
