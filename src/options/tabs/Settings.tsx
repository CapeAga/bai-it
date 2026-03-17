import { useState, useCallback, useEffect } from "react";
import type { ProviderConfig, LLMMultiConfig, PresetProviderKey, ApiDriverType, ProviderKey, BaitConfig } from "../../shared/types.ts";
import { DEFAULT_PRESET_PROVIDERS, resolveLLMConfig } from "../../shared/types.ts";
import { chunkSentences } from "../../shared/llm-adapter.ts";
import { GlassCard } from "../components/GlassCard.tsx";
import { PROVIDER_INFO, DRIVER_LABELS } from "../constants.ts";

const PRESET_KEYS: PresetProviderKey[] = ["gemini", "chatgpt", "deepseek", "qwen", "kimi"];

const TEST_SENTENCE = "Although the project had been delayed by several unexpected issues, the team managed to deliver a working prototype on time.";

/** 生成自定义 Provider key */
function generateCustomProviderKey(existingKeys: string[]): string {
  let num = 1;
  while (existingKeys.includes(`custom_${num}`)) {
    num++;
  }
  return `custom_${num}`;
}

/** 判断是否是预设 Provider */
function isPresetProvider(key: string): key is PresetProviderKey {
  return PRESET_KEYS.includes(key as PresetProviderKey);
}

interface SettingsProps {
  config: BaitConfig;
  configLoading: boolean;
  updateLLM: (partial: Partial<LLMMultiConfig>) => Promise<void>;
  saveConfig: (partial: Partial<BaitConfig>) => Promise<void>;
}

type VerifyStatus = "idle" | "checking" | "ok" | "error";

export function Settings({ config, configLoading: loading, updateLLM, saveConfig }: SettingsProps) {
  const [activeProvider, setActiveProvider] = useState<ProviderKey>("gemini");
  const [verifyStatus, setVerifyStatus] = useState<Record<string, VerifyStatus>>({});
  const [verifyError, setVerifyError] = useState<string>("");
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editingCustom, setEditingCustom] = useState<ProviderKey | null>(null);

  // 新建/编辑自定义 Provider 的表单状态
  const [customForm, setCustomForm] = useState<{
    name: string;
    driver: ApiDriverType;
    baseUrl: string;
    apiKey: string;
    model: string;
  }>({
    name: "",
    driver: "openai-compatible",
    baseUrl: "",
    apiKey: "",
    model: "",
  });

  // Sync activeProvider from config once loaded
  useEffect(() => {
    if (!loading && config.llm.activeProvider) {
      setActiveProvider(config.llm.activeProvider);
    }
  }, [loading, config.llm.activeProvider]);

  const handleProviderSwitch = useCallback((p: ProviderKey) => {
    setActiveProvider(p);
    updateLLM({ activeProvider: p });
  }, [updateLLM]);

  const handleKeyChange = useCallback((value: string) => {
    const providers = { ...config.llm.providers };
    const existing = providers[activeProvider];
    if (existing) {
      providers[activeProvider] = { ...existing, apiKey: value };
      updateLLM({ providers });
    }
    setVerifyStatus((prev) => ({ ...prev, [activeProvider]: "idle" }));
    setVerifyError("");
  }, [activeProvider, config.llm.providers, updateLLM]);

  const handleModelChange = useCallback((value: string) => {
    const providers = { ...config.llm.providers };
    const existing = providers[activeProvider];
    if (existing) {
      providers[activeProvider] = { ...existing, model: value };
      updateLLM({ providers });
    }
    setVerifyStatus((prev) => ({ ...prev, [activeProvider]: "idle" }));
  }, [activeProvider, config.llm.providers, updateLLM]);

  // 恢复预设 Provider 的默认模型
  const handleResetModel = useCallback(() => {
    if (isPresetProvider(activeProvider)) {
      const providers = { ...config.llm.providers };
      const defaultConfig = DEFAULT_PRESET_PROVIDERS[activeProvider];
      const existing = providers[activeProvider];
      if (existing && defaultConfig) {
        providers[activeProvider] = { ...existing, model: defaultConfig.model };
        updateLLM({ providers });
      }
    }
  }, [activeProvider, config.llm.providers, updateLLM]);

  const handleBaseUrlChange = useCallback((value: string) => {
    const providers = { ...config.llm.providers };
    const existing = providers[activeProvider];
    if (existing) {
      providers[activeProvider] = { ...existing, baseUrl: value };
      updateLLM({ providers });
    }
  }, [activeProvider, config.llm.providers, updateLLM]);

  const handleResetBaseUrl = useCallback(() => {
    if (isPresetProvider(activeProvider)) {
      const providers = { ...config.llm.providers };
      const defaultConfig = DEFAULT_PRESET_PROVIDERS[activeProvider];
      const existing = providers[activeProvider];
      if (existing && defaultConfig) {
        providers[activeProvider] = { ...existing, baseUrl: defaultConfig.baseUrl };
        updateLLM({ providers });
      }
    }
  }, [activeProvider, config.llm.providers, updateLLM]);

  const handleVerify = useCallback(async () => {
    const pc = config.llm.providers[activeProvider];
    if (!pc?.apiKey) {
      setVerifyError("请先填入 API Key");
      return;
    }

    setVerifyStatus((prev) => ({ ...prev, [activeProvider]: "checking" }));
    setVerifyError("");

    try {
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
      if (msg.includes("401") || msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
        setVerifyError("API Key 无效");
      } else if (msg.includes("404") || msg.includes("not found")) {
        setVerifyError("模型不存在，请换一个模型试试");
      } else {
        setVerifyError(msg);
      }
    }
  }, [activeProvider, config.llm.providers]);

  // 添加自定义 Provider
  const handleAddCustom = useCallback(() => {
    const existingKeys = Object.keys(config.llm.providers);
    const newKey = generateCustomProviderKey(existingKeys);

    const newProvider: ProviderConfig = {
      type: "custom",
      name: customForm.name || `自定义 ${newKey.replace("custom_", "")}`,
      apiKey: customForm.apiKey,
      model: customForm.model,
      driver: customForm.driver,
      baseUrl: customForm.baseUrl,
    };

    const providers = { ...config.llm.providers, [newKey]: newProvider };
    updateLLM({ providers, activeProvider: newKey });

    setShowCustomModal(false);
    setCustomForm({
      name: "",
      driver: "openai-compatible",
      baseUrl: "",
      apiKey: "",
      model: "",
    });
  }, [config.llm.providers, customForm, updateLLM]);

  // 删除自定义 Provider
  const handleDeleteCustom = useCallback((key: ProviderKey) => {
    const providers = { ...config.llm.providers };
    delete providers[key];

    // 如果删除的是当前激活的，切换到默认
    const newActive = activeProvider === key ? "gemini" : activeProvider;
    updateLLM({ providers, activeProvider: newActive });
  }, [activeProvider, config.llm.providers, updateLLM]);

  if (loading) return null;

  const currentProviderConfig = config.llm.providers[activeProvider];
  const isPreset = isPresetProvider(activeProvider);
  const providerInfo = isPreset ? PROVIDER_INFO[activeProvider] : null;
  const status = verifyStatus[activeProvider] || "idle";

  // 获取所有自定义 Provider
  const customProviders = Object.entries(config.llm.providers)
    .filter(([key]) => !isPresetProvider(key));

  return (
    <div className="settings-section rv">
      <div className="settings-section-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
        API Provider
      </div>
      <GlassCard className="settings-card">
        {/* 预设 Provider 按钮 */}
        <div className="settings-provider-row">
          {PRESET_KEYS.map((p) => (
            <button
              key={p}
              className={`settings-provider-btn ${activeProvider === p ? "active" : ""}`}
              onClick={() => handleProviderSwitch(p)}
              type="button"
            >
              {PROVIDER_INFO[p].label}
            </button>
          ))}
          {/* 自定义 Provider 按钮 */}
          {customProviders.map(([key, pc]) => (
            <button
              key={key}
              className={`settings-provider-btn ${activeProvider === key ? "active" : ""}`}
              onClick={() => handleProviderSwitch(key as ProviderKey)}
              type="button"
            >
              {pc.name}
            </button>
          ))}
          <button
            className="settings-provider-btn"
            onClick={() => setShowCustomModal(true)}
            type="button"
            style={{ color: "var(--primary-light)" }}
          >
            + 自定义
          </button>
        </div>

        {/* 当前 Provider 配置 */}
        {currentProviderConfig && (
          <>
            {/* 接口类型（自定义 Provider 可选） */}
            {!isPreset && (
              <div className="settings-row">
                <div>
                  <div className="settings-label">接口类型</div>
                </div>
                <select
                  className="settings-select"
                  value={currentProviderConfig.driver}
                  onChange={(e) => {
                    const providers = { ...config.llm.providers };
                    providers[activeProvider] = {
                      ...currentProviderConfig,
                      driver: e.target.value as ApiDriverType
                    };
                    updateLLM({ providers });
                  }}
                  style={{ minWidth: 140 }}
                >
                  <option value="openai-compatible">OpenAI 兼容</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </div>
            )}

            {/* Base URL */}
            <div className="settings-row">
              <div>
                <div className="settings-label">Base URL</div>
                {!isPreset && (
                  <div className="settings-desc">API 服务地址</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="settings-input"
                  type="text"
                  value={currentProviderConfig.baseUrl}
                  onChange={(e) => handleBaseUrlChange(e.target.value)}
                  placeholder="https://api.example.com"
                  style={{ width: 240 }}
                />
                {isPreset && (
                  <button
                    className="settings-verify-btn"
                    onClick={handleResetBaseUrl}
                    type="button"
                  >
                    恢复默认
                  </button>
                )}
              </div>
            </div>

            {/* API Key */}
            <div className="settings-row" style={{ borderBottom: "none", paddingTop: 8 }}>
              <div>
                <div className="settings-label">API Key</div>
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

            {/* 模型 */}
            <div className="settings-row" style={{ paddingTop: 4 }}>
              <div>
                <div className="settings-label">模型</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {isPreset && providerInfo ? (
                  <>
                    {/* 如果当前模型在预设列表中，显示选择框 */}
                    {providerInfo.models.includes(currentProviderConfig.model) ? (
                      <select
                        className="settings-select"
                        value={currentProviderConfig.model}
                        onChange={(e) => {
                          if (e.target.value === "__custom__") {
                            // 选择自定义时，清空模型值，触发输入框显示
                            handleModelChange("");
                          } else {
                            handleModelChange(e.target.value);
                          }
                        }}
                        style={{ minWidth: 180 }}
                      >
                        {providerInfo.models.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                        <option value="__custom__">自定义模型...</option>
                      </select>
                    ) : (
                      /* 当前模型不在预设列表，显示输入框 */
                      <input
                        className="settings-input"
                        type="text"
                        value={currentProviderConfig.model}
                        onChange={(e) => handleModelChange(e.target.value)}
                        placeholder="输入模型名称"
                        style={{ width: 180 }}
                      />
                    )}
                    {/* 恢复默认按钮 */}
                    {currentProviderConfig.model !== DEFAULT_PRESET_PROVIDERS[activeProvider]?.model && (
                      <button
                        className="settings-verify-btn"
                        onClick={handleResetModel}
                        type="button"
                      >
                        恢复默认
                      </button>
                    )}
                  </>
                ) : (
                  <input
                    className="settings-input"
                    type="text"
                    value={currentProviderConfig.model}
                    onChange={(e) => handleModelChange(e.target.value)}
                    placeholder="模型名称"
                    style={{ width: 180 }}
                  />
                )}
              </div>
            </div>
            {isPreset && providerInfo && (
              <div className="settings-model-info">{providerInfo.hint}</div>
            )}

            {/* 删除自定义 Provider */}
            {!isPreset && (
              <div className="settings-row" style={{ paddingTop: 16 }}>
                <div></div>
                <button
                  className="settings-verify-btn"
                  onClick={() => handleDeleteCustom(activeProvider)}
                  type="button"
                  style={{ color: "var(--error)" }}
                >
                  删除此 Provider
                </button>
              </div>
            )}
          </>
        )}
      </GlassCard>

      {/* 自定义 Provider 弹窗 */}
      {showCustomModal && (
        <div className="modal-overlay" onClick={() => setShowCustomModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">添加自定义 Provider</div>
            <div className="modal-body">
              <div className="modal-field">
                <label>名称</label>
                <input
                  type="text"
                  value={customForm.name}
                  onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                  placeholder="如：本地 Claude"
                />
              </div>
              <div className="modal-field">
                <label>接口类型</label>
                <select
                  value={customForm.driver}
                  onChange={(e) => setCustomForm({ ...customForm, driver: e.target.value as ApiDriverType })}
                >
                  <option value="openai-compatible">OpenAI 兼容</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </div>
              <div className="modal-field">
                <label>Base URL</label>
                <input
                  type="text"
                  value={customForm.baseUrl}
                  onChange={(e) => setCustomForm({ ...customForm, baseUrl: e.target.value })}
                  placeholder="https://api.example.com"
                />
              </div>
              <div className="modal-field">
                <label>API Key</label>
                <input
                  type="password"
                  value={customForm.apiKey}
                  onChange={(e) => setCustomForm({ ...customForm, apiKey: e.target.value })}
                  placeholder="你的 API Key"
                />
              </div>
              <div className="modal-field">
                <label>模型</label>
                <input
                  type="text"
                  value={customForm.model}
                  onChange={(e) => setCustomForm({ ...customForm, model: e.target.value })}
                  placeholder="如：claude-3-sonnet"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn secondary" onClick={() => setShowCustomModal(false)}>
                取消
              </button>
              <button
                className="modal-btn primary"
                onClick={handleAddCustom}
                disabled={!customForm.apiKey || !customForm.model}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主题切换 */}
      <div className="settings-section-title" style={{ marginTop: 24 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
        主题
      </div>
      <GlassCard className="settings-card">
        <div className="settings-row" style={{ borderBottom: "none" }}>
          <div>
            <div className="settings-label">外观模式</div>
            <div className="settings-desc">选择深色、浅色或跟随系统</div>
          </div>
          <div className="theme-toggle">
            <button
              className={`theme-btn ${config.theme === "light" ? "active" : ""}`}
              onClick={() => saveConfig({ theme: "light" })}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              浅色
            </button>
            <button
              className={`theme-btn ${config.theme === "dark" ? "active" : ""}`}
              onClick={() => saveConfig({ theme: "dark" })}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              深色
            </button>
            <button
              className={`theme-btn ${config.theme === "auto" ? "active" : ""}`}
              onClick={() => saveConfig({ theme: "auto" })}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              自动
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}