import type { AiBlockCategory, AnalysisResult, BlockFeature, PollutionKind } from "../types";
import { OVERLAY_ID } from "./overlay.ts";

export type RegionKind = "mainContent" | "recommendation" | "advertisement" | "cta" | "distraction";

export interface PageRegion {
  element: HTMLElement;
  kind: RegionKind;
  label: string;
  blockId?: string;
}

export const REGION_LABELS: Record<RegionKind, string> = {
  mainContent: "Main content",
  recommendation: "Recommendation",
  advertisement: "Advertisement",
  cta: "CTA",
  distraction: "Distraction",
};

const DETECTOR_TO_REGION: Array<{ detector: PollutionKind; region: RegionKind }> = [
  { detector: "advertisement", region: "advertisement" },
  { detector: "recommendation", region: "recommendation" },
  { detector: "uiDistraction", region: "distraction" },
  { detector: "cta", region: "cta" },
];

const AI_CATEGORY_TO_REGION: Partial<Record<AiBlockCategory, RegionKind>> = {
  main_content: "mainContent",
  recommendation: "recommendation",
  advertisement: "advertisement",
  cta: "cta",
  distraction: "distraction",
};

const MODAL_LIKE =
  'dialog, [role="dialog"], [aria-modal="true"], [class*="modal"], [class*="overlay"]';
const MAX_FOCUS_SCAN = 15_000;
const MAX_FOCUS_TARGETS = 500;
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "NOSCRIPT",
  "TEMPLATE",
  "HEAD",
  "TITLE",
  "BASE",
]);

export function resolveRegions(analysis: AnalysisResult): PageRegion[] {
  const blocks = analysis.features.candidateBlocks;
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const kindByBlock = new Map<string, RegionKind>();

  for (const { detector, region } of DETECTOR_TO_REGION) {
    for (const evidence of analysis.detectors[detector].evidence) {
      const ids = evidence.blockIds ?? (evidence.blockId ? [evidence.blockId] : []);
      for (const id of ids) {
        if (!kindByBlock.has(id)) kindByBlock.set(id, region);
      }
    }
  }

  for (const block of blocks) {
    if (kindByBlock.has(block.id)) continue;
    if (isContentContainer(block)) continue;

    const signals = block.signals;
    if (signals.includes("modal_like") || signals.includes("position_fixed") || signals.includes("position_sticky")) {
      kindByBlock.set(block.id, "distraction");
    } else if (signals.includes("cta_text")) {
      kindByBlock.set(block.id, "cta");
    } else if (
      signals.includes("link_dense") ||
      (signals.includes("image_heavy") && block.linkCount >= 3 && block.linkDensity >= 0.3) ||
      (block.linkCount >= 10 && block.headingCount > 0 && block.linkDensity >= 0.4)
    ) {
      kindByBlock.set(block.id, "recommendation");
    }
  }

  for (const classification of analysis.ai?.blocks ?? []) {
    const region = AI_CATEGORY_TO_REGION[classification.category];
    if (region && classification.confidence >= 0.5) {
      kindByBlock.set(classification.id, region);
    }
  }

  const mainContent = findMainContentElement(analysis);
  const regions: PageRegion[] = [];

  if (mainContent) {
    regions.push({
      element: mainContent,
      kind: "mainContent",
      label: REGION_LABELS.mainContent,
    });
  }

  for (const [blockId, kind] of kindByBlock) {
    const block = blockById.get(blockId);
    const element = block ? queryBlockElement(block.domPath) : null;
    if (!element) continue;
    if (element === mainContent) continue;
    if (mainContent && element.contains(mainContent)) continue;
    regions.push({ element, kind, label: REGION_LABELS[kind], blockId });
  }

  return regions;
}

export function collectFocusTargets(analysis: AnalysisResult): HTMLElement[] {
  const mainContent = findMainContentElement(analysis);
  const rawTargets = resolveRegions(analysis)
    .filter((region) => region.kind !== "mainContent")
    .map((region) => region.element);

  const elements = Array.from(document.body?.querySelectorAll<HTMLElement>("*") ?? []).slice(
    0,
    MAX_FOCUS_SCAN,
  );

  for (const element of elements) {
    if (!(element instanceof HTMLElement)) continue;
    if (SKIP_TAGS.has(element.tagName)) continue;
    if (element.closest(`#${OVERLAY_ID}`)) continue;
    if (element.closest("footer")) continue;
    if (!isSafeToHide(element, mainContent)) continue;

    const style = window.getComputedStyle(element);
    const isPersistent = style.position === "fixed" || style.position === "sticky";
    const isModalLike = element.matches(MODAL_LIKE);
    if (!isPersistent && !isModalLike) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) rawTargets.push(element);
  }

  const safeTargets = rawTargets.filter(
    (element) => !element.closest("footer") && isSafeToHide(element, mainContent),
  );
  const promoted = safeTargets.map((element) => promoteToLayoutContainer(element, mainContent));

  return topMost(promoted).slice(0, MAX_FOCUS_TARGETS);
}

export function findMainContentElement(analysis: AnalysisResult): HTMLElement | null {
  const article = largestElementForTag(analysis, "article");
  if (article) return article;

  const main = largestElementForTag(analysis, "main");
  if (main) return main;

  return document.querySelector<HTMLElement>('main, [role="main"]');
}

function largestElementForTag(analysis: AnalysisResult, tag: string): HTMLElement | null {
  const candidates = analysis.features.candidateBlocks
    .filter((block) => block.tag === tag)
    .map((block) => ({ block, element: queryBlockElement(block.domPath) }))
    .filter(
      (entry): entry is { block: BlockFeature; element: HTMLElement } => entry.element !== null,
    )
    .sort((a, b) => b.block.textLength - a.block.textLength);

  return candidates[0]?.element ?? null;
}

function isContentContainer(block: BlockFeature): boolean {
  return block.tag === "article" || block.tag === "main";
}

function isSafeToHide(element: HTMLElement, mainContent: HTMLElement | null): boolean {
  if (!element.isConnected) return false;
  if (element === document.body || element === document.documentElement) return false;
  if (!mainContent) return true;
  if (element === mainContent) return false;
  if (element.contains(mainContent)) return false;
  if (mainContent.contains(element)) return isStrongOverlay(element);
  return true;
}

function isStrongOverlay(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return style.position === "fixed" || style.position === "sticky" || element.matches(MODAL_LIKE);
}

function promoteToLayoutContainer(
  element: HTMLElement,
  mainContent: HTMLElement | null,
): HTMLElement {
  let current = element;
  let parent = element.parentElement;

  while (parent && parent !== document.body && parent !== document.documentElement) {
    if (mainContent && (parent === mainContent || parent.contains(mainContent))) break;
    if (parent.children.length > 4) break;
    if (SKIP_TAGS.has(parent.tagName)) break;

    const parentText = parent.textContent?.length ?? 0;
    const currentText = current.textContent?.length ?? 0;
    if (parentText > currentText * 1.5 + 80) break;

    current = parent;
    parent = parent.parentElement;
  }

  return current;
}

function topMost(elements: HTMLElement[]): HTMLElement[] {
  const sorted = Array.from(new Set(elements)).sort((a, b) => depth(a) - depth(b));
  const kept: HTMLElement[] = [];

  for (const element of sorted) {
    if (kept.some((ancestor) => ancestor.contains(element))) continue;
    kept.push(element);
  }

  return kept;
}

function depth(element: HTMLElement): number {
  let value = 0;
  let current: HTMLElement | null = element;
  while (current) {
    value += 1;
    current = current.parentElement;
  }
  return value;
}

function queryBlockElement(domPath: string): HTMLElement | null {
  try {
    const element = document.querySelector<HTMLElement>(domPath);
    return element?.isConnected ? element : null;
  } catch {
    return null;
  }
}
