import type { AiBlockCategory, AiBlockClassification, AiHeadlineAnalysis } from "../types";

export interface ParsedAiResult {
  summary: string;
  headline: AiHeadlineAnalysis | null;
  blocks: AiBlockClassification[];
}

const CATEGORIES: AiBlockCategory[] = [
  "main_content",
  "recommendation",
  "advertisement",
  "cta",
  "distraction",
  "other",
];

export class AiParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiParseError";
  }
}

export function parseAiContent(content: unknown): ParsedAiResult {
  const parsed = typeof content === "string" ? parseJsonContent(content) : content;

  if (!isRecord(parsed)) {
    throw new AiParseError("AI response is not a JSON object.");
  }

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    headline: parseHeadline(parsed.headline),
    blocks: parseBlocks(parsed.blocks),
  };
}

function parseJsonContent(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new AiParseError("AI response was not valid JSON.");
  }
}

function parseHeadline(value: unknown): AiHeadlineAnalysis | null {
  if (!isRecord(value) || typeof value.headline !== "string") return null;

  return {
    headline: value.headline.trim(),
    attentionScore: clamp01(typeof value.attentionScore === "number" ? value.attentionScore : 0),
    techniques: Array.isArray(value.techniques)
      ? value.techniques.filter((item): item is string => typeof item === "string").slice(0, 8)
      : [],
  };
}

function parseBlocks(value: unknown): AiBlockClassification[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((block): AiBlockClassification | null => {
      if (typeof block.id !== "string") return null;
      if (typeof block.category !== "string") return null;
      if (!CATEGORIES.includes(block.category as AiBlockCategory)) return null;

      return {
        id: block.id,
        category: block.category as AiBlockCategory,
        confidence: clamp01(typeof block.confidence === "number" ? block.confidence : 0.5),
        reason: typeof block.reason === "string" ? block.reason.trim() : "",
      };
    })
    .filter((block): block is AiBlockClassification => block !== null)
    .slice(0, 40);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
