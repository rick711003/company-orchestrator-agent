import assert from "node:assert/strict";
import test from "node:test";
import {
  apiRateCards,
  estimateApiUsd,
  estimateTeamTokens,
  formatTokenRange,
  formatUsdRange,
  estimateRoi,
} from "../src/core/usage-estimate.ts";
import { portfolioStatusWorkflow } from "../src/workflows/portfolio-status.ts";

test("estimates every stage and splits mixed-provider usage", () => {
  const estimate = estimateTeamTokens(
    "Build login",
    portfolioStatusWorkflow,
    "codex",
    { reviewer: "claude" },
  );
  assert.equal(estimate.calls, portfolioStatusWorkflow.stages.length);
  assert.equal(estimate.stages.at(-1)?.provider, "claude");
  assert.ok(estimate.byProvider.codex);
  assert.ok(estimate.byProvider.claude);
  assert.equal(
    estimate.total.typical,
    (estimate.byProvider.codex?.typical ?? 0) + (estimate.byProvider.claude?.typical ?? 0),
  );
  assert.ok(estimate.total.low < estimate.total.typical);
  assert.ok(estimate.total.typical < estimate.total.high);
});

test("formats ranges for coworker-facing output", () => {
  assert.equal(formatTokenRange({ low: 4_000, typical: 72_000, high: 1_200_000 }), "4k / 72k / 1.2M");
});

test("estimates API USD with an explicit input/output assumption", () => {
  const usd = estimateApiUsd(
    { low: 10_000, typical: 100_000, high: 1_000_000 },
    apiRateCards.codex,
    0.15,
  );
  assert.ok(usd.low < usd.typical && usd.typical < usd.high);
  assert.equal(formatUsdRange(usd), "$0.04 / $0.36 / $3.59");
});

test("calculates break-even time and monthly ROI", () => {
  const roi = estimateRoi(1.5, 75, 2, 20);
  assert.equal(roi.valuePerRun, 150);
  assert.equal(roi.breakEvenHours, 0.02);
  assert.equal(roi.netPerRun, 148.5);
  assert.equal(roi.monthlyAiCost, 30);
  assert.equal(roi.monthlyNet, 2970);
});
