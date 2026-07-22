const capabilities: Record<string, string> = {
  "GOV-01": "authoritative state, decision rights, separation of duties, and escalation",
  "PORT-01": "portfolio dependencies, capacity, critical path, and systemic-risk management",
  "EVID-01": "evidence provenance, freshness, contradiction detection, and auditability",
  "OPS-01": "safe automation, idempotency, recovery, incident routing, and closure governance",
  "AI-01": "prompt/data boundary, tool authority, model-output verification, and AI incident controls",
};

export function professionalCapabilityPrompt(): string {
  return [
    "Professional capability contract:",
    ...Object.entries(capabilities).map(([id, requirement]) => `- ${id}: ${requirement}`),
    "- For every applicable capability, report evidence, verifier, status, residual risk, and routed owner. Missing evidence blocks handoff; never self-approve another profession.",
    "- The final line must be exactly STAGE_OUTCOME: PASS, STAGE_OUTCOME: BLOCKED, or STAGE_OUTCOME: FAILED. Use BLOCKED whenever required evidence, authority, contract, or environment is missing.",
  ].join("\n");
}

export const professionalCapabilityIds = Object.freeze(Object.keys(capabilities));
