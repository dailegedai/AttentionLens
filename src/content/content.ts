import type { RuntimeRequest, ScanResponse } from "../types";
import { scanPage } from "./scanner";

interface InjectionGuard {
  __attentionLensLoaded?: boolean;
}

function respond(message: RuntimeRequest, sendResponse: (response: unknown) => void): boolean {
  if (message.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SCAN_PAGE") {
    try {
      const response: ScanResponse = { ok: true, features: scanPage() };
      sendResponse(response);
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown scan error.",
      });
    }
    return true;
  }

  sendResponse({ ok: false, error: `Unsupported message: ${String(message.type)}` });
  return true;
}

const guard = window as Window & InjectionGuard;

if (!guard.__attentionLensLoaded) {
  guard.__attentionLensLoaded = true;
  chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) =>
    respond(message, sendResponse),
  );
}
