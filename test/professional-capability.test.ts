import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { professionalCapabilityIds, professionalCapabilityPrompt } from "../src/core/professional-capabilities.ts";

test("professional capability profile is complete and injected into runtime prompts", () => {
  assert.equal(professionalCapabilityIds.length, 5);
  assert.equal(new Set(professionalCapabilityIds).size, 5);
  assert.ok(professionalCapabilityIds.includes("GOV-01"));
  assert.ok(professionalCapabilityIds.includes("AI-01"));
  const prompt = professionalCapabilityPrompt();
  for (const id of professionalCapabilityIds) assert.match(prompt, new RegExp(id));
  const profile = readFileSync(new URL("../PROFESSIONAL_CAPABILITY.md", import.meta.url), "utf8");
  assert.match(profile, /direct evidence/i);
  assert.match(profile, /independent verifier/i);
});

