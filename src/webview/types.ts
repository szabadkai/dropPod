export interface VSCodeAPI {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface Handover {
  fromAgentId: string;
  toAgentId: string;
  prompt?: string;
  requiresApproval: boolean;
}

export interface PositionedCard {
  agent: Agent;
  x: number;
  y: number;
  rank: number;
  isDisconnected: boolean;
}

export interface ConnectorPath {
  fromId: string;
  toId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  requiresApproval: boolean;
}
