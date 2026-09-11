# AttentionLens

> See how a webpage spends your attention.

AttentionLens is a Chrome Manifest V3 extension that estimates a page's attention cost from page
structure, content features, and optional AI semantic analysis.

## Day 1 status

Implemented: MV3 scaffold, Vite + TypeScript build, popup, background service worker, on-demand
content script, and a local DOM scanner. The scanner returns links, images, buttons, sticky/fixed
elements, iframes, headings, CTA-like text, and candidate blocks.

Not implemented yet: pollution detectors, scoring, DeepSeek, overlays, and Focus Mode.

## Requirements

- Node.js 20 or newer
- npm
- Chrome or another Chromium browser

## Development

```sh
npm install
npm run build
```

Load the unpacked extension:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the `dist/` directory.
4. Open a normal web page, click the AttentionLens icon, then choose **Analyze this page**.

Useful commands:

```sh
npm run typecheck       # TypeScript check without emitting files
npm run build:main      # popup + background + manifest
npm run build:content   # content script bundle
npm run watch           # rebuild popup/background on change
npm run watch:content   # rebuild content script on change
```

## Architecture

```text
src/
├── background/   service worker and message routing
├── content/      injected scanner and content-script entry
├── popup/        extension popup UI
└── types/        shared message and data contracts
```

The popup sends `SCAN_ACTIVE_TAB` to the background worker. The worker resolves the active tab,
injects `content.js` on demand, and sends `SCAN_PAGE` to the content script. The content script
returns typed `PageFeatures`; no page HTML leaves the browser in Day 1.

Only `activeTab`, `scripting`, and `storage` permissions are requested. There is no `<all_urls>`
host permission.
