export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PositionValue = "static" | "relative" | "absolute" | "fixed" | "sticky";

export interface BlockFeature {
  id: string;
  tag: string;
  selectorHint: string;
  text: string;
  textLength: number;
  linkCount: number;
  linkDensity: number;
  imageCount: number;
  buttonCount: number;
  headingCount: number;
  position: PositionValue;
  inViewport: boolean;
  rect: Rect;
  signals: string[];
}

export interface PageFeatures {
  url: string;
  title: string;
  capturedAt: number;
  textLength: number;
  links: number;
  images: number;
  buttons: number;
  stickyElements: number;
  fixedElements: number;
  iframes: number;
  headings: string[];
  ctaTexts: string[];
  candidateBlocks: BlockFeature[];
}

export interface ScanSuccess {
  ok: true;
  features: PageFeatures;
}

export interface ScanFailure {
  ok: false;
  error: string;
}

export type ScanResponse = ScanSuccess | ScanFailure;

export type RuntimeRequest =
  | { type: "SCAN_ACTIVE_TAB" }
  | { type: "SCAN_PAGE" }
  | { type: "PING" };
