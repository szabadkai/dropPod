export interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  sourceUrl: string;
  tools?: string[];
  model?: string;
  /** The full raw markdown content of the .agent.md file */
  rawContent?: string;
}

export interface Handover {
  fromAgentId: string;
  toAgentId: string;
  prompt?: string;
  requiresApproval: boolean;
}

export interface TeamConfig {
  agents: Agent[];
  handovers: Handover[];
}

export interface CatalogSource {
  id: string;
  label: string;
  /** GitHub owner/repo */
  owner: string;
  repo: string;
  /** Path to the agents directory inside the repo */
  agentsPath: string;
  branch: string;
}

export interface CacheEntry {
  agents: Agent[];
  fetchedAt: number;
}

export const CATALOG_SOURCES: CatalogSource[] = [
  {
    id: "awesome-copilot",
    label: "GitHub Awesome Copilot",
    owner: "github",
    repo: "awesome-copilot",
    agentsPath: "agents",
    branch: "main",
  },
];
