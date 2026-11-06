import assert from "node:assert/strict";
import test from "node:test";

import { ATTENTION_WEIGHTS, scoreAttention, severityFor } from "../src/analysis/scorer.ts";
import type { DetectionReport, DetectorResult, PollutionKind } from "../src/types/index.ts";

function detector(kind: PollutionKind, score: number, reason = "test reason"): DetectorResult {
  return { kind, score, count: 1, reasons: [reason], evidence: [] };
}

function report(scores: Record<PollutionKind, number>): DetectionReport {
  return {
    recommendation: detector("recommendation", scores.recommendation, "recommendation reason"),
    advertisement: detector("advertisement", scores.advertisement, "ad reason"),
    clickbait: detector("clickbait", scores.clickbait, "clickbait reason"),
    cta: detector("cta", scores.cta, "cta reason"),
    uiDistraction: detector("uiDistraction", scores.uiDistraction, "ui reason"),
  };
}

test("attention weights match the documented scoring formula", () => {
  assert.deepEqual(ATTENTION_WEIGHTS, {
    recommendation: 0.25,
    clickbait: 0.25,
    advertisement: 0.2,
    cta: 0.15,
    uiDistraction: 0.15,
  });
});

test("scoreAttention applies weights and ranks primary reasons", () => {
  const score = scoreAttention(
    report({
      recommendation: 80,
      clickbait: 60,
      advertisement: 40,
      cta: 20,
      uiDistraction: 100,
    }),
  );

  assert.equal(score.pollution.attentionCost, 61);
  assert.equal(score.pollution.recommendation, 80);
  assert.equal(score.severity, "moderate");
  assert.equal(score.primaryReasons.length, 3);
  assert.match(score.primaryReasons[0], /Recommendations|Sticky UI/);
});

test("zero-signal pages produce a low cost and a fallback explanation", () => {
  const score = scoreAttention(
    report({ recommendation: 0, clickbait: 0, advertisement: 0, cta: 0, uiDistraction: 0 }),
  );

  assert.equal(score.pollution.attentionCost, 0);
  assert.equal(score.severity, "low");
  assert.deepEqual(score.primaryReasons, [
    "No strong attention-distraction signals were detected by local rules.",
  ]);
});

test("severity thresholds are stable", () => {
  assert.equal(severityFor(0), "low");
  assert.equal(severityFor(39), "low");
  assert.equal(severityFor(40), "moderate");
  assert.equal(severityFor(69), "moderate");
  assert.equal(severityFor(70), "high");
  assert.equal(severityFor(100), "high");
});
