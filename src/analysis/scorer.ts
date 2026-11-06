import type {
  AttentionScore,
  AttentionSeverity,
  DetectionReport,
  PollutionKind,
  PollutionResult,
} from "../types";

export const ATTENTION_WEIGHTS: Record<PollutionKind, number> = {
  recommendation: 0.25,
  clickbait: 0.25,
  advertisement: 0.2,
  cta: 0.15,
  uiDistraction: 0.15,
};

const DETECTOR_LABELS: Record<PollutionKind, string> = {
  recommendation: "Recommendations",
  advertisement: "Ads",
  clickbait: "Clickbait",
  cta: "CTA",
  uiDistraction: "Sticky UI",
};

export function scoreAttention(detectors: DetectionReport): AttentionScore {
  const pollution: PollutionResult = {
    recommendation: detectors.recommendation.score,
    advertisement: detectors.advertisement.score,
    clickbait: detectors.clickbait.score,
    cta: detectors.cta.score,
    uiDistraction: detectors.uiDistraction.score,
    attentionCost: 0,
  };

  const attentionCost = Math.round(
    (Object.keys(ATTENTION_WEIGHTS) as PollutionKind[]).reduce(
      (total, kind) => total + detectors[kind].score * ATTENTION_WEIGHTS[kind],
      0,
    ),
  );
  pollution.attentionCost = attentionCost;

  const contributions = (Object.keys(ATTENTION_WEIGHTS) as PollutionKind[])
    .map((kind) => ({
      kind,
      score: detectors[kind].score,
      points: detectors[kind].score * ATTENTION_WEIGHTS[kind],
      reason: detectors[kind].reasons[0] ?? "No strong signals.",
    }))
    .sort((a, b) => b.points - a.points);

  const primaryReasons = contributions
    .filter((contribution) => contribution.points >= 1)
    .slice(0, 3)
    .map(
      (contribution) =>
        `${DETECTOR_LABELS[contribution.kind]} (${contribution.score}/100, ${contribution.points.toFixed(1)} weighted points): ${contribution.reason}`,
    );

  if (primaryReasons.length === 0) {
    primaryReasons.push("No strong attention-distraction signals were detected by local rules.");
  }

  return {
    pollution,
    severity: severityFor(attentionCost),
    primaryReasons,
  };
}

export function severityFor(attentionCost: number): AttentionSeverity {
  if (attentionCost >= 70) return "high";
  if (attentionCost >= 40) return "moderate";
  return "low";
}

export function detectorLabel(kind: PollutionKind): string {
  return DETECTOR_LABELS[kind];
}
