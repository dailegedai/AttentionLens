import type { BlockFeature, PageFeatures, PositionValue, Rect } from "../types";

const MAX_SCANNED_ELEMENTS = 6000;
const MAX_CANDIDATE_BLOCKS = 40;
const MAX_HEADINGS = 20;
const MAX_CTA_TEXTS = 20;
const MIN_BLOCK_TEXT_LENGTH = 80;
const MIN_BLOCK_AREA = 10_000;
const MODAL_LIKE_SELECTOR =
  'dialog, [role="dialog"], [aria-modal="true"], [class*="modal"], [class*="overlay"]';

const CTA_PATTERN =
  /\b(subscribe|sign\s?up|free trial|start free|download|buy now|buy|join|register|get started|learn more|contact us|shop now|add to cart)\b|订阅|注册|下载|购买|立即|免费|加入|开始使用|了解更多|现在开始/i;

const POSITION_VALUES: PositionValue[] = [
  "static",
  "relative",
  "absolute",
  "fixed",
  "sticky",
];

export function scanPage(doc: Document = document): PageFeatures {
  const viewport = {
    width: doc.defaultView?.innerWidth ?? 0,
    height: doc.defaultView?.innerHeight ?? 0,
  };
  const bodyText = readText(doc.body);

  let stickyElements = 0;
  let fixedElements = 0;
  let modalLikeElements = 0;

  const elements = Array.from(doc.body?.querySelectorAll<HTMLElement>("*") ?? []).slice(
    0,
    MAX_SCANNED_ELEMENTS,
  );

  for (const element of elements) {
    const position = readPosition(element, doc);
    if (position === "sticky") stickyElements += 1;
    if (position === "fixed") fixedElements += 1;
    if (element.matches(MODAL_LIKE_SELECTOR) && isVisible(element)) modalLikeElements += 1;
  }

  return {
    url: doc.location?.href ?? "",
    title: readText(doc.querySelector("title")) || doc.title || "",
    capturedAt: Date.now(),
    textLength: bodyText.length,
    links: doc.querySelectorAll("a[href]").length,
    images: doc.querySelectorAll("img, picture").length,
    buttons: doc.querySelectorAll(
      'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]',
    ).length,
    stickyElements,
    fixedElements,
    iframes: doc.querySelectorAll("iframe").length,
    iframeSources: collectIframeSources(doc),
    modalLikeElements,
    headings: collectHeadings(doc),
    ctaTexts: collectCtaTexts(doc),
    candidateBlocks: collectCandidateBlocks(doc, viewport),
  };
}

function collectHeadings(doc: Document): string[] {
  const headings = Array.from(doc.querySelectorAll<HTMLElement>("h1, h2, h3")).map((element) =>
    readText(element),
  );

  return unique(headings.filter(Boolean)).slice(0, MAX_HEADINGS);
}

function collectCtaTexts(doc: Document): string[] {
  const controls = Array.from(
    doc.querySelectorAll<HTMLElement>(
      'a, button, input[type="submit"], input[type="button"], [role="button"]',
    ),
  );

  const ctaTexts = controls
    .map(readControlText)
    .filter((text) => text.length > 0 && text.length <= 80 && CTA_PATTERN.test(text));

  return unique(ctaTexts).slice(0, MAX_CTA_TEXTS);
}

function collectCandidateBlocks(
  doc: Document,
  viewport: { width: number; height: number },
): BlockFeature[] {
  return uniqueElements([
    ...Array.from(
      doc.querySelectorAll<HTMLElement>(
        'article, aside, section, main, nav, dialog, [role="dialog"], [aria-modal="true"], [role="complementary"], [role="navigation"], [role="banner"], [role="contentinfo"]',
      ),
    ),
    ...Array.from(doc.querySelectorAll<HTMLElement>("body > div, main > div, #content > div")).filter(
      (element) => element.children.length >= 2,
    ),
  ])
    .map((element, index) => toBlockFeature(element, index, doc, viewport))
    .filter(
      (block): block is BlockFeature =>
        block !== null &&
        block.textLength >= MIN_BLOCK_TEXT_LENGTH &&
        block.rect.width * block.rect.height >= MIN_BLOCK_AREA,
    )
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
    .slice(0, MAX_CANDIDATE_BLOCKS);
}

function toBlockFeature(
  element: HTMLElement,
  index: number,
  doc: Document,
  viewport: { width: number; height: number },
): BlockFeature | null {
  if (!isVisible(element)) return null;

  const text = readText(element);
  const linkText = Array.from(element.querySelectorAll<HTMLElement>("a[href]"))
    .map((link) => readText(link))
    .join("");
  const linkCount = element.querySelectorAll("a[href]").length;
  const imageCount = element.querySelectorAll("img, picture, video").length;
  const buttonCount = element.querySelectorAll(
    'button, input[type="button"], input[type="submit"], [role="button"]',
  ).length;
  const headingCount = element.querySelectorAll("h1, h2, h3").length;
  const rect = toRect(element.getBoundingClientRect());
  const position = readPosition(element, doc);
  const linkDensity = text.length > 0 ? Math.min(1, linkText.length / text.length) : 0;
  const signals: string[] = [];
  const viewportArea = Math.max(1, viewport.width * viewport.height);

  if (position === "fixed" || position === "sticky") signals.push(`position_${position}`);
  if (element.matches("aside, nav, [role='complementary'], [role='navigation']")) {
    signals.push("semantic_secondary");
  }
  if (linkCount >= 5 && linkDensity >= 0.5) signals.push("link_dense");
  if (linkCount >= 10) signals.push("many_links");
  if (imageCount >= 5) signals.push("image_heavy");
  if (buttonCount >= 2) signals.push("many_buttons");
  if (headingCount > 0 && linkDensity >= 0.3) signals.push("heading_with_links");
  if (CTA_PATTERN.test(text)) signals.push("cta_text");
  if (element.matches(MODAL_LIKE_SELECTOR)) signals.push("modal_like");
  if (rect.width * rect.height >= viewportArea * 0.5) signals.push("large_block");

  return {
    id: `block-${index + 1}`,
    tag: element.tagName.toLowerCase(),
    selectorHint: buildSelectorHint(element),
    domPath: buildDomPath(element),
    text: text.slice(0, 240),
    textLength: text.length,
    linkCount,
    linkDensity: Number(linkDensity.toFixed(2)),
    imageCount,
    buttonCount,
    headingCount,
    position,
    inViewport:
      rect.width > 0 &&
      rect.height > 0 &&
      rect.x < viewport.width &&
      rect.x + rect.width > 0 &&
      rect.y < viewport.height &&
      rect.y + rect.height > 0,
    rect,
    signals,
  };
}

function readPosition(element: HTMLElement, doc: Document): PositionValue {
  const raw = doc.defaultView?.getComputedStyle(element).position ?? "static";
  return POSITION_VALUES.includes(raw as PositionValue) ? (raw as PositionValue) : "static";
}

function collectIframeSources(doc: Document): string[] {
  const sources = Array.from(doc.querySelectorAll<HTMLIFrameElement>("iframe"))
    .map((frame) => frame.src || frame.getAttribute("src") || "")
    .filter(Boolean)
    .map((source) => source.slice(0, 160));

  return unique(sources).slice(0, 20);
}

function readControlText(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    return readText(null, element.value || element.getAttribute("aria-label") || "");
  }
  return readText(element) || element.getAttribute("aria-label")?.trim() || "";
}

function readText(element: Element | null, fallback = ""): string {
  const text = element?.textContent ?? fallback;
  return text.replace(/\s+/g, " ").trim();
}

function buildSelectorHint(element: HTMLElement): string {
  const id = element.id ? `#${element.id}` : "";
  const classes = Array.from(element.classList)
    .slice(0, 2)
    .map((className) => `.${className}`)
    .join("");
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function buildDomPath(element: HTMLElement): string {
  const doc = element.ownerDocument;
  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== doc.body && parts.length < 8) {
    const parent: HTMLElement | null = current.parentElement;
    const tag = current.tagName.toLowerCase();

    if (!parent) {
      parts.unshift(tag);
      break;
    }

    const siblings = Array.from(parent.children).filter(
      (sibling) => sibling.tagName === current?.tagName,
    );
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
    current = parent;
  }

  return ["body", ...parts].join(" > ");
}

function toRect(rect: DOMRect): Rect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style?.display !== "none" &&
    style?.visibility !== "hidden"
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  return Array.from(new Set(elements));
}
