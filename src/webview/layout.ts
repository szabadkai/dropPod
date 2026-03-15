import { Agent, Handover, PositionedCard } from "./types.js";

const CARD_WIDTH = 280;
const CARD_HEIGHT_ESTIMATE = 120;
const H_GAP = 24;
const V_GAP = 48;

/**
 * Pure function: compute DAG layout positions for agents based on handover topology.
 * Returns positioned cards for both connected (ranked) and disconnected agents.
 */
export function computeLayout(
  agents: Agent[],
  handovers: Handover[],
  containerWidth: number
): PositionedCard[] {
  const agentIds = new Set(agents.map((a) => a.id));

  // Determine which agents participate in at least one handover
  const connectedIds = new Set<string>();
  const validHandovers = handovers.filter(
    (h) => agentIds.has(h.fromAgentId) && agentIds.has(h.toAgentId)
  );
  for (const h of validHandovers) {
    connectedIds.add(h.fromAgentId);
    connectedIds.add(h.toAgentId);
  }

  const connected = agents.filter((a) => connectedIds.has(a.id));
  const disconnected = agents.filter((a) => !connectedIds.has(a.id));

  if (connected.length === 0) {
    // All agents disconnected — lay out in a horizontal row
    return layoutDisconnected(agents, containerWidth, 0);
  }

  // Rank assignment: longest path from sources
  const ranks = assignRanks(connected, validHandovers);

  // Group by rank
  const rankGroups = new Map<number, Agent[]>();
  for (const agent of connected) {
    const r = ranks.get(agent.id) ?? 0;
    if (!rankGroups.has(r)) rankGroups.set(r, []);
    rankGroups.get(r)!.push(agent);
  }

  // Barycenter ordering within each rank to minimize edge crossings
  const maxRank = Math.max(...rankGroups.keys());
  const positions = new Map<string, number>(); // agentId → x-index within rank

  // Initialize rank 0 positions
  const rank0 = rankGroups.get(0) ?? [];
  rank0.forEach((a, i) => positions.set(a.id, i));

  // Forward sweep: order each rank by barycenter of parents
  for (let r = 1; r <= maxRank; r++) {
    const nodesInRank = rankGroups.get(r) ?? [];
    const barycenters = new Map<string, number>();

    for (const node of nodesInRank) {
      const parents = validHandovers
        .filter((h) => h.toAgentId === node.id && ranks.get(h.fromAgentId) === r - 1)
        .map((h) => positions.get(h.fromAgentId) ?? 0);

      if (parents.length > 0) {
        barycenters.set(
          node.id,
          parents.reduce((a, b) => a + b, 0) / parents.length
        );
      } else {
        // Use all incoming edges, not just from r-1
        const allParents = validHandovers
          .filter((h) => h.toAgentId === node.id)
          .map((h) => positions.get(h.fromAgentId) ?? 0);
        barycenters.set(
          node.id,
          allParents.length > 0
            ? allParents.reduce((a, b) => a + b, 0) / allParents.length
            : 0
        );
      }
    }

    nodesInRank.sort(
      (a, b) => (barycenters.get(a.id) ?? 0) - (barycenters.get(b.id) ?? 0)
    );
    nodesInRank.forEach((a, i) => positions.set(a.id, i));
    rankGroups.set(r, nodesInRank);
  }

  // Backward sweep for refinement
  for (let r = maxRank - 1; r >= 0; r--) {
    const nodesInRank = rankGroups.get(r) ?? [];
    const barycenters = new Map<string, number>();

    for (const node of nodesInRank) {
      const children = validHandovers
        .filter((h) => h.fromAgentId === node.id)
        .map((h) => positions.get(h.toAgentId) ?? 0);

      if (children.length > 0) {
        barycenters.set(
          node.id,
          children.reduce((a, b) => a + b, 0) / children.length
        );
      } else {
        barycenters.set(node.id, positions.get(node.id) ?? 0);
      }
    }

    nodesInRank.sort(
      (a, b) => (barycenters.get(a.id) ?? 0) - (barycenters.get(b.id) ?? 0)
    );
    nodesInRank.forEach((a, i) => positions.set(a.id, i));
    rankGroups.set(r, nodesInRank);
  }

  // Convert ranks + within-rank positions to pixel coordinates
  const result: PositionedCard[] = [];

  for (let r = 0; r <= maxRank; r++) {
    const nodesInRank = rankGroups.get(r) ?? [];
    const rankWidth = nodesInRank.length * CARD_WIDTH + (nodesInRank.length - 1) * H_GAP;
    const startX = Math.max(0, (containerWidth - rankWidth) / 2);
    const y = r * (CARD_HEIGHT_ESTIMATE + V_GAP);

    nodesInRank.forEach((agent, i) => {
      result.push({
        agent,
        x: startX + i * (CARD_WIDTH + H_GAP),
        y,
        rank: r,
        isDisconnected: false,
      });
    });
  }

  // Disconnected agents below the DAG
  const dagBottom =
    (maxRank + 1) * (CARD_HEIGHT_ESTIMATE + V_GAP) + 32;
  const disconnectedCards = layoutDisconnected(
    disconnected,
    containerWidth,
    dagBottom
  );
  result.push(...disconnectedCards);

  return result;
}

function layoutDisconnected(
  agents: Agent[],
  containerWidth: number,
  startY: number
): PositionedCard[] {
  if (agents.length === 0) return [];
  const cardsPerRow = Math.max(
    1,
    Math.floor((containerWidth + H_GAP) / (CARD_WIDTH + H_GAP))
  );
  return agents.map((agent, i) => {
    const col = i % cardsPerRow;
    const row = Math.floor(i / cardsPerRow);
    const rowCount = Math.min(cardsPerRow, agents.length - row * cardsPerRow);
    const rowWidth = rowCount * CARD_WIDTH + (rowCount - 1) * H_GAP;
    const startX = Math.max(0, (containerWidth - rowWidth) / 2);
    return {
      agent,
      x: startX + col * (CARD_WIDTH + H_GAP),
      y: startY + row * (CARD_HEIGHT_ESTIMATE + V_GAP),
      rank: -1,
      isDisconnected: true,
    };
  });
}

/**
 * Assign ranks using longest-path from sources (in-degree 0).
 */
function assignRanks(
  agents: Agent[],
  handovers: Handover[]
): Map<string, number> {
  const ranks = new Map<string, number>();
  const agentIds = new Set(agents.map((a) => a.id));

  // Compute in-degree
  const inDegree = new Map<string, number>();
  for (const id of agentIds) inDegree.set(id, 0);
  for (const h of handovers) {
    if (agentIds.has(h.toAgentId)) {
      inDegree.set(h.toAgentId, (inDegree.get(h.toAgentId) ?? 0) + 1);
    }
  }

  // Sources: in-degree 0
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      ranks.set(id, 0);
      queue.push(id);
    }
  }

  // BFS: rank(to) = max(rank(to), rank(from) + 1)
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentRank = ranks.get(current) ?? 0;

    for (const h of handovers) {
      if (h.fromAgentId === current && agentIds.has(h.toAgentId)) {
        const newRank = currentRank + 1;
        const existing = ranks.get(h.toAgentId) ?? -1;
        if (newRank > existing) {
          ranks.set(h.toAgentId, newRank);
          queue.push(h.toAgentId);
        }
      }
    }
  }

  // Handle any unranked agents (part of cycles) — assign rank 0
  for (const id of agentIds) {
    if (!ranks.has(id)) ranks.set(id, 0);
  }

  return ranks;
}

/**
 * Check if adding an edge from→to would create a cycle.
 * Returns true if `to` can already reach `from` via existing handovers.
 */
export function wouldCreateCycle(
  fromId: string,
  toId: string,
  handovers: Handover[],
  agentIds: Set<string>
): boolean {
  // DFS from toId — can we reach fromId?
  const visited = new Set<string>();
  const stack = [toId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === fromId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const h of handovers) {
      if (h.fromAgentId === current && agentIds.has(h.toAgentId)) {
        stack.push(h.toAgentId);
      }
    }
  }
  return false;
}

export { CARD_WIDTH, CARD_HEIGHT_ESTIMATE, V_GAP };
