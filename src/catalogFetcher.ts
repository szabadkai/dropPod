import * as vscode from "vscode";
import {
  Agent,
  CacheEntry,
  CatalogSource,
  CATALOG_SOURCES,
} from "./types.js";
import { parse as parseYaml } from "yaml";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 15_000;
const CONCURRENT_LIMIT = 10;

interface GitHubFile {
  name: string;
  path: string;
  download_url: string;
  html_url: string;
  size: number;
}

export class CatalogFetcher {
  private cache: Map<string, CacheEntry> = new Map();
  private storageUri: vscode.Uri;
  private output: vscode.OutputChannel;

  constructor(storageUri: vscode.Uri, output: vscode.OutputChannel) {
    this.storageUri = storageUri;
    this.output = output;
  }

  async loadAll(forceRefresh = false): Promise<Agent[]> {
    const allAgents: Agent[] = [];

    for (const source of CATALOG_SOURCES) {
      try {
        const agents = await this.loadSource(source, forceRefresh);
        allAgents.push(...agents);
      } catch (err) {
        this.output.appendLine(
          `[dropPod] Failed to load ${source.label}: ${err}`
        );
      }
    }

    return allAgents;
  }

  private async loadSource(
    source: CatalogSource,
    forceRefresh: boolean
  ): Promise<Agent[]> {
    if (!forceRefresh) {
      const cached = await this.readCache(source.id);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        this.output.appendLine(
          `[dropPod] Using cached data for ${source.label}`
        );
        return cached.agents;
      }
    }

    this.output.appendLine(
      `[dropPod] Fetching agent list from ${source.owner}/${source.repo}/${source.agentsPath}`
    );

    // Step 1: List all .agent.md files in the agents directory
    const listUrl = `https://api.github.com/repos/${source.owner}/${source.repo}/contents/${source.agentsPath}?ref=${source.branch}`;
    const listResponse = await this.fetchJson<GitHubFile[]>(listUrl);
    const agentFiles = listResponse.filter(
      (f) => f.name.endsWith(".agent.md") && f.download_url
    );

    this.output.appendLine(
      `[dropPod] Found ${agentFiles.length} agent files in ${source.label}`
    );

    // Step 2: Fetch each file's raw content in batches
    const agents: Agent[] = [];

    for (let i = 0; i < agentFiles.length; i += CONCURRENT_LIMIT) {
      const batch = agentFiles.slice(i, i + CONCURRENT_LIMIT);
      const results = await Promise.allSettled(
        batch.map((file) => this.fetchAndParseAgent(file, source))
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          agents.push(result.value);
        }
      }
    }

    this.output.appendLine(
      `[dropPod] Parsed ${agents.length} agents from ${source.label}`
    );

    await this.writeCache(source.id, { agents, fetchedAt: Date.now() });
    return agents;
  }

  private async fetchAndParseAgent(
    file: GitHubFile,
    source: CatalogSource
  ): Promise<Agent | null> {
    try {
      const content = await this.fetchText(file.download_url);
      return parseAgentMd(content, file, source);
    } catch (err) {
      this.output.appendLine(
        `[dropPod] Failed to parse ${file.name}: ${err}`
      );
      return null;
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "dropPod-vscode-extension",
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchText(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "dropPod-vscode-extension" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  private cacheFilePath(sourceId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.storageUri, `cache-${sourceId}.json`);
  }

  private async readCache(sourceId: string): Promise<CacheEntry | null> {
    try {
      const data = await vscode.workspace.fs.readFile(
        this.cacheFilePath(sourceId)
      );
      return JSON.parse(Buffer.from(data).toString("utf-8")) as CacheEntry;
    } catch {
      return null;
    }
  }

  private async writeCache(
    sourceId: string,
    entry: CacheEntry
  ): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(this.storageUri);
      await vscode.workspace.fs.writeFile(
        this.cacheFilePath(sourceId),
        Buffer.from(JSON.stringify(entry, null, 2), "utf-8")
      );
    } catch (err) {
      this.output.appendLine(`[dropPod] Cache write failed: ${err}`);
    }
  }
}

/**
 * Parse an .agent.md file with YAML frontmatter into an Agent object.
 *
 * Expected format:
 * ```
 * ---
 * name: "Agent Name"
 * description: "What this agent does"
 * model: GPT-4.1
 * tools: ['edit/editFiles', 'search', ...]
 * ---
 *
 * # Agent Name
 * ... body instructions ...
 * ```
 */
export function parseAgentMd(
  content: string,
  file: GitHubFile,
  source: CatalogSource
): Agent | null {
  const frontmatter = extractFrontmatter(content);
  if (!frontmatter) {
    return null;
  }

  const name = String(
    frontmatter.name ||
      file.name.replace(/\.agent\.md$/, "").replace(/[-_]/g, " ")
  );

  const description = String(frontmatter.description || "");

  // Derive a category from the filename prefix or use a default
  const category = deriveCategory(file.name);

  return {
    id: `${source.id}::${slugify(file.name.replace(/\.agent\.md$/, ""))}`,
    name,
    description,
    category,
    sourceUrl: file.html_url,
    tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
    model: frontmatter.model ? String(frontmatter.model) : undefined,
    rawContent: content,
  };
}

function extractFrontmatter(
  content: string
): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    // Some files have frontmatter at the end (rare); try that too
    const endMatch = content.match(/\n---\r?\n([\s\S]*?)\r?\n---\s*$/);
    if (!endMatch) {
      return null;
    }
    try {
      return parseYaml(endMatch[1]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Derive a broad category from the agent filename.
 * Groups related agents together for the tree view.
 */
function deriveCategory(filename: string): string {
  const name = filename.replace(/\.agent\.md$/, "").toLowerCase();

  const categories: Record<string, string[]> = {
    "Azure & Cloud": [
      "azure",
      "bicep",
      "terraform",
      "arm-migration",
      "platform-sre",
    ],
    "Testing": [
      "tdd",
      "polyglot-test",
      "playwright",
      "qa-subagent",
      "diffblue",
      "doublecheck",
      "gem-browser-tester",
    ],
    ".NET & C#": [
      "csharp",
      "dotnet",
      "winforms",
      "winui",
      "maui",
      "semantic-kernel-dotnet",
      "microsoft-agent-framework-dotnet",
    ],
    "DevOps & CI/CD": [
      "devops",
      "github-actions",
      "se-gitops",
      "stackhawk",
      "octopus",
      "pagerduty",
      "launchdarkly",
    ],
    "Frontend": [
      "react",
      "nextjs",
      "vuejs",
      "nuxt",
      "electron",
      "expert-react",
      "expert-nextjs",
    ],
    "Development Workflow": [
      "plan",
      "planner",
      "task-",
      "implementation-plan",
      "blueprint",
      "prd",
      "specification",
      "debug",
      "code-tour",
      "refine-issue",
    ],
    "MCP Experts": ["mcp-expert", "-mcp-expert"],
    "Code Quality": [
      "janitor",
      "code-sentinel",
      "code-alchemist",
      "principal",
      "software-engineer",
      "critical-thinking",
      "tech-debt",
    ],
    "Team & Orchestration": [
      "gem-",
      "rug-",
      "swe-subagent",
      "mentor",
      "se-product",
      "se-responsible",
      "se-security",
      "se-system",
      "se-technical",
      "se-ux",
    ],
    "AI & Agents": [
      "beast",
      "gpt-5",
      "prompt",
      "custom-agent",
      "context",
      "thinking",
      "droid",
      "gilfoyle",
      "hlbpa",
      "meta-agentic",
      "voidbeast",
    ],
    "Partners": [
      "comet",
      "jfrog",
      "apify",
      "amplitude",
      "monday",
      "mongodb",
      "neo4j",
      "neon",
      "cast-imaging",
      "dynatrace",
      "elasticsearch",
      "reepl",
      "salesforce",
      "shopify",
      "pimcore",
      "drupal",
      "lingodotdev",
    ],
    "Linux & OS": ["linux", "arch-linux", "centos", "debian", "fedora"],
    "Documentation": [
      "gem-documentation",
      "microsoft_learn",
      "technical-content",
      "adr-generator",
      "scientific-paper",
    ],
    "Security & Accessibility": [
      "accessibility",
      "a11y",
      "security",
      "markdown-accessibility",
      "insiders-a11y",
      "search-ai",
      "agent-governance",
    ],
    "Data & Database": [
      "postgresql",
      "ms-sql",
      "power-bi",
      "kusto",
      "power-platform",
    ],
  };

  for (const [category, patterns] of Object.entries(categories)) {
    if (patterns.some((p) => name.includes(p))) {
      return category;
    }
  }

  return "General";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
