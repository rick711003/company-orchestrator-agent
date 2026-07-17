import type { AgentRole, WorkflowDefinition } from "./workflow.ts";
import type { ProviderName } from "../providers/provider.ts";

export interface TokenRange {
  low: number;
  typical: number;
  high: number;
}

export interface StageTokenEstimate extends TokenRange {
  id: string;
  role: AgentRole;
  provider: ProviderName;
}

export interface TeamTokenEstimate {
  calls: number;
  stages: StageTokenEstimate[];
  total: TokenRange;
  byProvider: Partial<Record<ProviderName, TokenRange>>;
}

export interface ApiRateCard {
  model: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  source: string;
  checkedAt: string;
}

export interface UsdRange {
  low: number;
  typical: number;
  high: number;
}

export interface RoiEstimate {
  valuePerRun: number;
  breakEvenHours: number;
  netPerRun: number;
  roiPercent: number;
  monthlyAiCost: number;
  monthlyValue: number;
  monthlyNet: number;
}

export const apiRateCards: Record<ProviderName, ApiRateCard> = {
  codex: {
    model: "gpt-5.3-codex",
    inputUsdPerMillion: 1.75,
    outputUsdPerMillion: 14,
    source: "https://developers.openai.com/api/docs/models/gpt-5.3-codex",
    checkedAt: "2026-07-17",
  },
  claude: {
    model: "claude-sonnet-4",
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    source: "https://www.anthropic.com/pricing?subjects=claude&type=product",
    checkedAt: "2026-07-17",
  },
};

const roleBudget: Record<AgentRole, TokenRange> = {
  coordinator: { low: 3_000, typical: 8_000, high: 20_000 },
  researcher: { low: 4_000, typical: 12_000, high: 35_000 },
  strategist: { low: 8_000, typical: 24_000, high: 70_000 },
  delivery: { low: 4_000, typical: 12_000, high: 35_000 },
  reviewer: { low: 4_000, typical: 14_000, high: 40_000 },
};

function add(left: TokenRange, right: TokenRange): TokenRange {
  return {
    low: left.low + right.low,
    typical: left.typical + right.typical,
    high: left.high + right.high,
  };
}

export function estimateTeamTokens(
  task: string,
  workflow: WorkflowDefinition,
  defaultProvider: ProviderName,
  roleProviders: Partial<Record<AgentRole, ProviderName>> = {},
): TeamTokenEstimate {
  const taskTokens = Math.ceil(task.length / 4);
  const stages = workflow.stages.map((stage, index): StageTokenEstimate => {
    const budget = roleBudget[stage.role];
    const inheritedContext = index * Math.min(6_000, Math.ceil(budget.typical * 0.2));
    return {
      id: stage.id,
      role: stage.role,
      provider: roleProviders[stage.role] ?? defaultProvider,
      low: budget.low + taskTokens,
      typical: budget.typical + taskTokens + inheritedContext,
      high: budget.high + taskTokens + inheritedContext * 2,
    };
  });
  const zero = { low: 0, typical: 0, high: 0 };
  const total = stages.reduce<TokenRange>(add, zero);
  const byProvider: Partial<Record<ProviderName, TokenRange>> = {};
  for (const stage of stages) {
    byProvider[stage.provider] = add(byProvider[stage.provider] ?? zero, stage);
  }
  return { calls: stages.length, stages, total, byProvider };
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

export function formatTokenRange(range: TokenRange): string {
  return `${formatTokens(range.low)} / ${formatTokens(range.typical)} / ${formatTokens(range.high)}`;
}

export function estimateApiUsd(
  tokens: TokenRange,
  rate: ApiRateCard,
  outputRatio = 0.15,
): UsdRange {
  if (outputRatio < 0 || outputRatio > 1) throw new Error("Output ratio must be between 0 and 1.");
  const blendedRate = rate.inputUsdPerMillion * (1 - outputRatio) + rate.outputUsdPerMillion * outputRatio;
  return {
    low: tokens.low * blendedRate / 1_000_000,
    typical: tokens.typical * blendedRate / 1_000_000,
    high: tokens.high * blendedRate / 1_000_000,
  };
}

export function formatUsdRange(range: UsdRange): string {
  const value = (amount: number) => `$${amount.toFixed(amount < 0.01 ? 3 : 2)}`;
  return `${value(range.low)} / ${value(range.typical)} / ${value(range.high)}`;
}

export function estimateRoi(
  typicalAiCost: number,
  productManagerRate: number,
  hoursSaved: number,
  runsPerMonth = 1,
): RoiEstimate {
  if (typicalAiCost < 0 || productManagerRate <= 0 || hoursSaved < 0 || runsPerMonth <= 0) {
    throw new Error("ROI inputs must be positive (hours saved may be zero). ");
  }
  const valuePerRun = productManagerRate * hoursSaved;
  const netPerRun = valuePerRun - typicalAiCost;
  return {
    valuePerRun,
    breakEvenHours: typicalAiCost / productManagerRate,
    netPerRun,
    roiPercent: typicalAiCost === 0 ? Number.POSITIVE_INFINITY : netPerRun / typicalAiCost * 100,
    monthlyAiCost: typicalAiCost * runsPerMonth,
    monthlyValue: valuePerRun * runsPerMonth,
    monthlyNet: netPerRun * runsPerMonth,
  };
}
