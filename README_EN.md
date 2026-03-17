[中文](./README.md)

# 掰it (bai-it)

**English too long? Break it.**

🌐 Website: [bai-it.app](https://bai-it.app)

掰it is a Chrome extension that breaks down long English sentences into digestible chunks and highlights vocabulary — right on the webpage you're reading.

No signup, no login, no backend. Your data stays in your browser.

<!-- TODO: Add product screenshot or GIF -->

## What It Does

### Auto Sentence Chunking

Open any English webpage and 掰it automatically breaks complex sentences into readable segments with indentation that shows clause relationships. Works on Twitter, Reddit, Medium, Substack — everywhere.

### Vocabulary Highlighting

Unknown words are underlined with a dotted line. Hover to see the Chinese definition. Built-in offline dictionary with 31,000+ entries. Mark words as mastered and they won't bother you again.

### Manual Break

See a sentence that wasn't auto-chunked? Click the trigger button to manually "break" it.

### LLM Deep Analysis (Optional)

Add an LLM API key (Gemini, OpenAI, DeepSeek, etc.) and manual breaks upgrade to AI-powered analysis: sentence pattern identification, structure explanation, and writing tips.

### Learning Dashboard

Built-in management page with four tabs:

- **Overview**: Weekly stats — sentences broken, words encountered, words mastered
- **Daily Review**: One sentence per day. Tap where you think it should break, then compare with the AI's answer. Builds intuition, no scores, no streaks
- **Sentence Collection**: All your broken sentences, organized by pattern type
- **Settings**: API key configuration, chunking intensity

## Installation

### Chrome Web Store (Recommended)

> Coming soon.

### Manual Installation (Developers)

1. Clone this repository
2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```
3. Open Chrome → `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked" → select the `dist/` directory

## Usage

1. **Works out of the box** — Open any English webpage. Long sentences are auto-chunked, unknown words are highlighted
2. **Adjust intensity** — Click the extension icon, use the slider to control how aggressively sentences are split
3. **Manual break** — Click the trigger button on any sentence you find difficult
4. **Add API key (optional)** — Extension icon → More Settings → Settings tab → Choose a provider, enter your API key

Supported LLM providers:

| Provider | Default Model | Notes |
|----------|--------------|-------|
| Google Gemini | gemini-3.1-flash-lite | Latest and fastest, free tier available |
| ChatGPT | gpt-4.1-mini | Stable structured output |
| DeepSeek | deepseek-chat | Most natural Chinese output, affordable |
| Qwen | qwen3-flash | Fast and cheap |
| Kimi | kimi-k2.5 | Current flagship model |

## Privacy

- **No backend**: No server. Your data is never uploaded anywhere
- **No login**: No account needed
- **Local storage**: All learning data stays in your browser's IndexedDB
- **API keys stay local**: Your keys are stored only in your browser. The extension calls LLM APIs directly from your browser — no intermediary server

Full privacy policy: [PRIVACY.md](./PRIVACY.md)

## Tech Stack

- Chrome Extension Manifest V3
- TypeScript + React (dashboard)
- ESBuild
- IndexedDB local storage
- Vitest + Puppeteer testing

## Contributing

Issues and PRs are welcome.

```bash
# Development
npm install
npm run build    # Build to dist/
npm test         # Run unit tests
```

## License

[MIT](./LICENSE)
