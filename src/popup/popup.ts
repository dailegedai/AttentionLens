import "./popup.css";

import { detectorLabel } from "../analysis/scorer";
import type {
  ActionResponse,
  AnalysisResult,
  AnalyzeResponse,
  DetectionReport,
  PageFeatures,
  PageRuntimeState,
  PollutionKind,
  RuntimeRequest,
} from "../types";

const DETECTOR_ORDER: PollutionKind[] = [
  "recommendation",
  "clickbait",
  "advertisement",
  "cta",
  "uiDistraction",
];

const DETECTOR_CSS: Record<PollutionKind, string> = {
  recommendation: "recommendation",
  clickbait: "clickbait",
  advertisement: "advertisement",
  cta: "cta",
  uiDistraction: "ui-distraction",
};

const analyzeButton = requireElement<HTMLButtonElement>("analyze-button");
const inspectButton = requireElement<HTMLButtonElement>("inspect-button");
const focusButton = requireElement<HTMLButtonElement>("focus-button");
const restoreButton = requireElement<HTMLButtonElement>("restore-button");
const openSettingsButton = requireElement<HTMLButtonElement>("open-settings-button");
const status = requireElement<HTMLParagraphElement>("status");
const results = requireElement<HTMLElement>("results");
const aiStatus = requireElement<HTMLParagraphElement>("ai-status");
const aiSummary = requireElement<HTMLParagraphElement>("ai-summary");
const aiTechniques = requireElement<HTMLUListElement>("ai-techniques");
const aiBlocks = requireElement<HTMLUListElement>("ai-blocks");

let currentAnalysis: AnalysisResult | null = null;
let pageState: PageRuntimeState = {
  analysisReady: false,
  overlayVisible: false,
  focusMode: false,
  hiddenCount: 0,
};

analyzeButton.addEventListener("click", () => {
  void analyzeActiveTab();
});
inspectButton.addEventListener("click", () => {
  void runPageAction("TOGGLE_INSPECT");
});
focusButton.addEventListener("click", () => {
  void runPageAction(pageState.focusMode ? "EXIT_FOCUS_MODE" : "ENTER_FOCUS_MODE");
});
restoreButton.addEventListener("click", () => {
  void runPageAction("EXIT_FOCUS_MODE");
});
openSettingsButton.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

void refreshPageState(true);

async function analyzeActiveTab(): Promise<void> {
  setLoading(true);
  setStatus("Analyzing the active tab...");

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "ANALYZE_ACTIVE_TAB",
    } satisfies RuntimeRequest)) as AnalyzeResponse;

    if (!response?.ok) {
      results.hidden = true;
      setStatus(response?.error ?? "Analysis failed.");
      return;
    }

    renderAnalysis(response.analysis);
    await refreshPageState();
    setStatus(
      response.analysis.aiError
        ? "Local analysis complete. AI explanation unavailable."
        : "Analysis complete.",
    );
  } catch (error) {
    results.hidden = true;
    setStatus(error instanceof Error ? error.message : "Unable to reach the extension worker.");
  } finally {
    setLoading(false);
  }
}

async function runPageAction(
  type: "TOGGLE_INSPECT" | "ENTER_FOCUS_MODE" | "EXIT_FOCUS_MODE",
): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type,
  } satisfies RuntimeRequest)) as ActionResponse;

  if (!response?.ok) {
    setStatus(response?.error ?? "Action failed.");
    await refreshPageState();
    return;
  }

  applyPageState(response.state);
  setStatus(
    response.state.focusMode
      ? `Focus Mode active — ${response.state.hiddenCount} distraction(s) hidden.`
      : response.state.overlayVisible
        ? "Markers visible on the page."
        : "Page restored.",
  );
}

async function refreshPageState(force = false): Promise<void> {
  if (!currentAnalysis && !force) return;

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "GET_PAGE_STATE",
    } satisfies RuntimeRequest)) as ActionResponse;
    if (response?.ok) applyPageState(response.state);
  } catch {
    // The page may have navigated; local results stay visible.
  }
}

function applyPageState(state: PageRuntimeState): void {
  pageState = state;
  inspectButton.textContent = state.overlayVisible ? "Hide markers" : "Inspect page";
  focusButton.textContent = state.focusMode ? "Exit focus mode" : "Focus mode";
  inspectButton.disabled = !state.analysisReady;
  focusButton.disabled = !state.analysisReady;
  restoreButton.disabled = !state.focusMode;
}

function renderAnalysis(analysis: AnalysisResult): void {
  results.hidden = false;
  currentAnalysis = analysis;
  renderScore(analysis);
  renderReasons(analysis.primaryReasons);
  renderDetectors(analysis.detectors);
  renderAi(analysis);
  renderPageDetails(analysis.features);
}

function renderScore(analysis: AnalysisResult): void {
  setText("attention-cost", analysis.pollution.attentionCost);
  const severity = requireElement<HTMLElement>("severity");
  severity.textContent = analysis.severity.toUpperCase();
  severity.className = `severity severity-${analysis.severity}`;
}

function renderReasons(reasons: string[]): void {
  const list = requireElement<HTMLUListElement>("primary-reasons");
  list.replaceChildren();

  for (const reason of reasons) {
    const item = document.createElement("li");
    item.textContent = reason;
    list.append(item);
  }
}

function renderDetectors(detectors: DetectionReport): void {
  const list = requireElement<HTMLUListElement>("detector-list");
  list.replaceChildren();

  for (const kind of DETECTOR_ORDER) {
    const detector = detectors[kind];
    const item = document.createElement("li");
    item.className = "detector";

    const header = document.createElement("div");
    header.className = "detector-header";

    const name = document.createElement("span");
    name.textContent = detectorLabel(kind);

    const score = document.createElement("span");
    score.className = "detector-score";
    score.textContent = String(detector.score);
    header.append(name, score);

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("span");
    fill.className = `bar-fill bar-${DETECTOR_CSS[kind]}`;
    fill.style.width = `${detector.score}%`;
    bar.append(fill);

    const meta = document.createElement("p");
    meta.className = "detector-meta";
    meta.textContent = `${detector.count} signal(s) · ${detector.reasons[0] ?? "No signals."}`;
    item.append(header, bar, meta);
    list.append(item);
  }
}

function renderAi(analysis: AnalysisResult): void {
  aiSummary.hidden = true;
  aiTechniques.hidden = true;
  aiBlocks.hidden = true;
  aiTechniques.replaceChildren();
  aiBlocks.replaceChildren();

  if (analysis.ai) {
    const { ai } = analysis;
    aiStatus.textContent = `Model: ${ai.model}`;

    if (ai.summary) {
      aiSummary.textContent = ai.summary;
      aiSummary.hidden = false;
    }

    if (ai.headline && ai.headline.techniques.length > 0) {
      for (const technique of ai.headline.techniques) {
        const item = document.createElement("li");
        item.textContent = technique;
        aiTechniques.append(item);
      }
      aiTechniques.hidden = false;
    }

    for (const block of ai.blocks.slice(0, 6)) {
      const item = document.createElement("li");
      item.textContent = `${block.category.replace(/_/g, " ")} · ${Math.round(block.confidence * 100)}% — ${block.reason}`;
      aiBlocks.append(item);
    }
    aiBlocks.hidden = aiBlocks.children.length === 0;
    return;
  }

  if (analysis.aiError) {
    aiStatus.textContent = `AI unavailable: ${analysis.aiError}. Local results are still shown.`;
    return;
  }

  aiStatus.textContent =
    "AI is off or no API key is saved. Open AI settings to add your own DeepSeek key.";
}

function renderPageDetails(features: PageFeatures): void {
  setText("page-title", features.title || "Untitled page");
  setText("page-url", features.url);
  setText("metric-links", features.links);
  setText("metric-images", features.images);
  setText("metric-buttons", features.buttons);
  setText("metric-sticky", features.stickyElements);
  setText("metric-fixed", features.fixedElements);
  setText("metric-iframes", features.iframes);
  renderList("heading-list", features.headings, "No headings found.");
  renderList("cta-list", features.ctaTexts, "No CTA-like text found.");
  setText(
    "block-summary",
    `${features.candidateBlocks.length} candidate blocks analyzed with local rules.`,
  );
}

function renderList(id: string, values: string[], emptyMessage: string): void {
  const list = requireElement<HTMLUListElement>(id);
  list.replaceChildren();

  if (values.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = emptyMessage;
    list.append(item);
    return;
  }

  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    item.title = value;
    list.append(item);
  }
}

function setLoading(isLoading: boolean): void {
  analyzeButton.disabled = isLoading;
  analyzeButton.textContent = isLoading ? "Analyzing..." : "Analyze this page";
}

function setStatus(message: string): void {
  status.textContent = message;
}

function setText(id: string, value: string | number): void {
  requireElement<HTMLElement>(id).textContent = String(value);
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element: #${id}`);
  return element as T;
}
