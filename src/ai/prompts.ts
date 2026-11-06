import type { PageFeatures, PollutionResult } from "../types";

export interface AiBlockPayload {
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
  position: string;
  signals: string[];
}

export interface AiPagePayload {
  page: {
    title: string;
    host: string;
    headings: string[];
    ctaTexts: string[];
    candidateBlocks: AiBlockPayload[];
  };
  localScores: PollutionResult;
}

export const SYSTEM_PROMPT = [
  "You are the semantic analysis layer of AttentionLens, a browser extension that estimates a",
  "webpage's attention cost. You receive structured page features, never raw HTML.",
  "",
  "Your job:",
  "1. Judge whether the page title and headings use attention-inducing techniques such as",
  "   curiosity gaps, exaggeration, urgency, or emotional baiting.",
  "2. Classify each candidate block as main_content, recommendation, advertisement, cta,",
  "   distraction, or other.",
  "3. Explain briefly why the attention cost is high or low.",
  "",
  "Rules:",
  "- Do not judge whether the page or its authors are good, bad, or low quality.",
  "- Only describe attention-inducing structure and semantics.",
  "- Do not invent block ids that were not provided.",
  "- Answer with a single JSON object and no prose or markdown fences.",
  "",
  "Required JSON schema:",
  JSON.stringify(
    {
      summary: "string, 1-3 sentences",
      headline: {
        headline: "string",
        attentionScore: 0.0,
        techniques: ["curiosity_gap"],
      },
      blocks: [
        {
          id: "block-1",
          category: "recommendation",
          confidence: 0.0,
          reason: "string",
        },
      ],
    },
    null,
    2,
  ),
].join("\n");

export function buildAiPayload(
  features: PageFeatures,
  pollution: PollutionResult,
): AiPagePayload {
  return {
    page: {
      title: features.title,
      host: safeHost(features.url),
      headings: features.headings.slice(0, 12),
      ctaTexts: features.ctaTexts.slice(0, 12),
      candidateBlocks: features.candidateBlocks.slice(0, 24).map((block) => ({
        id: block.id,
        tag: block.tag,
        selectorHint: block.selectorHint,
        text: block.text.slice(0, 180),
        textLength: block.textLength,
        linkCount: block.linkCount,
        linkDensity: block.linkDensity,
        imageCount: block.imageCount,
        buttonCount: block.buttonCount,
        headingCount: block.headingCount,
        position: block.position,
        signals: block.signals,
      })),
    },
    localScores: pollution,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
