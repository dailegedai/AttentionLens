# AttentionLens

> See how a webpage spends your attention.

AttentionLens is a Chrome Manifest V3 extension that estimates a page's **Attention Cost** from
page structure, content features, and optional DeepSeek semantic analysis. It can visualize the
detected regions and hide distractions with a reversible Focus Mode.

## Status

All five planned stages are implemented:

- Day 1 — MV3 + Vite + TypeScript scaffold, popup, background worker, on-demand scanner.
- Day 2 — five local rule detectors and the explainable weighted scorer.
- Day 3 — DeepSeek client with structured JSON, retry, timeout, and malformed-response handling.
- Day 4 — Inspect overlay and reversible Focus Mode.
- Day 5 — loading/error/empty states, settings, restore reliability, tests, and documentation.

## Features

- **Analyze Attention** — Attention Cost 0-100 plus Recommendation, Advertisement, Clickbait, CTA,
  and UI Distraction sub-scores with detection counts.
- **Explainable scoring** — the popup lists the weighted contributions behind the final number.
- **AI explanation** — DeepSeek reviews titles, CTA text, and candidate blocks, then returns
  structured JSON with a summary, headline techniques, and block classifications.
- **Inspect Page** — color-coded overlays for Main Content, Recommendation, Advertisement, CTA, and
  Distraction regions.
- **Focus Mode** — hides detected distractions with inline CSSOM styles (`display: none
  !important`), which keeps it working under strict page CSP, and restores every modified element
  when Focus Mode or Restore is pressed.

## Requirements

- Node.js 20 or newer, npm
- Chrome or another Chromium browser

## Install and build

```sh
npm install
npm run build
```

Load the unpacked extension:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the `dist/` directory.
4. Open a normal web page, click the AttentionLens icon, then choose **Analyze this page**.

## AI setup

AI uses a bring-your-own-key model. Click **AI settings** in the popup, or open the extension
options from `chrome://extensions` → **Details** → **Extension options**:

- **Enable DeepSeek** — turns the semantic layer on.
- **Model** — defaults to `deepseek-v4.1-flash`; use the model id enabled for your account.
- **Base URL** — defaults to `https://api.deepseek.com`.
- **API key** — saved keys are shown masked (for example `sk-••••••7890`); use **Change key** or
  **Clear key** to manage them. The key lives in `chrome.storage.local` and is never sent anywhere
  except the configured API endpoint.
- **Test connection** — sends a minimal ping through the background worker to verify the key, model
  id, billing status, and network path.

AI failures never break local analysis. The popup keeps the rule-based scores and shows the error,
the client retries transient failures and malformed JSON once, and requests time out after 20
seconds. If you use a custom `Base URL` on another host, add that host to `host_permissions` in
`manifest.json`.

## Architecture

```text
src/
├── ai/           DeepSeek client, prompts, and JSON parser
├── analysis/     weighted scoring engine
├── background/   service worker, AI orchestration, message routing
├── content/      scanner, rule detectors, overlay, Focus Mode
├── options/      dedicated AI settings page
├── popup/        popup UI
├── types/        shared message and data contracts
└── settings.ts   chrome.storage-backed AI settings
```

Message flow:

```text
Popup
  → ANALYZE_ACTIVE_TAB
Background
  → inject content.js on demand
  → ANALYZE_PAGE
Content script
  → scanPage() → runDetectors() → scoreAttention()
Background
  → optional DeepSeek structured JSON
  → AnalysisResult back to Popup

Popup → TOGGLE_INSPECT / ENTER_FOCUS_MODE / EXIT_FOCUS_MODE / GET_PAGE_STATE → Content script
Options page → TEST_AI_CONNECTION → Background → provider ping
```

The LLM never receives raw HTML and never decides the final Attention Cost. Only local rules set
the score; AI adds headline semantics, block classification, and the natural-language explanation.

## Scoring

Each detector produces an explainable 0-100 score:

```text
Attention Cost =
Recommendation × 0.25
+ Clickbait × 0.25
+ Advertisement × 0.20
+ CTA × 0.15
+ UI Distraction × 0.15
```

Severity is `low` below 40, `moderate` from 40-69, and `high` at 70 or above.

## Development

```sh
npm run typecheck       # TypeScript check without emitting files
npm test                # detector, scorer, AI parser, and Focus Mode tests
npm run build:main      # popup + background + manifest
npm run build:content   # content script bundle
npm run watch           # rebuild popup/background on change
npm run watch:content   # rebuild content script on change
```

`npm test` uses the Node built-in test runner; no extra test framework is required.

## Permissions and privacy

- `activeTab` and `scripting` — inject the scanner only after you click the extension action.
- `storage` — keep AI settings locally.
- `https://api.deepseek.com/*` — allow the service worker to call DeepSeek when AI is enabled.

There is no `<all_urls>` host permission. Page features stay in the browser unless AI is enabled,
in which case only structured titles, CTA text, and candidate block summaries are sent. Focus Mode
never deletes DOM nodes, never modifies site data, and never clicks or submits anything.

## Demo flow

```text
Open a content-rich page
→ AttentionLens → Analyze → Attention Cost + severity + sub-scores
→ Inspect page → colored region markers
→ Why → AI summary and headline techniques
→ Focus mode → distractions hidden
→ Restore page → original page restored
```

## Limitations

AttentionLens returns a heuristic, estimated analysis based on page structure and content features.
It is not a medical, psychological, or scientific measurement of attention, and it does not judge
whether a site is good or bad. Rules can over-detect on unusual layouts; always keep Restore
available.
