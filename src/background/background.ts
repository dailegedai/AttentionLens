import { requestAiAnalysis, testAiConnection } from "../ai/client";
import { loadAiSettings } from "../settings";
import type {
  ActionResponse,
  AiSettings,
  AiAnalysis,
  AnalyzeResponse,
  RuntimeRequest,
  ScanResponse,
  TestConnectionResponse,
} from "../types";

const RESTRICTED_URL_PATTERN = /^(chrome|edge|about|devtools|chrome-extension|extension):/i;
const PAGE_ACTIONS = [
  "TOGGLE_INSPECT",
  "ENTER_FOCUS_MODE",
  "EXIT_FOCUS_MODE",
  "GET_PAGE_STATE",
] as const;

type ActiveTab = { ok: true; id: number } | { ok: false; error: string };
type PageAction = (typeof PAGE_ACTIONS)[number];

async function requireActiveTab(): Promise<ActiveTab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return { ok: false, error: "No active tab found." };
  }

  if (!tab.url || RESTRICTED_URL_PATTERN.test(tab.url)) {
    return { ok: false, error: "This browser page cannot be analyzed." };
  }

  return { ok: true, id: tab.id };
}

function isPageAction(type: RuntimeRequest["type"]): type is PageAction {
  return (PAGE_ACTIONS as readonly string[]).includes(type);
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

async function scanActiveTab(): Promise<ScanResponse> {
  const tab = await requireActiveTab();
  if (!tab.ok) return tab;

  try {
    await ensureContentScript(tab.id);
    return (await chrome.tabs.sendMessage(tab.id, {
      type: "SCAN_PAGE",
    } satisfies RuntimeRequest)) as ScanResponse;
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Unable to scan this page.") };
  }
}

async function analyzeActiveTab(): Promise<AnalyzeResponse> {
  const tab = await requireActiveTab();
  if (!tab.ok) return tab;

  try {
    await ensureContentScript(tab.id);
    const local = (await chrome.tabs.sendMessage(tab.id, {
      type: "ANALYZE_PAGE",
    } satisfies RuntimeRequest)) as AnalyzeResponse;

    if (!local.ok) return local;

    const settings = await loadAiSettings();
    if (!settings.enabled || !settings.apiKey.trim()) return local;

    try {
      const parsed = await requestAiAnalysis(local.analysis.features, local.analysis.pollution, settings);
      const ai: AiAnalysis = { ...parsed, model: settings.model, analyzedAt: Date.now() };
      const analysis = { ...local.analysis, ai };

      await chrome.tabs
        .sendMessage(tab.id, { type: "SYNC_ANALYSIS", analysis } satisfies RuntimeRequest)
        .catch(() => undefined);

      return { ok: true, analysis };
    } catch (error) {
      return {
        ok: true,
        analysis: {
          ...local.analysis,
          aiError: errorMessage(error, "AI analysis failed."),
        },
      };
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Unable to analyze this page.") };
  }
}

async function runPageAction(type: PageAction): Promise<ActionResponse> {
  const tab = await requireActiveTab();
  if (!tab.ok) return tab;

  try {
    await ensureContentScript(tab.id);
    return (await chrome.tabs.sendMessage(
      tab.id,
      { type } satisfies RuntimeRequest,
    )) as ActionResponse;
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Unable to update the page.") };
  }
}

async function testConnection(settings: AiSettings): Promise<TestConnectionResponse> {
  if (!settings.apiKey.trim()) {
    return { ok: false, error: "Add an API key before testing the connection." };
  }

  try {
    const reply = await testAiConnection(settings);
    return {
      ok: true,
      message: `Connected to ${settings.model}. Provider reply: ${reply.slice(0, 60) || "ok"}`,
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Connection test failed.") };
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
  const task = message.type === "ANALYZE_ACTIVE_TAB"
    ? analyzeActiveTab()
    : message.type === "SCAN_ACTIVE_TAB"
      ? scanActiveTab()
      : message.type === "TEST_AI_CONNECTION"
        ? testConnection(message.settings)
        : isPageAction(message.type)
          ? runPageAction(message.type)
          : null;

  if (!task) return undefined;

  task
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: errorMessage(error, "Extension error.") });
    });

  return true;
});

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
