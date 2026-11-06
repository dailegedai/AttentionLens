import type { BlockFeature, PageFeatures } from "../src/types/index.ts";

export function makeBlock(overrides: Partial<BlockFeature> = {}): BlockFeature {
  return {
    id: "block-1",
    tag: "section",
    selectorHint: "section.content",
    domPath: "body > section:nth-of-type(1)",
    text: "Body copy for a normal content block.",
    textLength: 200,
    linkCount: 0,
    linkDensity: 0,
    imageCount: 0,
    buttonCount: 0,
    headingCount: 1,
    position: "static",
    inViewport: true,
    rect: { x: 0, y: 0, width: 640, height: 420 },
    signals: [],
    ...overrides,
  };
}

export function makeFeatures(overrides: Partial<PageFeatures> = {}): PageFeatures {
  return {
    url: "https://example.com/article",
    title: "A calm article",
    capturedAt: 0,
    textLength: 1200,
    links: 4,
    images: 2,
    buttons: 1,
    stickyElements: 0,
    fixedElements: 0,
    iframes: 0,
    iframeSources: [],
    modalLikeElements: 0,
    headings: ["A calm heading"],
    ctaTexts: [],
    candidateBlocks: [],
    ...overrides,
  };
}
