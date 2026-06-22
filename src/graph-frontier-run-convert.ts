import type {
  FrontierRun,
  FrontierRunEdge,
  FrontierRunEvent,
  FrontierRunNode,
  FrontierRunProjection
} from '@shapeshift-labs/frontier-run';
import { nowIso } from './common.js';
import {
  frontierRunStringFromData,
  normalizeFrontierRunDecisionRecords,
  toFrontierRunJsonRecord
} from './graph-frontier-run-records.js';
import type {
  LoomDecisionGraph,
  LoomDecisionGraphEdge,
  LoomDecisionGraphEdgeKind,
  LoomDecisionGraphEvent,
  LoomDecisionGraphIndexes,
  LoomDecisionGraphNode,
  LoomDecisionGraphNodeKind,
  LoomDecisionGraphRecord,
  LoomDecisionGraphRecordStatus,
  LoomDecisionGraphSnapshot,
  LoomRunGraphIssue,
  LoomRunGraphSourceKind,
  LoomRunJobGraph
} from './types.js';

export const FRONTIER_RUN_GRAPH_SOURCE: LoomRunGraphSourceKind = 'frontier-run';

export function normalizeFrontierRunJobGraph(input: FrontierRun['graph']): LoomRunJobGraph {
  const nodeIds = new Set(Object.keys(input.nodes));
  const edges: LoomRunJobGraph['edges'] = [];
  const issues: LoomRunGraphIssue[] = [];
  const seenEdges = new Set<string>();
  for (const edge of Object.values(input.edges)) {
    const from = edge.from;
    const to = edge.to;
    if (!from || !to) {
      issues.push({ code: 'invalid-edge', severity: 'warning', message: `frontier-run edge ${edge.id || '<unknown>'} is missing from/to` });
      continue;
    }
    if (!nodeIds.has(from)) {
      issues.push({ code: 'missing-edge-node', severity: 'warning', message: `frontier-run edge ${edge.id || '<unknown>'} references missing source node ${from}`, path: `/graph/edges/${edge.id || edges.length}/from` });
      nodeIds.add(from);
    }
    if (!nodeIds.has(to)) {
      issues.push({ code: 'missing-edge-node', severity: 'warning', message: `frontier-run edge ${edge.id || '<unknown>'} references missing target node ${to}`, path: `/graph/edges/${edge.id || edges.length}/to` });
      nodeIds.add(to);
    }
    const normalized = { from, to, type: normalizeFrontierRunEdgeKind(edge.type) };
    const key = `${normalized.type}\0${normalized.from}\0${normalized.to}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push(normalized);
  }
  const nodes = Array.from(nodeIds).sort();
  edges.sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to) || left.type.localeCompare(right.type));
  const dependentsByJobId = emptyGraphIndex(nodes);
  const dependenciesByJobId = emptyGraphIndex(nodes);
  for (const edge of edges) {
    dependentsByJobId[edge.from]?.push(edge.to);
    dependenciesByJobId[edge.to]?.push(edge.from);
  }
  sortGraphIndex(dependentsByJobId);
  sortGraphIndex(dependenciesByJobId);
  return {
    nodes,
    edges,
    dependentsByJobId,
    dependenciesByJobId,
    roots: nodes.filter((node) => dependenciesByJobId[node]?.length === 0),
    leaves: nodes.filter((node) => dependentsByJobId[node]?.length === 0),
    issues
  };
}

export function normalizeFrontierRunDecisionGraph(projection: FrontierRunProjection): LoomDecisionGraph {
  const nodes = Object.values(projection.run.graph.nodes).map((node) => normalizeFrontierRunDecisionNode(node)).sort((left, right) => left.id.localeCompare(right.id));
  const edges = Object.values(projection.run.graph.edges).map((edge) => normalizeFrontierRunDecisionEdge(edge)).sort((left, right) => left.id.localeCompare(right.id));
  const events = projection.events.map((event, index) => normalizeFrontierRunDecisionEvent(event, index)).sort((left, right) => left.generatedAt.localeCompare(right.generatedAt) || left.id.localeCompare(right.id));
  const records = normalizeFrontierRunDecisionRecords(nodes);
  return {
    kind: 'loom.decision-graph',
    version: 1,
    generatedAt: projection.run.updatedAt || nowIso(),
    nodes,
    edges,
    events,
    snapshots: [normalizeFrontierRunDecisionSnapshot(projection.run, nodes, edges, events, records)],
    indexes: createDecisionGraphIndexes(nodes, edges),
    records,
    metadata: toFrontierRunJsonRecord({
      sourceKind: FRONTIER_RUN_GRAPH_SOURCE,
      runId: projection.run.id,
      goal: projection.run.goal,
      eventCount: projection.events.length,
      heads: projection.run.heads
    })
  };
}

function normalizeFrontierRunDecisionNode(node: FrontierRunNode): LoomDecisionGraphNode {
  const kind = normalizeFrontierRunNodeKind(node.kind);
  const data = toFrontierRunJsonRecord(node);
  const metadata = toFrontierRunJsonRecord('metadata' in node ? node.metadata : undefined);
  const taskId = node.kind === 'task' ? node.id : frontierRunStringFromData(data, 'taskId') ?? frontierRunStringFromData(metadata, 'taskId');
  const jobId = frontierRunStringFromData(data, 'jobId') ?? frontierRunStringFromData(metadata, 'jobId');
  const lane = node.kind === 'lane' ? node.id : frontierRunStringFromData(data, 'laneId') ?? frontierRunStringFromData(data, 'lane') ?? frontierRunStringFromData(metadata, 'lane');
  const pathValue = frontierRunStringFromData(data, 'path') ?? frontierRunStringFromData(data, 'uri');
  const status = frontierRunStringFromData(data, 'status') as LoomDecisionGraphRecordStatus | undefined;
  const outcome = node.kind === 'decision' ? node.decision : node.kind === 'evidence' ? node.result : node.kind === 'verification' ? node.status : undefined;
  return {
    id: node.id,
    kind,
    ...(kind !== node.kind ? { sourceKind: node.kind } : {}),
    ...(node.title ? { label: node.title } : {}),
    ...(taskId ? { taskId } : {}),
    ...(jobId ? { jobId } : {}),
    ...(lane ? { lane } : {}),
    ...(status ? { status } : {}),
    ...(outcome ? { outcome } : {}),
    ...(pathValue ? { path: pathValue } : {}),
    ...(node.createdAt ? { createdAt: node.createdAt } : {}),
    ...(node.updatedAt ? { updatedAt: node.updatedAt } : {}),
    ...(node.kind === 'attempt' ? { workerId: node.actorId ?? node.runnerId ?? node.id } : {}),
    ...(node.kind === 'patch' ? { candidateId: node.id } : {}),
    ...(data ? { data } : {})
  };
}

function normalizeFrontierRunDecisionEdge(edge: FrontierRunEdge): LoomDecisionGraphEdge {
  const kind = normalizeFrontierRunEdgeKind(edge.type) as LoomDecisionGraphEdgeKind;
  const data = toFrontierRunJsonRecord(edge.metadata);
  return {
    id: edge.id || `${kind}:${edge.from}->${edge.to}`,
    kind,
    from: edge.from,
    to: edge.to,
    ...(kind !== edge.type ? { sourceKind: edge.type } : {}),
    ...(edge.createdAt ? { createdAt: edge.createdAt } : {}),
    ...(data ? { data } : {})
  };
}

function normalizeFrontierRunDecisionEvent(event: FrontierRunEvent, index: number): LoomDecisionGraphEvent {
  const nodes = frontierRunEventNodes(event).map((node) => normalizeFrontierRunDecisionNode(node)).sort((left, right) => left.id.localeCompare(right.id));
  const edges = frontierRunEventEdges(event).map((edge) => normalizeFrontierRunDecisionEdge(edge)).sort((left, right) => left.id.localeCompare(right.id));
  const data = toFrontierRunJsonRecord({ id: event.id, actorId: event.actorId, actorSeq: event.actorSeq, parents: event.parents, previousActorEventId: event.previousActorEventId, payload: event.payload, hash: event.hash });
  return {
    kind: 'loom.decision-graph.event',
    version: 1,
    id: event.id || `frontier-run-event:${index}`,
    type: event.type,
    generatedAt: event.time,
    runId: event.runId,
    ...(nodes.length ? { nodeIds: nodes.map((node) => node.id), nodes } : {}),
    ...(edges.length ? { edgeIds: edges.map((edge) => edge.id), edges } : {}),
    ...(data ? { data } : {})
  };
}

function normalizeFrontierRunDecisionSnapshot(
  run: FrontierRun,
  nodes: readonly LoomDecisionGraphNode[],
  edges: readonly LoomDecisionGraphEdge[],
  events: readonly LoomDecisionGraphEvent[],
  records: readonly LoomDecisionGraphRecord[]
): LoomDecisionGraphSnapshot {
  return {
    kind: 'loom.decision-graph.snapshot',
    version: 1,
    id: `snapshot:${run.id}`,
    generatedAt: run.updatedAt || nowIso(),
    label: 'current',
    nodeIds: nodes.map((node) => node.id),
    edgeIds: edges.map((edge) => edge.id),
    eventIds: events.map((event) => event.id),
    summary: { nodes: nodes.length, edges: edges.length, events: events.length, records: records.length },
    data: toFrontierRunJsonRecord({ sourceKind: FRONTIER_RUN_GRAPH_SOURCE, runId: run.id, goal: run.goal })
  };
}

function createDecisionGraphIndexes(nodes: readonly LoomDecisionGraphNode[], edges: readonly LoomDecisionGraphEdge[]): LoomDecisionGraphIndexes {
  const indexes: Required<LoomDecisionGraphIndexes> = { byNodeKind: {}, byEdgeKind: {}, byTaskId: {}, byJobId: {}, byLane: {} };
  for (const node of nodes) {
    addIndexValue(indexes.byNodeKind, node.kind, node.id);
    if (node.taskId) addIndexValue(indexes.byTaskId, node.taskId, node.id);
    if (node.jobId) addIndexValue(indexes.byJobId, node.jobId, node.id);
    if (node.lane) addIndexValue(indexes.byLane, node.lane, node.id);
  }
  for (const edge of edges) addIndexValue(indexes.byEdgeKind, edge.kind, edge.id);
  sortGraphIndex(indexes.byNodeKind);
  sortGraphIndex(indexes.byEdgeKind);
  sortGraphIndex(indexes.byTaskId);
  sortGraphIndex(indexes.byJobId);
  sortGraphIndex(indexes.byLane);
  return indexes;
}

function addIndexValue(index: Record<string, string[]>, key: string, value: string): void {
  const values = index[key] ?? [];
  if (!values.includes(value)) values.push(value);
  index[key] = values;
}

function normalizeFrontierRunNodeKind(kind: string): LoomDecisionGraphNodeKind {
  if (kind === 'goal') return 'intent';
  if (kind === 'attempt') return 'worker';
  if (kind === 'patch') return 'candidate';
  if (kind === 'artifact') return 'evidence';
  if (kind === 'verification') return 'gate';
  if (kind === 'human-question' || kind === 'lease') return 'decision';
  return kind as LoomDecisionGraphNodeKind;
}

function normalizeFrontierRunEdgeKind(kind: string): string {
  if (kind === 'belongs-to-lane' || kind === 'contains-task' || kind === 'attempts-task') return 'parent-task';
  if (kind === 'produces-artifact' || kind === 'produces-evidence' || kind === 'produces-patch') return 'produces';
  if (kind === 'verified-by') return 'verifies';
  if (kind === 'decided-by') return 'approves';
  return kind;
}

function frontierRunEventNodes(event: FrontierRunEvent): FrontierRunNode[] {
  const payload = event.payload as Record<string, unknown>;
  return ['node', 'artifact', 'decision', 'lease'].map((key) => payload[key]).filter(isFrontierRunNode);
}

function frontierRunEventEdges(event: FrontierRunEvent): FrontierRunEdge[] {
  const payload = event.payload as Record<string, unknown>;
  return isFrontierRunEdge(payload.edge) ? [payload.edge] : [];
}

function isFrontierRunNode(value: unknown): value is FrontierRunNode {
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { id?: unknown }).id === 'string' && typeof (value as { kind?: unknown }).kind === 'string';
}

function isFrontierRunEdge(value: unknown): value is FrontierRunEdge {
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { id?: unknown }).id === 'string' && typeof (value as { from?: unknown }).from === 'string' && typeof (value as { to?: unknown }).to === 'string' && typeof (value as { type?: unknown }).type === 'string';
}

function emptyGraphIndex(nodes: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(nodes.map((node) => [node, []]));
}

function sortGraphIndex(index: Record<string, string[]>): void {
  for (const values of Object.values(index)) values.sort();
}
