# Sentence Assist Learning Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a low-pressure sentence assist flow that shows simpler English first, keeps Chinese as a collapsible fallback, and lets users play UK sentence audio inline.

**Architecture:** Extend the existing content-script tooltip/trigger pattern with a new sentence-level assist card. Keep the LLM contract separate from full sentence analysis so page-level reading help stays lightweight. Reuse the browser speech pipeline for UK playback and keep all fallback behavior safe when no API key is configured.

**Tech Stack:** TypeScript, Chrome Extension MV3 content/background messaging, existing `llm-adapter`, browser `SpeechSynthesis`, Vitest

---

## File Map

- Modify: `src/shared/types.ts`
  - Add the sentence-level result type and background message shape.
- Modify: `src/shared/llm-adapter.ts`
  - Add prompt builder, JSON parser, and API call helper for sentence assist.
- Modify: `src/background/index.ts`
  - Route the new sentence assist message and provide the no-key fallback.
- Modify: `src/content/index.ts`
  - Trigger sentence assist from manual long-sentence interactions, render the card, wire Chinese expand/collapse and UK sentence playback, cache responses.
- Modify: `src/content/styles.ts`
  - Style the inline sentence card and its low-pressure collapsed Chinese state.
- Modify: `src/__tests__/llm-adapter.test.ts`
  - Cover prompt and parser behavior for sentence assist.
- Create: `src/__tests__/sentence-assist-ui.test.ts`
  - Cover sentence card state/render helpers without requiring a browser integration suite.

### Task 1: Add sentence-assist LLM contract

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/llm-adapter.ts`
- Modify: `src/background/index.ts`
- Test: `src/__tests__/llm-adapter.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("builds a sentence assist prompt with simpler English first", () => {
  const prompt = buildSentenceAssistPrompt("The product, which had seemed stable, suddenly failed.");
  expect(prompt).toContain("simpler_english");
  expect(prompt).toContain("backup_chinese");
  expect(prompt).toContain("learning_point");
});

it("parses sentence assist JSON with safe defaults", () => {
  const result = parseSentenceAssistJson('{"simpler_english":"It suddenly failed.","backup_chinese":"它突然出问题了。"}');
  expect(result.learningPoint).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/llm-adapter.test.ts`
Expected: FAIL because sentence-assist helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface SentenceAssistResult {
  simplerEnglish: string;
  backupChinese: string;
  learningPoint: string;
}
```

Add:
- `buildSentenceAssistPrompt(sentence: string)`
- `parseSentenceAssistJson(text: string)`
- `explainSentenceWithLLM(sentence, config)`
- background message type `explainSentence`
- no-key fallback `{ simplerEnglish: "", backupChinese: "", learningPoint: "" }`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/llm-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/llm-adapter.ts src/background/index.ts src/__tests__/llm-adapter.test.ts
git commit -m "feat: add sentence assist llm contract"
```

### Task 2: Render the sentence card with low-pressure defaults

**Files:**
- Modify: `src/content/index.ts`
- Modify: `src/content/styles.ts`
- Create: `src/__tests__/sentence-assist-ui.test.ts`

- [ ] **Step 1: Write the failing UI tests**

```ts
it("hides backup Chinese until expanded", () => {
  const html = renderSentenceAssistCard({
    simplerEnglish: "It failed all at once.",
    backupChinese: "它一下子就失灵了。",
    learningPoint: "",
    chineseExpanded: false,
  });
  expect(html).not.toContain("它一下子就失灵了。");
  expect(html).toContain("展开中文");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/sentence-assist-ui.test.ts`
Expected: FAIL because the render helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement in `src/content/index.ts`:
- sentence-card state object
- render helper for:
  - `Simpler English`
  - collapsed Chinese CTA
  - optional `learningPoint`
  - sentence-level `UK` button
- click handlers for:
  - manual trigger to fetch `explainSentence`
  - Chinese expand/collapse
  - sentence playback
- safe inline insertion near the manually assisted sentence

Implement in `src/content/styles.ts`:
- inline card container
- collapsed secondary action styling
- unobtrusive learning-point styling

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/sentence-assist-ui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/index.ts src/content/styles.ts src/__tests__/sentence-assist-ui.test.ts
git commit -m "feat: add inline sentence assist card"
```

### Task 3: Hook the manual trigger into sentence assist and audio

**Files:**
- Modify: `src/content/index.ts`
- Test: `src/__tests__/selection-assist.test.ts`
- Test: `src/__tests__/word-assist.test.ts`

- [ ] **Step 1: Add failing behavior coverage**

Add expectations for:
- manual long-sentence assist keeps chunk rendering working
- sentence audio uses the full sentence text, not just a word
- sentence assist cache key is stable per sentence

- [ ] **Step 2: Run targeted tests to verify they fail**

Run: `npm test -- src/__tests__/selection-assist.test.ts src/__tests__/word-assist.test.ts`
Expected: FAIL with missing sentence-assist behavior.

- [ ] **Step 3: Implement the integration**

Update the manual-trigger path so that:
- with API key:
  - keep current chunk result insertion
  - fetch sentence assist in parallel or immediately after chunking
  - render the card next to the chunked result
- without API key:
  - keep local chunking
  - still expose UK sentence playback
  - do not fake simpler-English content

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `npm test -- src/__tests__/selection-assist.test.ts src/__tests__/word-assist.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/index.ts src/__tests__/selection-assist.test.ts src/__tests__/word-assist.test.ts
git commit -m "feat: connect manual sentence assist flow"
```

### Task 4: Full verification

**Files:**
- Modify: `README.md` (only if the user-facing behavior needs documenting now)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: `Build complete.`

- [ ] **Step 3: Smoke-check the extension manually**

Manual check:
- refresh extension in `chrome://extensions/`
- open a long English sentence
- click the manual assist trigger
- confirm the card shows simpler English first
- confirm Chinese is folded by default
- confirm `UK` reads the whole sentence

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: describe sentence assist learning flow"
```
