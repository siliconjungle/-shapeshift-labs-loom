import type {
  JsonValue,
  LoomDecisionGraph,
  LoomDecisionGraphNode,
  LoomDecisionGraphRecord,
  LoomEvidenceKind,
  LoomMergeAdmissionStatus,
  LoomPanelProjectionRecord,
  LoomRunGraphTypedCounts
} from './types.js';

export function createFrontierRunPanelRecords(graph: LoomDecisionGraph): LoomPanelProjectionRecord[] {
  const kinds = ['intent', 'decomposition', 'tournament', 'performance', 'evidence', 'merge', 'rsi'] as const;
  return kinds.map((panelKind) => ({
    kind: 'loom.decision-graph.panel-projection',
    id: `panel:${panelKind}`,
    panelKind,
    label: panelKind,
    sourceNodeIds: panelSourceNodeIds(graph, panelKind),
    sourceEdgeIds: panelSourceEdgeIds(graph, panelKind)
  }));
}

export function normalizeFrontierRunDecisionRecords(nodes: readonly LoomDecisionGraphNode[]): LoomDecisionGraphRecord[] {
  const records: LoomDecisionGraphRecord[] = [];
  for (const node of nodes) {
    if (node.kind === 'candidate') {
      records.push({
        kind: 'loom.decision-graph.merge-candidate',
        id: `record:merge-candidate:${node.id}`,
        nodeId: node.id,
        taskId: node.taskId,
        jobId: node.jobId,
        lane: node.lane,
        label: node.label,
        status: node.status,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        candidateId: node.candidateId ?? node.id,
        sourceNodeId: node.id,
        admissionStatus: frontierRunStringFromData(node.data, 'mergeReadiness') as LoomMergeAdmissionStatus | undefined,
        disposition: node.outcome,
        data: node.data
      });
    } else if (node.kind === 'evidence') {
      records.push({ kind: 'loom.decision-graph.evidence', id: `record:evidence:${node.id}`, nodeId: node.id, taskId: node.taskId, jobId: node.jobId, lane: node.lane, label: node.label, status: node.status, createdAt: node.createdAt, updatedAt: node.updatedAt, evidenceKind: frontierRunStringFromData(node.data, 'evidenceType') as LoomEvidenceKind | undefined, path: node.path, producerNodeId: node.id, data: node.data });
    } else if (node.kind === 'gate') {
      records.push({ kind: 'loom.decision-graph.gate', id: `record:gate:${node.id}`, nodeId: node.id, taskId: node.taskId, jobId: node.jobId, lane: node.lane, label: node.label, status: node.status, createdAt: node.createdAt, updatedAt: node.updatedAt, gateId: node.id, data: node.data });
    }
  }
  return records;
}

export function summarizeFrontierRunTypedCounts(graph: LoomDecisionGraph): LoomRunGraphTypedCounts {
  const out: LoomRunGraphTypedCounts = {};
  for (const node of graph.nodes) {
    if (node.kind === 'intent') out.intents = (out.intents ?? 0) + 1;
    else if (node.kind === 'task') out.tasks = (out.tasks ?? 0) + 1;
    else if (node.kind === 'worker') out.workers = (out.workers ?? 0) + 1;
    else if (node.kind === 'candidate') out.candidates = (out.candidates ?? 0) + 1;
    else if (node.kind === 'evidence') out.evidence = (out.evidence ?? 0) + 1;
    else if (node.kind === 'gate') out.gates = (out.gates ?? 0) + 1;
    else if (node.kind === 'decision') out.decisions = (out.decisions ?? 0) + 1;
  }
  return out;
}

export function toFrontierRunJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => toFrontierRunJsonValue(item));
  if (typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
      out[key] = toFrontierRunJsonValue(item);
    }
    return out;
  }
  return String(value);
}

export function toFrontierRunJsonRecord(value: unknown): Record<string, JsonValue> | undefined {
  const json = toFrontierRunJsonValue(value);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined;
  return Object.keys(json).length > 0 ? json : undefined;
}

export function frontierRunStringFromData(data: Record<string, JsonValue> | undefined, key: string): string | undefined {
  const value = data?.[key];
  return typeof value === 'string' && value ? value : undefined;
}

export function uniqueFrontierRunStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0))).sort();
}

function panelSourceNodeIds(graph: LoomDecisionGraph, panelKind: LoomPanelProjectionRecord['panelKind']): string[] {
  const byPanel: Record<string, string[]> = { intent: ['intent', 'task'], decomposition: ['task', 'worker'], tournament: ['tournament', 'candidate'], performance: ['worker', 'gate', 'evidence'], evidence: ['evidence', 'gate'], merge: ['candidate', 'merge', 'decision', 'semantic-change'], rsi: ['rsi'] };
  const wanted = new Set(byPanel[panelKind] ?? []);
  return graph.nodes.filter((node) => wanted.has(node.kind)).map((node) => node.id);
}

function panelSourceEdgeIds(graph: LoomDecisionGraph, panelKind: LoomPanelProjectionRecord['panelKind']): string[] {
  const nodes = new Set(panelSourceNodeIds(graph, panelKind));
  return graph.edges.filter((edge) => nodes.has(edge.from) || nodes.has(edge.to)).map((edge) => edge.id);
}
