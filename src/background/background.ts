import type { RuntimeRequest, ScanResponse } from "../types";

const RESTRICTED_URL_PATTERN = /^(chrome|edge|about|devtools|chrome-extension|extension):/i;

async function scanActiveTab(): Promise<ScanResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return { ok: false, error: "No active tab found." };
  }

  if (!tab.url || RESTRICTED_URL_PATTERN.test(tab.url)) {
    return { ok: false, error: "This browser page cannot be analyzed." };
  }

  await ensureContentScript(tab.id);

  const response = (await chrome.tabs.sendMessage(tab.id, {
    type: "SCAN_PAGE",
  } satisfies RuntimeRequest)) as ScanResponse;

  return response;
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" } satisfies RuntimeRequest);
    return;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
  if (message.type !== "SCAN_ACTIVE_TAB") return undefined;

  scanActiveTab()
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unable to scan this page.",
      } satisfies ScanResponse);
    });

  return true;
});
