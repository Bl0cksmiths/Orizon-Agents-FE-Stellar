import type { Agent } from "./types";

/** Is this agent listed — still offered to the orchestrator by its operator? */
export function isListed(agent: Pick<Agent, "status">): boolean {
  return agent.status !== "offline";
}
