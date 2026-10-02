import type { Page } from "@playwright/test";

/**
 * The agent registry's rows, found by agent id.
 *
 * The registry has no id column. Each row is headed by the agent's name, and
 * that header's accessible name is "<name> (id: <id>)": the id rides along
 * out of sight so two agents sharing a name are still told apart. These match
 * on the id at the end of that name, which is unique where a name is not.
 */

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The accessible name the registry gives an agent's row header. */
export function registryRowName(agent: { id: string; name: string }): string {
  return `${agent.name} (id: ${agent.id})`;
}

/** The row header of the agent with this id. */
export function registryRowHeader(page: Page, agentId: string) {
  return page.getByRole("rowheader", {
    name: new RegExp(`\\(id: ${escapeRegExp(agentId)}\\)$`),
  });
}

/**
 * The agent's own row. Deliberately not `hasText: <name>`: an unbound or
 * failed-lookup notice is a second row repeating the agent's name.
 */
export function registryRow(page: Page, agentId: string) {
  return page.getByRole("row").filter({
    has: registryRowHeader(page, agentId),
  });
}
