import assert from "node:assert/strict";
import test from "node:test";

import { runDetectors } from "../src/content/detector.ts";
import { makeBlock, makeFeatures } from "./fixtures.ts";

test("clean pages produce zero scores and explicit empty reasons", () => {
  const report = runDetectors(makeFeatures());

  assert.equal(report.recommendation.score, 0);
  assert.equal(report.advertisement.score, 0);
  assert.equal(report.clickbait.score, 0);
  assert.equal(report.cta.score, 0);
  assert.equal(report.uiDistraction.score, 0);
  assert.deepEqual(report.recommendation.reasons, ["No recommendation signals found."]);
  assert.deepEqual(report.advertisement.reasons, ["No advertisement signals found."]);
  assert.deepEqual(report.clickbait.reasons, ["No clickbait-style headline signals found."]);
  assert.deepEqual(report.cta.reasons, ["No CTA pressure found."]);
  assert.deepEqual(report.uiDistraction.reasons, ["No sticky or overlay UI found."]);
});

test("recommendation detector uses keywords, link density, and headings", () => {
  const report = runDetectors(
    makeFeatures({
      headings: ["Recommended for you"],
      candidateBlocks: [
        makeBlock({
          text: "Related stories and popular picks you may also like",
          selectorHint: "section.related",
          linkCount: 12,
          linkDensity: 0.72,
          imageCount: 6,
          signals: ["link_dense", "many_links", "image_heavy", "heading_with_links"],
        }),
      ],
    }),
  );

  assert.ok(report.recommendation.score >= 60, `expected score >= 60, got ${report.recommendation.score}`);
  assert.equal(report.recommendation.count, 2);
  assert.ok(report.recommendation.evidence.length >= 3);
  assert.match(report.recommendation.reasons[0], /Recommendation language/);
});

test("recommendation detector ignores link-rich article content", () => {
  const report = runDetectors(
    makeFeatures({
      candidateBlocks: [
        makeBlock({
          tag: "article",
          text: "About this Handbook. Over 20 years after its introduction to the world.",
          selectorHint: "article.doc",
          linkCount: 14,
          linkDensity: 0.55,
          imageCount: 6,
          headingCount: 5,
          signals: ["link_dense", "many_links", "image_heavy", "heading_with_links"],
        }),
      ],
    }),
  );

  assert.equal(report.recommendation.score, 0);
  assert.equal(report.recommendation.count, 0);
});

test("advertisement detector matches ad copy and known ad-host iframes", () => {
  const report = runDetectors(
    makeFeatures({
      iframes: 1,
      iframeSources: ["https://ads.example.com/doubleclick/unit?slot=1"],
      candidateBlocks: [
        makeBlock({
          text: "Sponsored advertisement from our partner",
          selectorHint: "aside.ad-slot",
          signals: ["semantic_secondary"],
        }),
      ],
    }),
  );

  assert.ok(report.advertisement.score >= 50, `expected score >= 50, got ${report.advertisement.score}`);
  assert.ok(report.advertisement.count >= 2);
  assert.ok(report.advertisement.reasons.some((reason) => /ad hosts/.test(reason)));
});

test("clickbait detector flags curiosity-gap titles", () => {
  const report = runDetectors(
    makeFeatures({
      title: "You won't believe this SHOCKING secret!!!",
      headings: ["The truth insiders don't want you to see"],
    }),
  );

  assert.ok(report.clickbait.score >= 40, `expected score >= 40, got ${report.clickbait.score}`);
  assert.equal(report.clickbait.count, 2);
  assert.match(report.clickbait.reasons[0], /attention-inducing phrasing/);
});

test("cta and ui detectors normalize counts into bounded scores", () => {
  const report = runDetectors(
    makeFeatures({
      buttons: 14,
      stickyElements: 3,
      fixedElements: 4,
      modalLikeElements: 1,
      ctaTexts: ["Subscribe", "Start free trial", "Buy now"],
      candidateBlocks: [
        makeBlock({
          text: "Subscribe now to get more updates",
          selectorHint: "div.cta-banner",
          signals: ["cta_text", "position_fixed", "modal_like"],
        }),
      ],
    }),
  );

  assert.ok(report.cta.score > 0 && report.cta.score <= 100);
  assert.equal(report.cta.count, 3);
  assert.ok(report.uiDistraction.score >= 60, `expected score >= 60, got ${report.uiDistraction.score}`);
  assert.equal(report.uiDistraction.count, 8);
});
