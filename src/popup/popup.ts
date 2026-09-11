import "./popup.css";

import type { PageFeatures, RuntimeRequest, ScanResponse } from "../types";

const analyzeButton = requireElement<HTMLButtonElement>("analyze-button");
const status = requireElement<HTMLParagraphElement>("status");
const results = requireElement<HTMLElement>("results");

analyzeButton.addEventListener("click", () => {
  void analyzeActiveTab();
});

async function analyzeActiveTab(): Promise<void> {
  setLoading(true);
  setStatus("Scanning the active tab...");

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "SCAN_ACTIVE_TAB",
    } satisfies RuntimeRequest)) as ScanResponse;

    if (!response?.ok) {
      results.hidden = true;
      setStatus(response?.error ?? "Scan failed.");
      return;
    }

    renderFeatures(response.features);
    setStatus("Scan complete.");
  } catch (error) {
    results.hidden = true;
    setStatus(error instanceof Error ? error.message : "Unable to reach the extension worker.");
  } finally {
    setLoading(false);
  }
}

function renderFeatures(features: PageFeatures): void {
  results.hidden = false;
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

  const signalCount = features.candidateBlocks.reduce(
    (total, block) => total + block.signals.length,
    0,
  );
  setText(
    "block-summary",
    `${features.candidateBlocks.length} candidate blocks and ${signalCount} structural signals ready for Day 2 detectors.`,
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
  analyzeButton.textContent = isLoading ? "Scanning..." : "Analyze this page";
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
