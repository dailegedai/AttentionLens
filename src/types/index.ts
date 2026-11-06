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
  domPath: string;
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
  iframeSources: string[];
  modalLikeElements: number;
  headings: string[];
  ctaTexts: string[];
  candidateBlocks: BlockFeature[];
}

export type PollutionKind =
  | "recommendation"
  | "advertisement"
  | "clickbait"
  | "cta"
  | "uiDistraction";

export interface DetectionEvidence {
  label: string;
  detail: string;
  weight: number;
  selectorHint?: string;
  blockId?: string;
  blockIds?: string[];
}

export interface DetectorResult {
  kind: PollutionKind;
  score: number;
  count: number;
  reasons: string[];
  evidence: DetectionEvidence[];
}

export interface DetectionReport {
  recommendation: DetectorResult;
  advertisement: DetectorResult;
  clickbait: DetectorResult;
  cta: DetectorResult;
  uiDistraction: DetectorResult;
}

export interface PollutionResult {
  recommendation: number;
  advertisement: number;
  clickbait: number;
  cta: number;
  uiDistraction: number;
  attentionCost: number;
}

export type AttentionSeverity = "low" | "moderate" | "high";

export interface AttentionScore {
  pollution: PollutionResult;
  severity: AttentionSeverity;
  primaryReasons: string[];
}

export interface AnalysisResult {
  features: PageFeatures;
  detectors: DetectionReport;
  pollution: PollutionResult;
  severity: AttentionSeverity;
  primaryReasons: string[];
  ai?: AiAnalysis;
  aiError?: string;
}

export type AiBlockCategory =
  | "main_content"
  | "recommendation"
  | "advertisement"
  | "cta"
  | "distraction"
  | "other";

export interface AiBlockClassification {
  id: string;
  category: AiBlockCategory;
  confidence: number;
  reason: string;
}

export interface AiHeadlineAnalysis {
  headline: string;
  attentionScore: number;
  techniques: string[];
}

export interface AiAnalysis {
  summary: string;
  headline: AiHeadlineAnalysis | null;
  blocks: AiBlockClassification[];
  model: string;
  analyzedAt: number;
}

export interface AiSettings {
  enabled: boolean;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface PageRuntimeState {
  analysisReady: boolean;
  overlayVisible: boolean;
  focusMode: boolean;
  hiddenCount: number;
}

export interface ActionSuccess {
  ok: true;
  state: PageRuntimeState;
}

export interface ActionFailure {
  ok: false;
  error: string;
}

export type ActionResponse = ActionSuccess | ActionFailure;

export interface TestConnectionSuccess {
  ok: true;
  message: string;
}

export interface TestConnectionFailure {
  ok: false;
  error: string;
}

export type TestConnectionResponse = TestConnectionSuccess | TestConnectionFailure;

export interface ScanSuccess {
  ok: true;
  features: PageFeatures;
}

export interface ScanFailure {
  ok: false;
  error: string;
}

export type ScanResponse = ScanSuccess | ScanFailure;

export interface AnalyzeSuccess {
  ok: true;
  analysis: AnalysisResult;
}

export interface AnalyzeFailure {
  ok: false;
  error: string;
}

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure;

export type RuntimeRequest =
  | { type: "SCAN_ACTIVE_TAB" }
  | { type: "ANALYZE_ACTIVE_TAB" }
  | { type: "TOGGLE_INSPECT" }
  | { type: "ENTER_FOCUS_MODE" }
  | { type: "EXIT_FOCUS_MODE" }
  | { type: "GET_PAGE_STATE" }
  | { type: "TEST_AI_CONNECTION"; settings: AiSettings }
  | { type: "SYNC_ANALYSIS"; analysis: AnalysisResult }
  | { type: "SCAN_PAGE" }
  | { type: "ANALYZE_PAGE" }
  | { type: "PING" };
