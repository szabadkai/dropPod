import { Agent, Handover, PositionedCard, ConnectorPath } from "./types.js";
import { CARD_WIDTH, CARD_HEIGHT_ESTIMATE, wouldCreateCycle } from "./layout.js";

// ── SVG connector rendering ──────────────────────────────────────────

export function computeConnectors(
  positioned: PositionedCard[],
  handovers: Handover[]
): ConnectorPath[] {
  const posMap = new Map<string, PositionedCard>();
  for (const p of positioned) posMap.set(p.agent.id, p);

  const paths: ConnectorPath[] = [];
  for (const h of handovers) {
    const from = posMap.get(h.fromAgentId);
    const to = posMap.get(h.toAgentId);
    if (!from || !to) continue;

    paths.push({
      fromId: h.fromAgentId,
      toId: h.toAgentId,
      startX: from.x + CARD_WIDTH / 2,
      startY: from.y + CARD_HEIGHT_ESTIMATE,
      endX: to.x + CARD_WIDTH / 2,
      endY: to.y,
      requiresApproval: h.requiresApproval,
    });
  }
  return paths;
}

export function renderSvgOverlay(
  svg: SVGSVGElement,
  connectors: ConnectorPath[],
  width: number,
  height: number
): void {
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.innerHTML = "";

  // Read computed CSS variable values for SVG use
  const rootStyle = getComputedStyle(document.documentElement);
  const borderColor = rootStyle.getPropertyValue("--card-border").trim() || "#585858";
  const accentColor = rootStyle.getPropertyValue("--accent").trim() || "#007acc";

  // Arrowhead marker definition
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = createMarker("arrow", borderColor);
  const markerHover = createMarker("arrow-hover", accentColor);
  defs.appendChild(marker);
  defs.appendChild(markerHover);
  svg.appendChild(defs);

  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "connectors");

  for (const c of connectors) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const d = bezierPath(c.startX, c.startY, c.endX, c.endY);
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", borderColor);
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("marker-end", "url(#arrow)");
    path.setAttribute("data-from", c.fromId);
    path.setAttribute("data-to", c.toId);
    if (c.requiresApproval) {
      path.setAttribute("stroke-dasharray", "4,3");
    }
    path.style.opacity = "0.7";
    path.style.transition = "opacity 0.15s";
    group.appendChild(path);
  }

  svg.appendChild(group);
}

function createMarker(id: string, color: string): SVGMarkerElement {
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", id);
  marker.setAttribute("viewBox", "0 0 6 4");
  marker.setAttribute("refX", "6");
  marker.setAttribute("refY", "2");
  marker.setAttribute("markerWidth", "6");
  marker.setAttribute("markerHeight", "4");
  marker.setAttribute("orient", "auto-start-reverse");
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrow.setAttribute("d", "M0,0 L6,2 L0,4 Z");
  arrow.setAttribute("fill", color);
  marker.appendChild(arrow);
  return marker;
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dy = Math.abs(y2 - y1);
  const offset = dy * 0.5;
  return `M${x1},${y1} C${x1},${y1 + offset} ${x2},${y2 - offset} ${x2},${y2}`;
}

// ── Hover highlighting ───────────────────────────────────────────────

export function setupHoverHighlighting(
  svg: SVGSVGElement,
  cardsContainer: HTMLElement
): void {
  cardsContainer.addEventListener("mouseover", (e) => {
    const card = (e.target as HTMLElement).closest(".card") as HTMLElement | null;
    if (!card) return;
    const agentId = card.dataset.agentId;
    if (!agentId) return;
    highlightConnections(svg, agentId);
  });

  cardsContainer.addEventListener("mouseout", (e) => {
    const card = (e.target as HTMLElement).closest(".card") as HTMLElement | null;
    if (!card) return;
    clearHighlights(svg);
  });
}

function highlightConnections(svg: SVGSVGElement, agentId: string): void {
  const rootStyle = getComputedStyle(document.documentElement);
  const accentColor = rootStyle.getPropertyValue("--accent").trim() || "#007acc";
  const paths = svg.querySelectorAll("path[data-from], path[data-to]");
  paths.forEach((p) => {
    const pathEl = p as SVGPathElement;
    const from = pathEl.getAttribute("data-from");
    const to = pathEl.getAttribute("data-to");
    if (from === agentId || to === agentId) {
      pathEl.style.opacity = "1";
      pathEl.setAttribute("stroke", accentColor);
      pathEl.setAttribute("stroke-width", "2");
      pathEl.setAttribute("marker-end", "url(#arrow-hover)");
    } else {
      pathEl.style.opacity = "0.2";
    }
  });
}

function clearHighlights(svg: SVGSVGElement): void {
  const rootStyle = getComputedStyle(document.documentElement);
  const borderColor = rootStyle.getPropertyValue("--card-border").trim() || "#585858";
  const paths = svg.querySelectorAll("path[data-from], path[data-to]");
  paths.forEach((p) => {
    const pathEl = p as SVGPathElement;
    pathEl.style.opacity = "0.7";
    pathEl.setAttribute("stroke", borderColor);
    pathEl.setAttribute("stroke-width", "1.5");
    pathEl.setAttribute("marker-end", "url(#arrow)");
  });
}

// ── Card rendering ───────────────────────────────────────────────────

interface RenderCardOptions {
  agent: Agent;
  positioned: PositionedCard;
  agents: Agent[];
  handovers: Handover[];
  onSaveHandovers: () => void;
  onRender: () => void;
  onReorder?: (fromId: string, toId: string) => void;
}

export function renderCard(opts: RenderCardOptions): HTMLElement {
  const { agent, positioned, agents, handovers, onSaveHandovers, onRender } = opts;

  const card = document.createElement("div");
  card.className = "card" + (positioned.isDisconnected ? " disconnected" : "");
  card.style.position = "absolute";
  card.style.left = positioned.x + "px";
  card.style.top = positioned.y + "px";
  card.style.width = CARD_WIDTH + "px";
  card.dataset.agentId = agent.id;
  card.setAttribute("role", "group");
  card.setAttribute(
    "aria-label",
    positioned.isDisconnected
      ? `Agent: ${agent.name}, unconnected`
      : `Agent: ${agent.name}, rank ${positioned.rank}`
  );

  // Drag-to-reorder for disconnected agents only
  if (positioned.isDisconnected && opts.onReorder) {
    card.draggable = true;
    card.addEventListener("dragstart", (e) => {
      card.classList.add("dragging");
      e.dataTransfer!.effectAllowed = "move";
      e.dataTransfer!.setData("text/plain", agent.id);
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
    });
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      const fromId = e.dataTransfer!.getData("text/plain");
      if (fromId && fromId !== agent.id) {
        opts.onReorder!(fromId, agent.id);
      }
    });

    // Drag handle
    const dragHandle = document.createElement("div");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "⠿";
    dragHandle.title = "Drag to reorder";
    dragHandle.setAttribute("aria-hidden", "true");
    card.appendChild(dragHandle);
  }

  // Card body
  const body = document.createElement("div");
  body.className = "card-body";

  // Header: name + category badge
  const header = document.createElement("div");
  header.className = "card-header";

  const nameEl = document.createElement("span");
  nameEl.className = "card-name";
  nameEl.textContent = agent.name;
  header.appendChild(nameEl);

  if (agent.category) {
    const badge = document.createElement("span");
    badge.className = "card-badge";
    badge.textContent = agent.category;
    header.appendChild(badge);
  }
  body.appendChild(header);

  // Description
  if (agent.description) {
    const desc = document.createElement("div");
    desc.className = "card-desc";
    desc.textContent = agent.description.slice(0, 80);
    body.appendChild(desc);
  }

  // Handover section
  const section = document.createElement("div");
  section.className = "handover-section";

  const agentHandovers = handovers.filter((h) => h.fromAgentId === agent.id);

  if (agentHandovers.length > 0) {
    const label = document.createElement("div");
    label.className = "handover-label";
    label.textContent = "Connections";
    section.appendChild(label);

    agentHandovers.forEach((h) => {
      section.appendChild(
        createHandoverRow(agent.id, h, agents, handovers, onSaveHandovers, onRender)
      );
    });
  }

  // Add connection button — filter out cycle-creating targets
  const agentIds = new Set(agents.map((a) => a.id));
  const validTargets = agents.filter(
    (a) =>
      a.id !== agent.id &&
      !wouldCreateCycle(agent.id, a.id, handovers, agentIds)
  );

  if (validTargets.length > 0) {
    const addBtn = document.createElement("button");
    addBtn.className = "btn-add-connection";
    addBtn.innerHTML = `<span style="font-size:14px;line-height:1">+</span> Add connection`;
    addBtn.title = "Add a handover connection from this agent";
    addBtn.addEventListener("click", () => {
      handovers.push({
        fromAgentId: agent.id,
        toAgentId: validTargets[0].id,
        prompt: "",
        requiresApproval: false,
      });
      onSaveHandovers();
      onRender();
    });
    section.appendChild(addBtn);
  }

  body.appendChild(section);
  card.appendChild(body);

  return card;
}

function createHandoverRow(
  fromId: string,
  h: Handover,
  agents: Agent[],
  handovers: Handover[],
  onSaveHandovers: () => void,
  onRender: () => void
): HTMLElement {
  const row = document.createElement("div");
  row.className = "handover-row";

  // Arrow
  const arrow = document.createElement("span");
  arrow.className = "flow-arrow";
  arrow.textContent = "→";
  row.appendChild(arrow);

  // Target agent dropdown — filter out cycle-creating targets
  const agentIds = new Set(agents.map((a) => a.id));
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Target agent");
  agents
    .filter(
      (a) =>
        a.id !== fromId &&
        (a.id === h.toAgentId ||
          !wouldCreateCycle(fromId, a.id, handovers, agentIds))
    )
    .forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name;
      if (a.id === h.toAgentId) opt.selected = true;
      select.appendChild(opt);
    });
  select.addEventListener("change", () => {
    h.toAgentId = select.value;
    onSaveHandovers();
    onRender();
  });
  row.appendChild(select);

  // Separator dot
  const dot = document.createElement("span");
  dot.style.cssText =
    "color:var(--muted);font-size:11px;flex-shrink:0;opacity:0.5";
  dot.textContent = "·";
  row.appendChild(dot);

  // Optional context input
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "optional context…";
  input.value = h.prompt || "";
  input.setAttribute("aria-label", "Handover context");
  input.addEventListener("change", () => {
    h.prompt = input.value;
    onSaveHandovers();
  });
  row.appendChild(input);

  // Approval pill toggle
  const pill = document.createElement("button");
  pill.className = "approval-pill" + (h.requiresApproval ? " active" : "");
  pill.title = h.requiresApproval
    ? "Requires human approval — click to set auto"
    : "Auto handover — click to require approval";
  pill.innerHTML = h.requiresApproval ? "🔒&nbsp;Approval" : "🔓&nbsp;Auto";
  pill.addEventListener("click", () => {
    h.requiresApproval = !h.requiresApproval;
    onSaveHandovers();
    onRender();
  });
  row.appendChild(pill);

  // Remove button
  const removeBtn = document.createElement("button");
  removeBtn.className = "btn-remove";
  removeBtn.textContent = "✕";
  removeBtn.title = "Remove connection";
  removeBtn.setAttribute("aria-label", "Remove connection");
  removeBtn.addEventListener("click", () => {
    const idx = handovers.indexOf(h);
    if (idx >= 0) handovers.splice(idx, 1);
    onSaveHandovers();
    onRender();
  });
  row.appendChild(removeBtn);

  return row;
}

// ── Disconnected zone separator ──────────────────────────────────────

export function renderDisconnectedSeparator(
  container: HTMLElement,
  y: number
): void {
  const sep = document.createElement("div");
  sep.className = "disconnected-separator";
  sep.style.position = "absolute";
  sep.style.left = "0";
  sep.style.right = "0";
  sep.style.top = y - 16 + "px";

  const label = document.createElement("span");
  label.className = "disconnected-label";
  label.textContent = "Unconnected agents";
  sep.appendChild(label);

  container.appendChild(sep);
}
