import assert from "node:assert/strict";
import test from "node:test";

import { maskApiKey } from "../src/settings.ts";

test("maskApiKey keeps a short prefix and suffix without exposing the key", () => {
  const masked = maskApiKey("sk-abcdef1234567890");

  assert.ok(masked.startsWith("sk-"));
  assert.ok(masked.endsWith("7890"));
  assert.ok(masked.includes("•"));
  assert.notEqual(masked, "sk-abcdef1234567890");
});

test("maskApiKey handles short and empty keys", () => {
  assert.equal(maskApiKey(""), "");
  assert.equal(maskApiKey("short"), "•••••");
});
