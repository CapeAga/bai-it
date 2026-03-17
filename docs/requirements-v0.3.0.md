# 需求文档：v0.3.0 功能迭代

> 文档创建：2026-03-12
> 版本：Draft v1

---

## 需求概览

| ID | 需求 | 优先级 | 复杂度 |
|----|------|--------|--------|
| R1 | 断句策略优化 | P0 | 高 |
| R2 | 自定义 Provider 支持 | P0 | 中 |
| R3 | 手动翻译功能 | P1 | 中 |
| R4 | Options 页面主题切换 | P2 | 低 |
| R5 | 设置页 Section Title 优化 | P2 | 低 |

---

## R1: 断句策略优化

### 背景

当前本地拆分规则（`scan-rules.ts`）使用 POS 标注 + 关键词集合的方式，但在某些场景下断句不够自然，影响阅读流畅度。

### 问题分析

当前实现的核心问题：

1. **过度依赖关键词匹配**：只要出现 `and/or/but` 等连词就拆分，忽略了语义完整性
2. **忽视语调单元（Intonation Unit）**：英语口语/阅读中自然的停顿点往往不是连词位置
3. **缺乏主谓宾完整性检测**：拆分后的片段可能缺少完整的主谓结构
4. **长句处理不够智能**：`fine` 模式下的介词拆分可能打断短语完整性

### 解决方案

#### 方案一：增强语调单元检测（推荐）

引入"语调单元（Intonation Unit）"概念，基于语言学原理优化断句：

**核心原则：**
- 语调单元 = 说话人一口气说完的信息片段（通常 4-8 个词）
- 断点优先级：标点 > 语义边界 > 句法边界

**改进点：**

1. **语义边界优先**
   - 不在 `verb + object` 之间拆分
   - 不在 `adjective + noun` 之间拆分
   - 保护介词短语完整性（除非超过 8 词）

2. **主谓完整性检测**
   ```
   拆分后检查每个 chunk：
   - 是否包含完整主谓结构？
   - 如果是片段（如单独的 PP），合并到相邻 chunk
   ```

3. **新增断句规则**
   | 规则 | 示例 | 是否拆 |
   |------|------|--------|
   | verb + object | "eat an apple" | 不拆 |
   | adjective + noun | "beautiful flower" | 不拆 |
   | preposition + NP (< 4 words) | "in the morning" | 不拆 |
   | preposition + NP (≥ 4 words) | "in the early morning of a rainy day" | 可拆 |
   | 逗号 + 连词 | ", and" | 拆（保持现有） |
   | 主语 + 谓语分离 | "The man / who I met yesterday" | 避免在主语和谓语间拆 |

4. **优化合并逻辑**
   - 当前：片段 < 3 词就合并
   - 改进：片段缺少主谓结构就合并（即使 ≥ 3 词）

#### 方案二：引入 LLM 辅助判断（可选，需 API）

对于本地规则无法确定的边界，可以：
- 预设一组"常见断句模式"的 embedding
- 用本地计算 cosine similarity 判断是否应该断开
- 或直接降级到 LLM

### 验收标准

| 场景 | 输入 | 期望输出 |
|------|------|----------|
| 动宾短语完整性 | "I want to eat an apple and drink some water" | 不在 "eat an apple" 内部拆分 |
| 介词短语保护 | "He arrived in the morning" | 不拆（短语太短） |
| 长修饰语拆分 | "The man who I met yesterday at the party was very tall" | 在 "who" 后拆，但保持主句完整 |
| 并列结构 | "She likes reading, writing, and swimming" | 在逗号处拆，不破坏每个 VP |

### 实施步骤

1. 新增 `PROTECTED_PATTERNS` 集合（动宾、形名等）
2. 修改 `splitAtBoundaries()` 增加语义边界检测
3. 优化 `mergeShortChunks()` 改为主谓完整性检测
4. 编写测试用例覆盖典型场景
5. A/B 测试对比新旧方案效果

---

## R2: 自定义 Provider 支持

### 背景

当前系统预设 5 种 Provider（Gemini、ChatGPT、DeepSeek、Qwen、Kimi），每种有固定的 `baseUrl`。用户无法使用其他 LLM 服务（如 Claude、本地部署的模型、代理服务等）。

### 需求描述

1. 用户可添加**自定义 Provider**
2. 自定义 Provider 需配置：
   - 名称（用户自定义）
   - 接口类型：OpenAI 兼容 / Anthropic
   - baseUrl
   - API key
   - 模型名称
3. 预设 Provider 的 `baseUrl` 也允许修改，并可恢复默认值
4. 支持添加多个自定义 Provider，但使用时只能激活一个

### 数据模型变更

```typescript
// 接口类型
export type ApiDriverType = "openai-compatible" | "anthropic";

// Provider 类型
export type ProviderType = "preset" | "custom";

// 单个 Provider 配置（扩展）
export interface ProviderConfig {
  type: ProviderType;           // 新增：区分预设/自定义
  name: string;                 // 显示名称
  apiKey: string;
  model: string;
  driver: ApiDriverType;        // 新增：接口驱动类型
  baseUrl: string;              // 改为必填（预设有默认值）
  presetKey?: ProviderKey;      // 预设 Provider 的 key（用于恢复默认值）
}

// Provider Key 扩展
export type ProviderKey =
  | "gemini" | "chatgpt" | "deepseek" | "qwen" | "kimi"  // 预设
  | `custom_${string}`;  // 自定义，如 "custom_1", "custom_local"
```

### UI 设计

**设置页 - API Provider 区域：**

```
┌─────────────────────────────────────────────────────────┐
│ API PROVIDER                                             │
├─────────────────────────────────────────────────────────┤
│  [Gemini] [ChatGPT] [DeepSeek] [Qwen] [Kimi] [+ 自定义]  │
│                                                          │
│  当前选中: Gemini                                         │
│  ─────────────────────────────────────────────────────  │
│  接口类型:  [OpenAI 兼容 ▼]  (预设 Provider 锁定)         │
│  Base URL:  [https://generativelanguage.googleapis.com] │
│             [恢复默认]                                    │
│  API Key:   [••••••••••••••••]  [验证]                   │
│  模型:      [gemini-3.1-flash-lite ▼]                    │
└─────────────────────────────────────────────────────────┘

自定义 Provider 编辑弹窗：
┌─────────────────────────────────────────────────────────┐
│ 添加自定义 Provider                            [×]      │
├─────────────────────────────────────────────────────────┤
│ 名称:      [本地 Claude        ]                         │
│ 接口类型:  [Anthropic ▼]                                 │
│ Base URL:  [http://localhost:8080    ]                   │
│ API Key:   [••••••••••••••••]                            │
│ 模型:      [claude-3-sonnet          ]                   │
│                                                          │
│                    [取消]  [保存]                        │
└─────────────────────────────────────────────────────────┘
```

### 技术实现

**1. Anthropic SDK 集成**

```typescript
// llm-adapter.ts 新增
import Anthropic from "@anthropic-ai/sdk";

export function buildAnthropicRequest(prompt: string, config: LLMConfig) {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || undefined, // 支持自定义
  });

  return {
    model: config.model,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  };
}
```

**2. Provider 管理逻辑**

```typescript
// 恢复预设 Provider 默认值
function resetProviderToDefault(key: ProviderKey) {
  const defaults = DEFAULT_PROVIDERS[key];
  if (defaults) {
    config.llm.providers[key] = { ...defaults };
  }
}

// 生成自定义 Provider key
function generateCustomProviderKey(): string {
  const existing = Object.keys(config.llm.providers)
    .filter(k => k.startsWith("custom_"));
  const num = existing.length + 1;
  return `custom_${num}`;
}
```

### 验收标准

| 场景 | 操作 | 期望结果 |
|------|------|----------|
| 修改预设 baseUrl | 修改 ChatGPT 的 baseUrl 为代理地址 | 保存成功，调用时使用新地址 |
| 恢复默认值 | 点击"恢复默认" | baseUrl 恢复为 `https://api.openai.com` |
| 添加自定义 | 点击"+ 自定义"，填写 Anthropic 配置 | 新 Provider 出现在列表中 |
| 删除自定义 | 删除自定义 Provider | 从列表中移除 |
| 切换 Provider | 从 ChatGPT 切换到自定义 Provider | 后续调用使用新 Provider |
| 无 API key 时调用 | 未配置 key 时尝试翻译 | 提示"请先配置 API Key" |

---

## R3: 手动翻译功能

### 背景

当前系统自动标注生词，但：
1. 标注判断可能不准确（用户水平差异）
2. 缺少音标、词性等详细信息
3. 用户无法主动查询任意单词/句子

### 需求描述

**功能一：右键菜单翻译**

1. 用户选中网页上的英文文本（单词或句子）
2. 右键 → "Show Translation"
3. 显示浮动 tooltip，包含翻译结果
4. 需要 API key 才能使用

**功能二：生词详情查看**

1. 自动标注的生词 hover 显示简要释义（现有行为不变）
2. 点击生词可展开详情：
   - 音标
   - 词性
   - 更详细的释义
   - 例句（可选）
3. 需要 API key

### 技术实现

**1. 右键菜单注册**

```typescript
// background/index.ts
chrome.contextMenus.create({
  id: "translate-selection",
  title: "Show Translation",
  contexts: ["selection"],
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "translate-selection" && info.selectionText) {
    const result = await translateSelection(info.selectionText, config);
    // 发送给 content script 显示 tooltip
    chrome.tabs.sendMessage(tab.id, {
      type: "showTranslation",
      text: info.selectionText,
      result,
    });
  }
});
```

**2. 翻译 Prompt**

```typescript
// 单词翻译 Prompt
export function buildWordDetailPrompt(word: string): string {
  return `You are an English dictionary. Define the word "${word}".

Return JSON:
{
  "word": "${word}",
  "phonetic": "/ˈwɜːrd/",
  "pos": "n. / v. / adj.",
  "definition": "中文释义",
  "example": "Example sentence using the word."
}

Rules:
- Phonetic: use IPA, omit if unsure
- pos: part of speech abbreviations
- definition: brief Chinese, under 30 chars
- example: simple, under 15 words`;
}

// 句子翻译 Prompt
export function buildSentenceTranslationPrompt(sentence: string): string {
  return `Translate the following English to Chinese. Be concise.

Sentence: ${sentence}

Return JSON:
{
  "translation": "中文翻译",
  "key_words": [
    { "word": "example", "meaning": "例子" }
  ]
}

Rules:
- translation: natural Chinese, preserve tone
- key_words: up to 3 important words in the sentence`;
}
```

**3. Tooltip 展示**

```
单词详情 Tooltip：
┌──────────────────────────────────┐
│ ephemeral                        │
│ /ɪˈfem(ə)rəl/  adj.              │
│ ────────────────────────────────│
│ 短暂的，转瞬即逝的                 │
│                                  │
│ 例：Fame is ephemeral.           │
└──────────────────────────────────┘

句子翻译 Tooltip：
┌──────────────────────────────────┐
│ 翻译：                           │
│ 这只是一个短暂的时刻。            │
│ ────────────────────────────────│
│ 关键词：                         │
│ ephemeral - 短暂的               │
└──────────────────────────────────┘
```

### 验收标准

| 场景 | 操作 | 期望结果 |
|------|------|----------|
| 右键翻译单词 | 选中 "ephemeral"，右键翻译 | 显示音标、词性、释义 |
| 右键翻译句子 | 选中整句，右键翻译 | 显示中文翻译 + 关键词 |
| 无 API key | 未配置 key 时右键翻译 | 提示"请先在设置页配置 API Key" |
| 生词详情 | 点击自动标注的生词 | 展开详细信息面板 |

---

## R4: Options 页面主题切换

### 背景

当前 `options.css` 已定义深色/浅色模式的 CSS 变量，但缺少切换机制。

### 需求描述

1. 支持三种模式：
   - 深色（Dark）
   - 浅色（Light）
   - 跟随系统（Auto）
2. 切换立即生效，无需刷新
3. 偏好存储在 `chrome.storage.sync`
4. 仅影响 Options 页面

### UI 设计

```
设置页顶部或底部：

主题:  [🌙 深色] [☀️ 浅色] [🔄 跟随系统]
```

### 技术实现

```typescript
// Theme management
export type ThemeMode = "dark" | "light" | "auto";

export function applyTheme(mode: ThemeMode) {
  let actualTheme: "dark" | "light";

  if (mode === "auto") {
    actualTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } else {
    actualTheme = mode;
  }

  document.body.classList.toggle("light-mode", actualTheme === "light");
}

// 监听系统主题变化
window.matchMedia("(prefers-color-scheme: dark)").addListener((e) => {
  if (currentMode === "auto") {
    applyTheme("auto");
  }
});
```

### 验收标准

| 场景 | 操作 | 期望结果 |
|------|------|----------|
| 切换到浅色 | 点击"浅色" | 页面立即变为浅色主题 |
| 切换到跟随系统 | 点击"跟随系统" | 匹配当前系统主题 |
| 系统主题变化 | 系统从深色切到浅色 | 页面自动跟随（如果设置了"跟随系统"） |
| 重启后保持 | 关闭后重新打开 Options | 保持之前设置的主题 |

---

## R5: 设置页 Section Title 优化

### 背景

当前 `.settings-section-title` 样式：
- 14px 大写字母
- 紫色文字
- 与内容的间距不够和谐
- 不够突出

### 需求描述

1. Title 更突出、更有层次感
2. 与内容的间距更自然
3. 更酷炫的视觉效果

### 设计方案

**方案一：毛玻璃标签 + 图标**

```
┌─────────────────────────────────────────────────────────┐
│  ┌─────────────┐                                        │
│  │ ⚙️ API PROVIDER │   ← 毛玻璃背景，圆角标签            │
│  └─────────────┘                                        │
│                                                          │
│  [Gemini] [ChatGPT] [DeepSeek] ...                      │
│  ...                                                     │
└─────────────────────────────────────────────────────────┘
```

**方案二：左侧竖线 + 渐变文字**

```
┌─────────────────────────────────────────────────────────┐
│ ▌API PROVIDER                                           │
│ │                                                        │
│  [Gemini] [ChatGPT] ...                                 │
└─────────────────────────────────────────────────────────┘
```

**方案三：分割线嵌入式**

```
┌─────────────────────────────────────────────────────────┐
│ ─────────── API PROVIDER ───────────                    │
│                                                          │
│  [Gemini] [ChatGPT] ...                                 │
└─────────────────────────────────────────────────────────┘
```

### CSS 变更

```css
/* 方案一：毛玻璃标签 */
.settings-section-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: 'Syne', sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: var(--primary-light);
  letter-spacing: 2.5px;
  text-transform: uppercase;
  padding: 8px 16px;
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 24px;
}

.settings-section-title svg {
  width: 14px;
  height: 14px;
  opacity: 0.7;
}

/* Section 容器增加分隔 */
.settings-section {
  margin-bottom: 48px;
  padding-top: 8px;
}

.settings-section + .settings-section {
  border-top: 1px solid var(--border);
  padding-top: 32px;
}
```

### 验收标准

| 场景 | 期望效果 |
|------|----------|
| 视觉层次 | Title 明显突出，一眼能区分不同 Section |
| 间距和谐 | Title 与内容的间距自然，不拥挤不松散 |
| 深浅色适配 | 两种主题下都有良好表现 |

---

## 实施计划

| 阶段 | 内容 | 预估工作量 |
|------|------|------------|
| Phase 1 | R2 自定义 Provider（核心功能） | 2-3 天 |
| Phase 2 | R3 手动翻译功能 | 1-2 天 |
| Phase 3 | R1 断句优化 | 2-3 天 |
| Phase 4 | R4 + R5 UI 优化 | 1 天 |

**建议顺序**：R2 → R3 → R4+R5 → R1

理由：
- R2 是其他功能的基础（需要 API 调用）
- R3 依赖 R2 的 Provider 能力
- R4、R5 独立且工作量小，可并行
- R1 需要充分测试，放在最后确保稳定性

---

## 确认决策

| # | 需求 | 决策 |
|---|------|------|
| 1 | R1 断句优化 | 不提供回滚选项，直接替换旧版 |
| 2 | R2 自定义 Provider | 不限制自定义 Provider 数量 |
| 3 | R3 手动翻译 | 翻译结果永久缓存（IndexedDB） |
| 4 | R5 Section Title | 采用方案一：毛玻璃标签 + 图标 |