# Company Orchestrator Agent

A persistent command-line company orchestration team powered by Codex or Claude Code. It turns product and market questions into auditable market research, positioning, ASO/content drafts, company orchestration experiments, measurement plans, and launch recommendations.

## Workflows

- `market-discovery` — customer segments, competitors, positioning, and measurement
- `company orchestration-experiment` — acquisition, activation, retention, or referral experiments
- `launch-campaign` — approval-ready launch plans, content drafts, ASO, and analytics

The team includes a Product Lead, Market Researcher, Product Marketer, Product Analyst, and Product Reviewer. It never publishes content, spends money, contacts customers, or changes campaigns without human approval.

## Install

```bash
git clone git@github.com:rick711003/company-orchestrator-agent.git
cd company-orchestrator-agent
npm install
npm run build
npm link
company-orchestrator-agent doctor
```

## Run

```bash
company-orchestrator-agent run start --dry-run --cwd ../MyProduct --workflow market-discovery "Find the strongest launch audience for our iOS app"
company-orchestrator-agent run start --write --auto-approve --cwd ../MyProduct --workflow company orchestration-experiment "Design a referral experiment for active users"
```

Roles: `coordinator`, `researcher`, `marketer`, `analyst`, and `reviewer`.

## Verify

```bash
npm run verify
```
