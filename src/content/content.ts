import { scoreAttention } from "../analysis/scorer";
import type {
  ActionResponse,
  AnalysisResult,
  AnalyzeResponse,
  PageRuntimeState,
  RuntimeRequest,
  ScanResponse,
} from "../types";
import { collectFocusTargets, resolveRegions } from "./annotate";
import { runDetectors } from "./detector";
import { enterFocusMode, exitFocusMode, getHiddenCount, isFocusMode } from "./focus";
import { hideOverlay, isOverlayVisible, showOverlay } from "./overlay";
import { scanPage } from "./scanner";

interface InjectionGuard {
  __attentionLensLoaded?: boolean;
}

let lastAnalysis: AnalysisResult | null = null;

function currentState(): PageRuntimeState {
  return {
    analysisReady: lastAnalysis !== null,
    overlayVisible: isOverlayVisible(),
    focusMode: isFocusMode(),
    hiddenCount: getHiddenCount(),
  };
}

function respond(message: RuntimeRequest, sendResponse: (response: unknown) => void): boolean {
  switch (message.type) {
    case "PING":
      sendResponse({ ok: true });
      return true;

    case "SCAN_PAGE": {
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

    case "ANALYZE_PAGE": {
      try {
        const features = scanPage();
        const detectors = runDetectors(features);
        const analysis: AnalysisResult = {
          features,
          detectors,
          ...scoreAttention(detectors),
        };
        lastAnalysis = analysis;
        const response: AnalyzeResponse = { ok: true, analysis };
        sendResponse(response);
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown analysis error.",
        });
      }
      return true;
    }

    case "SYNC_ANALYSIS":
      lastAnalysis = message.analysis;
      sendResponse({ ok: true, state: currentState() } satisfies ActionResponse);
      return true;

    case "TOGGLE_INSPECT": {
      if (!lastAnalysis) {
        sendResponse({
          ok: false,
          error: "Analyze the page before inspecting it.",
        } satisfies ActionResponse);
        return true;
      }

      if (isOverlayVisible()) {
        hideOverlay();
      } else {
        showOverlay(resolveRegions(lastAnalysis));
      }
      sendResponse({ ok: true, state: currentState() } satisfies ActionResponse);
      return true;
    }

    case "ENTER_FOCUS_MODE": {
      if (!lastAnalysis) {
        sendResponse({
          ok: false,
          error: "Analyze the page before entering Focus Mode.",
        } satisfies ActionResponse);
        return true;
      }

      const hiddenCount = enterFocusMode(collectFocusTargets(lastAnalysis));
      if (hiddenCount === 0) {
        exitFocusMode();
        sendResponse({
          ok: false,
          error: "No distraction elements were found on this page.",
        } satisfies ActionResponse);
        return true;
      }
      sendResponse({ ok: true, state: currentState() } satisfies ActionResponse);
      return true;
    }

    case "EXIT_FOCUS_MODE":
      exitFocusMode();
      sendResponse({ ok: true, state: currentState() } satisfies ActionResponse);
      return true;

    case "GET_PAGE_STATE":
      sendResponse({ ok: true, state: currentState() } satisfies ActionResponse);
      return true;

    default:
      sendResponse({ ok: false, error: "Unsupported message." });
      return true;
  }
}

const guard = window as Window & InjectionGuard;

if (!guard.__attentionLensLoaded) {
  guard.__attentionLensLoaded = true;
  chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) =>
    respond(message, sendResponse),
  );
}
