import { productTeam } from "../core/team.ts";

export function runTeamCommand(args: string[]): number {
  const [action] = args;
  if (action && action !== "show") {
    throw new Error("Usage: company-orchestrator team show");
  }

  console.log("Company Orchestration Team\n");
  for (const member of productTeam) {
    console.log(`${member.title} (${member.role})`);
    console.log(`  ${member.mission}`);
    for (const responsibility of member.responsibilities) {
      console.log(`  - ${responsibility}`);
    }
    console.log();
  }
  return 0;
}
