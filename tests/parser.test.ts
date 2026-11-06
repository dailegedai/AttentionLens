import assert from "node:assert/strict";
import test from "node:test";

import { AiParseError, parseAiContent } from "../src/ai/parser.ts";

test("parses a structured AI response and clamps confidence", () => {
  const result = parseAiContent(
    JSON.stringify({
      summary: "The page pushes related content and a sticky banner.",
      headline: {
        headline: "You won't believe what happened next",
        attentionScore: 1.4,
        techniques: ["curiosity_gap", "exaggeration"],
      },
      blocks: [
        { id: "block-1", category: "recommendation", confidence: 0.9, reason: "Card feed" },
        { id: "block-2", category: "not_a_category", confidence: 0.8, reason: "dropped" },
      ],
    }),
  );

  assert.equal(result.headline?.attentionScore, 1);
  assert.deepEqual(result.headline?.techniques, ["curiosity_gap", "exaggeration"]);
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0]?.category, "recommendation");
});

test("accepts JSON wrapped in markdown fences", () => {
  const result = parseAiContent('```json\n{"summary":"ok","headline":null,"blocks":[]}\n```');

  assert.equal(result.summary, "ok");
  assert.equal(result.headline, null);
  assert.deepEqual(result.blocks, []);
});

test("rejects malformed JSON and non-object payloads", () => {
  assert.throws(() => parseAiContent("{not json"), AiParseError);
  assert.throws(() => parseAiContent("[1, 2, 3]"), AiParseError);
});

test("tolerates missing optional fields", () => {
  const result = parseAiContent({});

  assert.equal(result.summary, "");
  assert.equal(result.headline, null);
  assert.deepEqual(result.blocks, []);
});
