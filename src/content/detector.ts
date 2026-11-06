import type {
  BlockFeature,
  DetectionEvidence,
  DetectionReport,
  DetectorResult,
  PageFeatures,
} from "../types";

const MAX_EVIDENCE = 12;

const RECOMMENDATION_KEYWORDS = [
  "related",
  "recommended",
  "recommend",
  "popular",
  "trending",
  "you may also like",
  "more from",
  "editor's picks",
  "相关推荐",
  "推荐",
  "热门",
  "猜你喜欢",
  "更多",
];

const ADVERTISEMENT_KEYWORDS = [
  "ad",
  "ads",
  "advert",
  "advertisement",
  "sponsored",
  "sponsor",
  "promotion",
  "promoted",
  "广告",
  "赞助",
  "推广",
  "广告位",
];

const CLICKBAIT_KEYWORDS = [
  "shocking",
  "you won't believe",
  "secret",
  "the truth",
  "insider",
  "must see",
  "everyone",
  "viral",
  "exposed",
  "revealed",
  "this one trick",
  "what happened next",
  "mind blowing",
  "震惊",
  "你绝对想不到",
  "真相",
  "内幕",
  "必看",
  "99%",
  "秘密",
  "揭秘",
  "竟然",
];

const AD_HOST_KEYWORDS = [
  "doubleclick",
  "googlesyndication",
  "googleadservices",
  "adsystem",
  "adservice",
  "criteo",
  "taboola",
  "outbrain",
  "pubmatic",
  "rubiconproject",
  "adsrvr",
];

export function runDetectors(features: PageFeatures): DetectionReport {
  return {
    recommendation: detectRecommendation(features),
    advertisement: detectAdvertisement(features),
    clickbait: detectClickbait(features),
    cta: detectCta(features),
    uiDistraction: detectUiDistraction(features),
  };
}

function detectRecommendation(features: PageFeatures): DetectorResult {
  const evidence: DetectionEvidence[] = [];
  const matched = new Set<string>();
  let raw = 0;
  let keywordBlocks = 0;
  let linkDenseBlocks = 0;

  for (const block of features.candidateBlocks) {
    const hits = keywordHits(`${block.selectorHint} ${block.text}`, RECOMMENDATION_KEYWORDS);
    const isContentContainer = block.tag === "article" || block.tag === "main";

    if (hits.length > 0) {
      const weight = Math.min(30, 14 + (hits.length - 1) * 5);
      raw += weight;
      keywordBlocks += 1;
      matched.add(block.id);
      evidence.push({
        label: "recommendation_keyword",
        detail: `${block.selectorHint} mentions ${hits.join(", ")}`,
        weight,
        selectorHint: block.selectorHint,
        blockId: block.id,
      });
    }

    if (
      !isContentContainer &&
      block.linkCount >= 5 &&
      (block.signals.includes("link_dense") ||
        (block.signals.includes("many_links") && block.linkDensity >= 0.4))
    ) {
      raw += 12;
      linkDenseBlocks += 1;
      matched.add(block.id);
      evidence.push({
        label: "link_dense_feed",
        detail: `${block.selectorHint} has ${block.linkCount} links with ${block.linkDensity} link density`,
        weight: 12,
        selectorHint: block.selectorHint,
        blockId: block.id,
      });
    }

    if (
      !isContentContainer &&
      block.signals.includes("image_heavy") &&
      block.linkCount >= 3 &&
      block.linkDensity >= 0.3
    ) {
      raw += 6;
      matched.add(block.id);
      evidence.push(imageCardEvidence(block));
    }

    if (
      !isContentContainer &&
      block.signals.includes("heading_with_links") &&
      block.linkCount >= 5 &&
      block.linkDensity >= 0.4
    ) {
      raw += 6;
      matched.add(block.id);
      evidence.push({
        label: "heading_with_links",
        detail: `${block.selectorHint} mixes headings with link-heavy content`,
        weight: 6,
        selectorHint: block.selectorHint,
        blockId: block.id,
      });
    }
  }

  const headingHits = features.headings.filter(
    (heading) => keywordHits(heading, RECOMMENDATION_KEYWORDS).length > 0,
  );

  if (headingHits.length > 0) {
    raw += Math.min(24, headingHits.length * 12);
    for (const heading of headingHits) matched.add(`heading:${heading}`);
    evidence.push({
      label: "recommendation_heading",
      detail: `Recommendation-style heading: ${quote(headingHits[0])}`,
      weight: Math.min(24, headingHits.length * 12),
    });
  }

  return {
    kind: "recommendation",
    score: clamp(raw),
    count: matched.size,
    reasons: recommendationReasons(keywordBlocks, linkDenseBlocks, headingHits),
    evidence: evidence.slice(0, MAX_EVIDENCE),
  };
}

function detectAdvertisement(features: PageFeatures): DetectorResult {
  const evidence: DetectionEvidence[] = [];
  const matched = new Set<string>();
  let raw = 0;
  let adKeywordBlocks = 0;

  for (const block of features.candidateBlocks) {
    const hits = keywordHits(`${block.selectorHint} ${block.text}`, ADVERTISEMENT_KEYWORDS);
    if (hits.length === 0) continue;

    raw += 22;
    adKeywordBlocks += 1;
    matched.add(block.id);
    evidence.push({
      label: "advertisement_keyword",
      detail: `${block.selectorHint} mentions ${hits.join(", ")}`,
      weight: 22,
      selectorHint: block.selectorHint,
      blockId: block.id,
    });
  }

  const adHostFrames = features.iframeSources.filter(
    (source) => keywordHits(source, AD_HOST_KEYWORDS).length > 0,
  );
  const genericFrames = features.iframes - adHostFrames.length;

  if (adHostFrames.length > 0) {
    raw += Math.min(60, adHostFrames.length * 30);
    for (const source of adHostFrames) matched.add(`iframe:${source}`);
    evidence.push({
      label: "ad_host_iframe",
      detail: `${adHostFrames.length} iframe(s) use known ad hosts`,
      weight: Math.min(60, adHostFrames.length * 30),
    });
  }

  if (genericFrames > 0) {
    raw += Math.min(18, genericFrames * 6);
    for (let index = 0; index < genericFrames; index += 1) matched.add(`iframe-${index}`);
    evidence.push({
      label: "iframe_container",
      detail: `${genericFrames} iframe(s) present without a known ad host`,
      weight: Math.min(18, genericFrames * 6),
    });
  }

  const adHeadings = features.headings.filter(
    (heading) => keywordHits(heading, ADVERTISEMENT_KEYWORDS).length > 0,
  );
  if (adHeadings.length > 0) {
    raw += Math.min(24, adHeadings.length * 12);
    for (const heading of adHeadings) matched.add(`heading:${heading}`);
    evidence.push({
      label: "advertisement_heading",
      detail: `Advertisement-style heading: ${quote(adHeadings[0])}`,
      weight: Math.min(24, adHeadings.length * 12),
    });
  }

  const reasons: string[] = [];
  if (adKeywordBlocks > 0) reasons.push(`Ad language appears in ${adKeywordBlocks} block(s).`);
  if (adHostFrames.length > 0) reasons.push(`${adHostFrames.length} iframe(s) match known ad hosts.`);
  if (genericFrames > 0 && adKeywordBlocks === 0) {
    reasons.push(`${genericFrames} iframe(s) add weak ad-container evidence.`);
  }
  if (adHeadings.length > 0) reasons.push(`Ad-style heading(s): ${quote(adHeadings[0])}.`);
  if (reasons.length === 0) reasons.push("No advertisement signals found.");

  return {
    kind: "advertisement",
    score: clamp(raw),
    count: matched.size,
    reasons,
    evidence: evidence.slice(0, MAX_EVIDENCE),
  };
}

function detectClickbait(features: PageFeatures): DetectorResult {
  const evidence: DetectionEvidence[] = [];
  const headlines = unique([features.title, ...features.headings]).filter(Boolean).slice(0, 25);
  const matched: string[] = [];
  let raw = 0;

  for (const headline of headlines) {
    const hits = keywordHits(headline, CLICKBAIT_KEYWORDS);
    const letters = headline.replace(/[^a-z]/gi, "");
    const capsCount = headline.match(/[A-Z]/g)?.length ?? 0;
    const capsRatio = letters.length >= 8 ? capsCount / letters.length : 0;
    const exclamations = headline.match(/!/g)?.length ?? 0;
    const listicle = /^\s*\d+\s/.test(headline);
    let weight = 0;
    const cues: string[] = [];

    if (hits.length > 0) {
      weight += Math.min(30, 16 + (hits.length - 1) * 8);
      cues.push(`keywords: ${hits.join(", ")}`);
    }
    if (capsRatio >= 0.6) {
      weight += 8;
      cues.push("all-caps emphasis");
    }
    if (exclamations >= 2) {
      weight += 6;
      cues.push(`${exclamations} exclamation marks`);
    }
    if (listicle) {
      weight += 6;
      cues.push("numbered hook");
    }

    if (weight === 0) continue;

    raw += weight;
    matched.push(headline);
    evidence.push({
      label: headline === features.title ? "clickbait_title" : "clickbait_heading",
      detail: `${quote(headline)} — ${cues.join("; ")}`,
      weight,
    });
  }

  const reasons: string[] = [];
  if (matched.length > 0) {
    reasons.push(`${matched.length} headline(s) use attention-inducing phrasing.`);
    reasons.push(`Top signal: ${quote(matched[0])}.`);
  } else {
    reasons.push("No clickbait-style headline signals found.");
  }

  return {
    kind: "clickbait",
    score: clamp(raw),
    count: matched.length,
    reasons,
    evidence: evidence.slice(0, MAX_EVIDENCE),
  };
}

function detectCta(features: PageFeatures): DetectorResult {
  const evidence: DetectionEvidence[] = [];
  const ctaBlocks = features.candidateBlocks.filter((block) => block.signals.includes("cta_text"));
  let raw = 0;

  if (features.ctaTexts.length > 0) {
    const weight = Math.min(60, features.ctaTexts.length * 12);
    raw += weight;
    for (const text of features.ctaTexts.slice(0, 6)) {
      evidence.push({
        label: "cta_text",
        detail: `CTA-like control: ${quote(text)}`,
        weight: Math.round(weight / Math.min(features.ctaTexts.length, 6)),
      });
    }
  }

  if (ctaBlocks.length > 0) {
    raw += Math.min(24, ctaBlocks.length * 8);
    evidence.push({
      label: "cta_block",
    detail: `${ctaBlocks.length} large block(s) contain CTA text`,
    weight: Math.min(24, ctaBlocks.length * 8),
    blockId: ctaBlocks[0]?.id,
    blockIds: ctaBlocks.map((block) => block.id),
    });
  }

  if (features.buttons >= 12) {
    raw += 10;
    evidence.push({
      label: "button_pressure",
      detail: `${features.buttons} buttons detected across the page`,
      weight: 10,
    });
  } else if (features.buttons >= 6) {
    raw += 5;
    evidence.push({
      label: "button_pressure",
      detail: `${features.buttons} buttons detected across the page`,
      weight: 5,
    });
  }

  const reasons: string[] = [];
  if (features.ctaTexts.length > 0) {
    reasons.push(`${features.ctaTexts.length} CTA-like control(s), e.g. ${quote(features.ctaTexts[0])}.`);
  }
  if (ctaBlocks.length > 0) reasons.push(`CTA text appears inside ${ctaBlocks.length} large block(s).`);
  if (features.buttons >= 6) reasons.push(`${features.buttons} buttons create action pressure.`);
  if (reasons.length === 0) reasons.push("No CTA pressure found.");

  return {
    kind: "cta",
    score: clamp(raw),
    count: features.ctaTexts.length,
    reasons,
    evidence: evidence.slice(0, MAX_EVIDENCE),
  };
}

function detectUiDistraction(features: PageFeatures): DetectorResult {
  const evidence: DetectionEvidence[] = [];
  const persistentBlocks = features.candidateBlocks.filter(
    (block) => block.signals.includes("position_fixed") || block.signals.includes("position_sticky"),
  );
  let raw = 0;

  if (features.fixedElements > 0) {
    const weight = Math.min(40, features.fixedElements * 8);
    raw += weight;
    evidence.push({
      label: "fixed_elements",
      detail: `${features.fixedElements} fixed-position element(s)`,
      weight,
    });
  }

  if (features.stickyElements > 0) {
    const weight = Math.min(30, features.stickyElements * 6);
    raw += weight;
    evidence.push({
      label: "sticky_elements",
      detail: `${features.stickyElements} sticky element(s)`,
      weight,
    });
  }

  if (features.modalLikeElements > 0) {
    const weight = Math.min(30, features.modalLikeElements * 12);
    raw += weight;
    evidence.push({
      label: "modal_like",
      detail: `${features.modalLikeElements} modal/overlay-style element(s)`,
      weight,
    });
  }

  if (persistentBlocks.length > 0) {
    const weight = Math.min(15, persistentBlocks.length * 5);
    raw += weight;
    evidence.push({
      label: "persistent_block",
    detail: `${persistentBlocks.length} large block(s) stay fixed or sticky`,
    weight,
    blockId: persistentBlocks[0]?.id,
    blockIds: persistentBlocks.map((block) => block.id),
    });
  }

  const reasons: string[] = [];
  if (features.fixedElements > 0) reasons.push(`${features.fixedElements} fixed element(s) can cover content.`);
  if (features.stickyElements > 0) reasons.push(`${features.stickyElements} sticky element(s) persist while scrolling.`);
  if (features.modalLikeElements > 0) reasons.push(`${features.modalLikeElements} modal/overlay-style element(s) detected.`);
  if (reasons.length === 0) reasons.push("No sticky or overlay UI found.");

  return {
    kind: "uiDistraction",
    score: clamp(raw),
    count: features.fixedElements + features.stickyElements + features.modalLikeElements,
    reasons,
    evidence: evidence.slice(0, MAX_EVIDENCE),
  };
}

function recommendationReasons(
  keywordBlocks: number,
  linkDenseBlocks: number,
  headingHits: string[],
): string[] {
  const reasons: string[] = [];
  if (keywordBlocks > 0) reasons.push(`Recommendation language appears in ${keywordBlocks} block(s).`);
  if (linkDenseBlocks > 0) reasons.push(`${linkDenseBlocks} link-dense block(s) look like recommendation feeds.`);
  if (headingHits.length > 0) reasons.push(`Recommendation-style heading(s): ${quote(headingHits[0])}.`);
  if (reasons.length === 0) reasons.push("No recommendation signals found.");
  return reasons;
}

function imageCardEvidence(block: BlockFeature): DetectionEvidence {
  return {
    label: "image_card_feed",
    detail: `${block.selectorHint} has ${block.imageCount} images and ${block.linkCount} links`,
    weight: 6,
    selectorHint: block.selectorHint,
    blockId: block.id,
  };
}

function keywordHits(text: string, keywords: string[]): string[] {
  const lowerText = text.toLowerCase();

  return keywords.filter((keyword) => {
    const lowerKeyword = keyword.toLowerCase();
    if (!/^[a-z0-9' -]+$/.test(lowerKeyword)) return lowerText.includes(lowerKeyword);

    const escaped = lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(lowerText);
  });
}

function quote(text: string): string {
  return `“${text.slice(0, 70)}”`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
