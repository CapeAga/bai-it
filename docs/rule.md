# 文本拆分规则

## 概述

掰it 有两套独立的文本拆分逻辑，分别对应两种使用模式：

1. **扫读模式** — 本地拆分，零 API 成本
2. **细读模式** — 复杂度判断，决定是否调用 AI

---

## 1. 扫读模式 (Scan Mode)

**文件**: `src/shared/scan-rules.ts`

**设计目标**: 毫秒级本地拆分，零 API 成本

### 核心逻辑

基于**逻辑转换点**识别断行位置：

| 规则类型 | 关键词/模式 | 拆分条件 |
|---------|------------|---------|
| 并列连词 | and, or, but, nor, yet, so | 逗号后出现 |
| 强从属连词 | because, although, unless... | 无需逗号也可拆 |
| 弱从属连词 | since, while, if, when... | 需要逗号才拆 |
| 关系代词 | which, who, whom, where | 逗号后出现 |
| 转折词 | however, therefore, thus... | 逗号后或句首 |
| 标点 | 分号、冒号、破折号、括号 | 自动拆分 |
| 介词短语 (fine模式) | about, from, into... | 前4词+后4词 |

### 三级颗粒度

- `coarse`：仅在逗号+连词处拆分（最保守）
- `medium`：长句允许无逗号拆分
- `fine`：更低阈值 + 介词短语 + 引语边界

### POS 词性标注

使用 `pos` (pos-js) 库进行词性标注，辅助判断：
- 从句边界
- 报告动词（that 引导的宾语从句不拆）
- 不定式短语
- 并列谓语检测

### 降级策略

```
句子太短 (<8-12词) → 不拆
本地拆不动 + 3+ 从句标记 → 降级给 LLM
本地拆得动 → 直接返回
```

### 高级规则

#### 分词短语检测

句首的分词短语（VBG/VBN）不拆分：
- "Running quickly, she caught the bus." → 不拆
- "Excited by the news, she celebrated." → 不拆

#### 并列谓语检测

同一主语的并列动词不拆分：
- "She got dressed and left." → 不拆
- "I love coffee and tea." → 拆分（coffee 是名词）

判断逻辑：
1. and/but 前后都是动词 → 并列谓语，不拆
2. 前面是名词 + and + 后面是名词 → 并列宾语，拆分
3. 前面是分句 + 逗号 + and → 独立分句，拆分

#### 关系从句

- **限制性关系从句**（无逗号）：不拆
  - "The man who came to dinner left." → 不拆
- **非限制性关系从句**（有逗号）：拆分
  - "The new framework, which makes development faster, was adopted." → 拆分

---

## 2. 细读模式 (Rule Mode)

**文件**: `src/shared/rule-engine.ts`

**设计目标**: 判断句子是否需要 AI 处理（复杂度估算）

### 核心逻辑

`estimateComplexity()` 计算复杂度分数：

| 信号 | 权重 |
|-----|------|
| 从句标记词数量 | 1.0/个 |
| 句子长度 | 15词+1.0, 25词+1.0, 40词+1.0 |
| 标点复杂度 | 逗号0.3, 分号0.5, 破折号0.4 |
| 分词结构 | -ing/-ed 开头（逗号后）+0.5 |

### 阈值判断

`needsChunking(sentence, sensitivityLevel)`:
- 复杂度 ≥ 用户设定的敏感度 → 发送给 LLM
- 复杂度 < 敏感度 → 跳过，不调 API

---

## 3. 调用流程

```
用户浏览英文网页
       ↓
内容脚本提取文本 → splitSentences() 切分成句子
       ↓
根据模式选择：
  ┌─────────────────────────────────────┐
  │ 扫读模式 (scan-mode)                 │
  │ scanSplit()                         │
  │  - 检查长度阈值                      │
  │  - 获取 POS 标注                     │
  │  - splitAtBoundaries() 遍历词找断点  │
  │    - 并列连词检测                    │
  │    - 分词短语检测                    │
  │    - 并列谓语检测                    │
  │    - 关系从句检测                    │
  │  - mergeShortChunks() 合并过短片段    │
  │  - 返回 {chunks, needsLLM}          │
  └─────────────────────────────────────┘
  ┌─────────────────────────────────────┐
  │ 细读模式 (rule-mode)                 │
  │ filterSentences()                   │
  │  - 对每个句子 estimateComplexity()   │
  │  - needsChunking() 判断是否 > 阈值   │
  │  - toProcess[] → 发送给 LLM         │
  │  - skipped[] → 保持原样              │
  └─────────────────────────────────────┘
```

---

## 4. 设计原则

1. **宁可多拆不漏拆** — 扫读场景快速理解优先
2. **零成本** — 本地规则能拆则拆，不调 LLM
3. **优雅降级** — 本地拆不动且复杂 → 降级给 AI
4. **即时完成** — 目标 < 1ms
5. **语法正确性** — 避免破坏语法结构（分词短语、并列谓语、限制性从句）

---

## 5. 关键文件

| 文件 | 职责 |
|------|------|
| `src/shared/scan-rules.ts` | 扫读模式：本地拆分逻辑 (680+行) |
| `src/shared/rule-engine.ts` | 细读模式：复杂度判断 (139行) |
| `src/content/index.ts` | 内容脚本入口，调用上述规则 |

---

## 6. 测试用例

详见 `src/__tests__/scan-rules.test.ts`

### 常见测试场景

```typescript
// 并列句
scanSplit("The team developed the frontend, and the backend was handled by a separate group.");

// 转折句
scanSplit("The initial results were promising, however the long-term impact remained unclear.");

// 条件句
scanSplit("If the system detects any anomalous behavior, it will trigger a security review.");

// 关系从句（非限制性）
scanSplit("The new framework, which makes development faster, was adopted by the team.");

// 分词短语
scanSplit("Running as fast as she possibly could, she barely managed to catch the bus.");

// 并列谓语
scanSplit("She got dressed and left.");
```
