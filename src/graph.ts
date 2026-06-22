import path from 'node:path';
import type { FrontierRunEvent } from '@shapeshift-labs/frontier-run';
import { abs, nowIso, pathExists, readJson, resolveRoot, writeJson } from './common.js';
import { readLoomConfig } from './config.js';
import {
  FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENTS_ARTIFACT,
  materializeSwarmCodexLiveRunGraphEvents
} from './graph-live.js';
import {
  FRONTIER_RUN_GRAPH_SOURCE,
  normalizeFrontierRunEvents,
  parseFrontierRunEventsInput
} from './graph-frontier-run.js';
import type {
  JsonValue,
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
  LoomEvidenceKind,
  LoomFrontierRunImportOptions,
  LoomConfig,
  LoomGraph,
  LoomPanelProjectionRecord,
  LoomRunGraph,
  LoomRunGraphChunkKind,
  LoomRunGraphChunkTemplate,
  LoomRunGraphEdge,
  LoomRunGraphImportResult,
  LoomRunGraphIssue,
  LoomRunGraphOptions,
  LoomRunGraphSourceKind,
  LoomRunGraphTypedCounts,
  LoomSwarmCodexLiveRunGraphEvent,
  LoomSwarmCodexRunGraphInput,
  LoomRunJobGraph,
  LoomSwarmCodexRunGraph,
  LoomSwarmCodexRunGraphImportOptions
} from './types.js';

export const LOOM_NATIVE_RUN_GRAPH_SOURCE: LoomRunGraphSourceKind = 'loom-native';
export const FRONTIER_SWARM_CODEX_RUN_GRAPH_SOURCE: LoomRunGraphSourceKind = 'frontier-swarm-codex';
export const LOOM_RUN_GRAPH_CHUNK_TEMPLATE_KIND = 'loom.run-graph.chunk-template';
export {
  FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENTS_ARTIFACT,
  FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENT_KIND,
  materializeSwarmCodexLiveRunGraphEvents,
  parseSwarmCodexRunGraphInput
} from './graph-live.js';
export {
  FRONTIER_RUN_GRAPH_SOURCE,
  normalizeFrontierRunEvents,
  parseFrontierRunEventsInput
} from './graph-frontier-run.js';

export function buildRunGraphChunkTemplate(options: {
  id?: string;
  chunkKind: LoomRunGraphChunkKind;
  nodes: readonly string[];
  edges: readonly LoomRunGraphEdge[];
  entryNodes: readonly string[];
  exitNodes: readonly string[];
  roles?: Record<string, readonly string[]>;
  metadata?: Record<string, JsonValue>;
}): LoomRunGraphChunkTemplate {
  const nodes = uniqueStrings([
    ...options.nodes,
    ...options.edges.flatMap((edge) => [edge.from, edge.to]),
    ...options.entryNodes,
    ...options.exitNodes,
    ...Object.values(options.roles ?? {}).flatMap((values) => [...values])
  ]);
  const edges = uniqueEdges(options.edges);
  return {
    kind: LOOM_RUN_GRAPH_CHUNK_TEMPLATE_KIND,
    version: 1,
    id: options.id ?? stableChunkId(options.chunkKind, nodes, edges),
    chunkKind: options.chunkKind,
    nodes,
    edges,
    entryNodes: uniqueStrings(options.entryNodes),
    exitNodes: uniqueStrings(options.exitNodes),
    roles: normalizeChunkRoles(options.roles ?? {}),
    ...(options.metadata ? { metadata: options.metadata } : {})
  };
}

export function buildRunGraphChainChunk(nodes: readonly string[], options: { id?: string; edgeType?: string } = {}): LoomRunGraphChunkTemplate {
  const list = requiredNodes('chain nodes', nodes);
  return buildRunGraphChunkTemplate({
    id: options.id,
    chunkKind: 'chain',
    nodes: list,
    edges: pairwiseEdges(list, options.edgeType ?? 'depends-on'),
    entryNodes: [list[0] as string],
    exitNodes: [list[list.length - 1] as string],
    roles: { chain: list }
  });
}

export function buildRunGraphForkChunk(source: string, branches: readonly string[], options: { id?: string; edgeType?: string } = {}): LoomRunGraphChunkTemplate {
  const targets = requiredNodes('fork branches', branches);
  return buildRunGraphChunkTemplate({
    id: options.id,
    chunkKind: 'fork',
    nodes: [source, ...targets],
    edges: targets.map((target) => ({ from: source, to: target, type: options.edgeType ?? 'depends-on' })),
    entryNodes: [source],
    exitNodes: targets,
    roles: { source: [source], branches: targets }
  });
}

export function buildRunGraphJoinChunk(branches: readonly string[], target: string, options: { id?: string; edgeType?: string } = {}): LoomRunGraphChunkTemplate {
  const inputs = requiredNodes('join branches', branches);
  return buildRunGraphChunkTemplate({
    id: options.id,
    chunkKind: 'join',
    nodes: [...inputs, target],
    edges: inputs.map((input) => ({ from: input, to: target, type: options.edgeType ?? 'depends-on' })),
    entryNodes: inputs,
    exitNodes: [target],
    roles: { branches: inputs, target: [target] }
  });
}

export function buildRunGraphPatternChunk(
  chunkKind: Exclude<LoomRunGraphChunkKind, 'chain' | 'fork' | 'join'>,
  nodes: readonly string[],
  options: { id?: string; edgeType?: string; metadata?: Record<string, JsonValue> } = {}
): LoomRunGraphChunkTemplate {
  const list = requiredNodes(`${chunkKind} nodes`, nodes);
  return buildRunGraphChunkTemplate({
    id: options.id,
    chunkKind,
    nodes: list,
    edges: pairwiseEdges(list, options.edgeType ?? 'depends-on'),
    entryNodes: [list[0] as string],
    exitNodes: [list[list.length - 1] as string],
    roles: { [chunkKind]: list },
    metadata: options.metadata
  });
}

export async function readLoomGraph(options: { root?: string } = {}): Promise<LoomGraph> {
  const root = resolveRoot(options.root);
  const config = await readLoomConfig(root);
  const file = abs(root, `${config.generated.graph}/current.json`);
  if (!(await pathExists(file))) throw new Error('missing .loom graph; run loom scan first');
  return readJson<LoomGraph>(file);
}

export async function readLoomRunGraph(options: LoomRunGraphOptions = {}): Promise<LoomRunGraph> {
  const root = resolveRoot(options.root);
  const config = await readLoomConfig(root);
  const file = loomRunGraphFile(root, config, options.runId);
  if (!(await pathExists(file))) throw new Error('missing .loom run graph; write one with writeLoomRunGraph first');
  const graph = await readJson<LoomRunGraph>(file);
  assertLoomRunGraph(graph, file);
  return graph;
}

export async function writeLoomRunGraph(graph: LoomRunGraph, options: LoomRunGraphOptions = {}): Promise<string> {
  const root = resolveRoot(options.root);
  const config = await readLoomConfig(root);
  assertLoomRunGraph(graph);
  const file = loomRunGraphFile(root, config, options.runId ?? graph.runId);
  await writeJson(file, graph);
  return file;
}

export function normalizeSwarmCodexRunGraph(
  input: LoomSwarmCodexRunGraph,
  options: LoomSwarmCodexRunGraphImportOptions = {}
): LoomRunGraph {
  assertSwarmCodexRunGraph(input);
  return normalizeSwarmCodexRunGraphArtifact(input, options);
}

export function normalizeSwarmCodexLiveRunGraphEvents(
  input: readonly LoomSwarmCodexLiveRunGraphEvent[],
  options: LoomSwarmCodexRunGraphImportOptions = {}
): LoomRunGraph {
  const artifact = materializeSwarmCodexLiveRunGraphEvents(input, options);
  const eventTypes = Array.from(new Set(input.map((event) => event.type).filter(Boolean)));
  return normalizeSwarmCodexRunGraphArtifact(artifact, options, {
    artifactKind: FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENTS_ARTIFACT,
    eventCount: input.length,
    eventTypes
  }, {
    swarmCodexLive: toJsonValue({
      eventCount: input.length,
      eventTypes,
      firstGeneratedAt: input[0]?.generatedAt,
      lastGeneratedAt: input.at(-1)?.generatedAt
    })
  }, input);
}

function normalizeSwarmCodexRunGraphArtifact(
  input: LoomSwarmCodexRunGraph,
  options: LoomSwarmCodexRunGraphImportOptions = {},
  sourceMetadata: Partial<NonNullable<LoomRunGraph['sourceMetadata']>> = {},
  extraMetadata: Record<string, JsonValue> = {},
  liveEvents: readonly LoomSwarmCodexLiveRunGraphEvent[] = []
): LoomRunGraph {
  const root = resolveRoot(options.root);
  const runId = options.runId ?? swarmRunGraphRunId(input);
  const graph = normalizeSwarmCodexJobGraph(input);
  const decisionGraph = normalizeSwarmCodexDecisionGraph(input, liveEvents);
  const typedCounts = summarizeTypedCounts(decisionGraph);
  const panels = createLoomRunGraphPanelRecords(decisionGraph);
  return {
    kind: 'loom.run-graph',
    version: 1,
    generatedAt: timestampToIso(input.generatedAt),
    root,
    runId,
    source: FRONTIER_SWARM_CODEX_RUN_GRAPH_SOURCE,
    sourceKind: FRONTIER_SWARM_CODEX_RUN_GRAPH_SOURCE,
    sourceMetadata: {
      kind: FRONTIER_SWARM_CODEX_RUN_GRAPH_SOURCE,
      artifactKind: input.kind,
      artifactId: input.id,
      ...(options.sourcePath ? { path: options.sourcePath } : {}),
      runDir: input.runDir,
      outDir: input.outDir,
      importedAt: nowIso(),
      ...sourceMetadata
    },
    summary: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      roots: graph.roots.length,
      leaves: graph.leaves.length,
      issues: graph.issues.length,
      ...(Object.keys(typedCounts).length ? { typedCounts } : {})
    },
    graph,
    decisionGraph,
    ...(panels.length ? { projections: { panels } } : {}),
    metadata: {
      swarmCodex: toJsonValue({
        id: input.id,
        summary: input.summary,
        indexes: input.indexes,
        nodes: input.nodes,
        edges: input.edges
      }),
      ...extraMetadata
    }
  };
}

export async function importSwarmCodexRunGraph(
  input: LoomSwarmCodexRunGraphInput,
  options: LoomSwarmCodexRunGraphImportOptions = {}
): Promise<LoomRunGraphImportResult> {
  const graph = Array.isArray(input)
    ? normalizeSwarmCodexLiveRunGraphEvents(input, options)
    : normalizeSwarmCodexRunGraph(input as LoomSwarmCodexRunGraph, options);
  const runId = options.runId ?? graph.runId ?? 'current';
  const file = await writeLoomRunGraph(graph, { root: options.root, runId });
  const artifactKind = graph.sourceMetadata?.artifactKind === FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENTS_ARTIFACT
    ? 'live run graph events'
    : 'run graph';
  return {
    ok: true,
    message: `imported frontier-swarm-codex ${artifactKind} ${runId}`,
    path: file,
    runId,
    present: true,
    source: FRONTIER_SWARM_CODEX_RUN_GRAPH_SOURCE,
    sourceKind: FRONTIER_SWARM_CODEX_RUN_GRAPH_SOURCE,
    sourceMetadata: graph.sourceMetadata,
    graphSummary: graph.summary
  };
}

export async function importFrontierRunEvents(
  input: readonly FrontierRunEvent[] | string,
  options: LoomFrontierRunImportOptions = {}
): Promise<LoomRunGraphImportResult> {
  const events = typeof input === 'string' ? parseFrontierRunEventsInput(input) : input;
  const graph = normalizeFrontierRunEvents(events, options);
  const runId = options.runId ?? graph.runId ?? 'current';
  const file = await writeLoomRunGraph(graph, { root: options.root, runId });
  return {
    ok: true,
    message: `imported frontier-run events ${runId}`,
    path: file,
    runId,
    present: true,
    source: FRONTIER_RUN_GRAPH_SOURCE,
    sourceKind: FRONTIER_RUN_GRAPH_SOURCE,
    sourceMetadata: graph.sourceMetadata,
    graphSummary: graph.summary
  };
}

export function loomRunGraphSourceKind(graph: LoomRunGraph): LoomRunGraphSourceKind {
  return graph.sourceKind ?? graph.sourceMetadata?.kind ?? graph.source ?? LOOM_NATIVE_RUN_GRAPH_SOURCE;
}

function loomRunGraphFile(root: string, config: LoomConfig, runId?: string): string {
  return abs(root, `${config.generated.graph}/runs/${loomRunGraphFileName(runId)}.json`);
}

function loomRunGraphFileName(runId = 'current'): string {
  const cleaned = runId.trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'current';
}

function assertLoomRunGraph(value: LoomRunGraph, file = 'run graph'): void {
  if (!value || typeof value !== 'object') throw new Error(`invalid ${file}: expected object`);
  if (value.kind !== 'loom.run-graph') throw new Error(`invalid ${file}: expected kind "loom.run-graph"`);
  if (value.version !== 1) throw new Error(`invalid ${file}: expected version 1`);
  if (value.decisionGraph !== undefined) assertLoomDecisionGraph(value.decisionGraph, file);
}

function normalizeSwarmCodexJobGraph(input: LoomSwarmCodexRunGraph): LoomRunJobGraph {
  const nodeIds = new Set<string>();
  const edges: LoomRunGraphEdge[] = [];
  const issues: LoomRunGraphIssue[] = [];
  const seenEdges = new Set<string>();

  for (const node of input.nodes) {
    if (typeof node.id === 'string' && node.id) nodeIds.add(node.id);
  }

  for (const edge of input.edges) {
    const from = typeof edge.from === 'string' ? edge.from : '';
    const to = typeof edge.to === 'string' ? edge.to : '';
    if (!from || !to) {
      issues.push({
        code: 'invalid-edge',
        severity: 'warning',
        message: `swarm edge ${edge.id || '<unknown>'} is missing from/to`
      });
      continue;
    }
    if (!nodeIds.has(from)) {
      issues.push({
        code: 'missing-edge-node',
        severity: 'warning',
        message: `swarm edge ${edge.id || '<unknown>'} references missing source node ${from}`,
        path: `/edges/${edge.id || edges.length}/from`
      });
      nodeIds.add(from);
    }
    if (!nodeIds.has(to)) {
      issues.push({
        code: 'missing-edge-node',
        severity: 'warning',
        message: `swarm edge ${edge.id || '<unknown>'} references missing target node ${to}`,
        path: `/edges/${edge.id || edges.length}/to`
      });
      nodeIds.add(to);
    }
    const normalized = { from, to, type: normalizeSwarmCodexEdgeKind(edge.kind) };
    const key = `${normalized.type}\0${normalized.from}\0${normalized.to}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push(normalized);
  }

  const nodes = Array.from(nodeIds).sort();
  edges.sort((left, right) =>
    left.from.localeCompare(right.from) ||
    left.to.localeCompare(right.to) ||
    left.type.localeCompare(right.type)
  );

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

function normalizeSwarmCodexEdgeKind(kind: string): string {
  return kind === 'dependsOn' ? 'depends-on' : kind;
}

function normalizeSwarmCodexDecisionGraph(
  input: LoomSwarmCodexRunGraph,
  liveEvents: readonly LoomSwarmCodexLiveRunGraphEvent[] = []
): LoomDecisionGraph {
  const nodes = input.nodes
    .filter((node) => node && typeof node.id === 'string' && node.id)
    .map((node) => normalizeSwarmCodexDecisionNode(node))
    .sort((left, right) => left.id.localeCompare(right.id));
  const edges = input.edges
    .filter((edge) => edge && typeof edge.from === 'string' && typeof edge.to === 'string' && edge.from && edge.to)
    .map((edge) => normalizeSwarmCodexDecisionEdge(edge))
    .sort((left, right) => left.id.localeCompare(right.id));
  const events = liveEvents
    .map((event, index) => normalizeSwarmCodexDecisionEvent(event, index))
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt) || left.id.localeCompare(right.id));
  const records = normalizeSwarmCodexDecisionRecords(nodes);
  const snapshots = [
    normalizeSwarmCodexDecisionSnapshot(input, nodes, edges, events, records)
  ];

  return {
    kind: 'loom.decision-graph',
    version: 1,
    generatedAt: timestampToIso(input.generatedAt),
    nodes,
    edges,
    events,
    snapshots,
    indexes: createDecisionGraphIndexes(nodes, edges),
    records,
    metadata: toJsonRecord({
      sourceKind: input.kind,
      sourceId: input.id,
      runDir: input.runDir,
      outDir: input.outDir,
      summary: input.summary
    })
  };
}

function normalizeSwarmCodexDecisionNode(node: LoomSwarmCodexRunGraph['nodes'][number]): LoomDecisionGraphNode {
  const kind = normalizeSwarmCodexDecisionNodeKind(node.kind);
  const timestamp = typeof node.generatedAt === 'number' ? timestampToIso(node.generatedAt) : undefined;
  const data = toJsonRecord(node.data);
  const refs = stringRecord(node.refs);
  return {
    id: node.id,
    kind,
    ...(kind !== node.kind ? { sourceKind: node.kind } : {}),
    ...(node.label ? { label: node.label } : {}),
    ...(node.taskId ? { taskId: node.taskId } : {}),
    ...(node.jobId ? { jobId: node.jobId } : {}),
    ...(node.lane ? { lane: node.lane } : {}),
    ...(node.model ? { model: node.model } : {}),
    ...(node.computeId ? { computeId: node.computeId } : {}),
    ...(node.modelTier ? { modelTier: node.modelTier } : {}),
    ...(node.bucket ? { bucket: node.bucket } : {}),
    ...(node.status ? { status: node.status as LoomDecisionGraphRecordStatus } : {}),
    ...(node.outcome ? { outcome: node.outcome } : {}),
    ...(node.path ? { path: node.path } : {}),
    ...(kind === 'worker' ? { workerId: node.jobId ?? node.id } : {}),
    ...(kind === 'candidate' ? { candidateId: node.jobId ?? node.id } : {}),
    ...(timestamp ? { createdAt: timestamp, updatedAt: timestamp } : {}),
    ...(refs ? { refs } : {}),
    ...(data ? { data } : {})
  };
}

function normalizeSwarmCodexDecisionNodeKind(kind: string): LoomDecisionGraphNodeKind {
  if (kind === 'run') return 'intent';
  if (kind === 'job') return 'worker';
  if (kind === 'panel-projection') return 'panel';
  if (kind === 'improvement-loop') return 'rsi';
  return kind as LoomDecisionGraphNodeKind;
}

function normalizeSwarmCodexDecisionEdge(edge: LoomSwarmCodexRunGraph['edges'][number]): LoomDecisionGraphEdge {
  const kind = normalizeSwarmCodexEdgeKind(edge.kind) as LoomDecisionGraphEdgeKind;
  const data = toJsonRecord(edge.data);
  return {
    id: edge.id || `${kind}:${edge.from}->${edge.to}`,
    kind,
    from: edge.from,
    to: edge.to,
    ...(kind !== edge.kind ? { sourceKind: edge.kind } : {}),
    ...(edge.label ? { label: edge.label } : {}),
    ...(data ? { data } : {})
  };
}

function normalizeSwarmCodexDecisionEvent(
  event: LoomSwarmCodexLiveRunGraphEvent,
  index: number
): LoomDecisionGraphEvent {
  const nodes = (event.nodes ?? [])
    .filter((node) => node && typeof node.id === 'string' && node.id)
    .map((node) => normalizeSwarmCodexDecisionNode(node))
    .sort((left, right) => left.id.localeCompare(right.id));
  const edges = (event.edges ?? [])
    .filter((edge) => edge && typeof edge.from === 'string' && typeof edge.to === 'string' && edge.from && edge.to)
    .map((edge) => normalizeSwarmCodexDecisionEdge(edge))
    .sort((left, right) => left.id.localeCompare(right.id));
  const data = toJsonRecord(event.data);
  return {
    kind: 'loom.decision-graph.event',
    version: 1,
    id: decisionGraphEventId(event, index),
    type: event.type,
    generatedAt: timestampToIso(event.generatedAt),
    ...(event.runId ? { runId: event.runId } : {}),
    ...(event.taskId ? { taskId: event.taskId } : {}),
    ...(event.jobId ? { jobId: event.jobId } : {}),
    ...(event.lane ? { lane: event.lane } : {}),
    ...(nodes.length ? { nodeIds: nodes.map((node) => node.id), nodes } : {}),
    ...(edges.length ? { edgeIds: edges.map((edge) => edge.id), edges } : {}),
    ...(data ? { data } : {})
  };
}

function decisionGraphEventId(event: LoomSwarmCodexLiveRunGraphEvent, index: number): string {
  const scope = event.jobId ?? event.taskId ?? event.runId ?? 'event';
  return `${scope}:${event.type}:${index}`;
}

function normalizeSwarmCodexDecisionSnapshot(
  input: LoomSwarmCodexRunGraph,
  nodes: readonly LoomDecisionGraphNode[],
  edges: readonly LoomDecisionGraphEdge[],
  events: readonly LoomDecisionGraphEvent[],
  records: readonly LoomDecisionGraphRecord[]
): LoomDecisionGraphSnapshot {
  return {
    kind: 'loom.decision-graph.snapshot',
    version: 1,
    id: `snapshot:${input.id}`,
    generatedAt: timestampToIso(input.generatedAt),
    label: 'current',
    nodeIds: nodes.map((node) => node.id),
    edgeIds: edges.map((edge) => edge.id),
    eventIds: events.map((event) => event.id),
    summary: {
      nodes: nodes.length,
      edges: edges.length,
      events: events.length,
      records: records.length
    },
    data: toJsonRecord({
      sourceKind: input.kind,
      sourceId: input.id,
      runDir: input.runDir,
      outDir: input.outDir
    })
  };
}

function normalizeSwarmCodexDecisionRecords(
  nodes: readonly LoomDecisionGraphNode[]
): LoomDecisionGraphRecord[] {
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
        admissionStatus: admissionStatusFromNode(node),
        admissionReasonCodes: admissionReasonsFromNode(node),
        disposition: node.outcome,
        data: node.data
      });
    } else if (node.kind === 'evidence') {
      records.push({
        kind: 'loom.decision-graph.evidence',
        id: `record:evidence:${node.id}`,
        nodeId: node.id,
        taskId: node.taskId,
        jobId: node.jobId,
        lane: node.lane,
        label: node.label,
        status: node.status,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        evidenceKind: evidenceKindFromNode(node),
        path: node.path,
        producerNodeId: node.id,
        data: node.data
      });
    } else if (node.kind === 'gate') {
      records.push({
        kind: 'loom.decision-graph.gate',
        id: `record:gate:${node.id}`,
        nodeId: node.id,
        taskId: node.taskId,
        jobId: node.jobId,
        lane: node.lane,
        label: node.label,
        status: node.status,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        gateId: node.id,
        data: node.data
      });
    } else if (node.kind === 'replay') {
      records.push({
        kind: 'loom.decision-graph.replay',
        id: `record:replay:${node.id}`,
        nodeId: node.id,
        taskId: node.taskId,
        jobId: node.jobId,
        lane: node.lane,
        label: node.label,
        status: node.status,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        result: node.outcome,
        data: node.data
      });
    } else if (node.kind === 'rsi') {
      records.push({
        kind: 'loom.decision-graph.improvement-loop',
        id: `record:improvement-loop:${node.id}`,
        nodeId: node.id,
        taskId: node.taskId,
        jobId: node.jobId,
        lane: node.lane,
        label: node.label,
        status: node.status,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        loopId: node.id,
        data: node.data
      });
    } else if (node.kind === 'semantic-change') {
      records.push({
        kind: 'loom.decision-graph.semantic-change',
        id: `record:semantic-change:${node.id}`,
        nodeId: node.id,
        taskId: node.taskId,
        jobId: node.jobId,
        lane: node.lane,
        label: node.label,
        status: node.status,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        changeId: node.id,
        conflictReason: stringFromData(node.data, 'conflictReason'),
        data: node.data
      });
    } else if (node.kind === 'tournament') {
      records.push({
        kind: 'loom.decision-graph.tournament',
        id: `record:tournament:${node.id}`,
        nodeId: node.id,
        taskId: node.taskId,
        jobId: node.jobId,
        lane: node.lane,
        label: node.label,
        status: node.status,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        candidateIds: stringArrayFromData(node.data, 'candidateIds'),
        winnerCandidateId: stringFromData(node.data, 'winnerCandidateId'),
        data: node.data
      });
    }
  }
  return records;
}

export function createLoomRunGraphPanelRecords(
  graph: LoomDecisionGraph
): LoomPanelProjectionRecord[] {
  const kinds = ['intent', 'decomposition', 'tournament', 'performance', 'evidence', 'merge', 'rsi'] as const;
  return kinds.map((panelKind) => ({
    kind: 'loom.decision-graph.panel-projection' as const,
    id: `panel:${panelKind}`,
    panelKind,
    label: panelKind,
    sourceNodeIds: panelSourceNodeIds(graph, panelKind),
    sourceEdgeIds: panelSourceEdgeIds(graph, panelKind)
  }));
}

function panelSourceNodeIds(graph: LoomDecisionGraph, panelKind: LoomPanelProjectionRecord['panelKind']): string[] {
  const nodeKindsByPanel: Record<string, string[]> = {
    intent: ['intent', 'task'],
    decomposition: ['task', 'worker'],
    tournament: ['tournament', 'candidate'],
    performance: ['worker', 'gate', 'evidence'],
    evidence: ['evidence', 'gate'],
    merge: ['candidate', 'merge', 'decision', 'semantic-change'],
    rsi: ['rsi']
  };
  const wanted = new Set(nodeKindsByPanel[panelKind] ?? []);
  return graph.nodes.filter((node) => wanted.has(node.kind)).map((node) => node.id);
}

function panelSourceEdgeIds(graph: LoomDecisionGraph, panelKind: LoomPanelProjectionRecord['panelKind']): string[] {
  const nodes = new Set(panelSourceNodeIds(graph, panelKind));
  return graph.edges.filter((edge) => nodes.has(edge.from) || nodes.has(edge.to)).map((edge) => edge.id);
}

function summarizeTypedCounts(graph: LoomDecisionGraph): LoomRunGraphTypedCounts {
  const out: LoomRunGraphTypedCounts = {};
  for (const node of graph.nodes) {
    if (node.kind === 'intent') out.intents = (out.intents ?? 0) + 1;
    else if (node.kind === 'task') out.tasks = (out.tasks ?? 0) + 1;
    else if (node.kind === 'worker') out.workers = (out.workers ?? 0) + 1;
    else if (node.kind === 'candidate') out.candidates = (out.candidates ?? 0) + 1;
    else if (node.kind === 'evidence') out.evidence = (out.evidence ?? 0) + 1;
    else if (node.kind === 'gate') out.gates = (out.gates ?? 0) + 1;
    else if (node.kind === 'decision') out.decisions = (out.decisions ?? 0) + 1;
    else if (node.kind === 'merge') out.merges = (out.merges ?? 0) + 1;
    else if (node.kind === 'replay') out.replay = (out.replay ?? 0) + 1;
    else if (node.kind === 'panel') out.panels = (out.panels ?? 0) + 1;
    else if (node.kind === 'tournament') out.tournaments = (out.tournaments ?? 0) + 1;
    else if (node.kind === 'rsi') out.rsiLoops = (out.rsiLoops ?? 0) + 1;
    else if (node.kind === 'semantic-change') out.semanticChanges = (out.semanticChanges ?? 0) + 1;
  }
  for (const record of graph.records ?? []) {
    if (record.kind === 'loom.decision-graph.panel-projection') out.panels = Math.max(out.panels ?? 0, 1);
  }
  return out;
}

function createDecisionGraphIndexes(
  nodes: readonly LoomDecisionGraphNode[],
  edges: readonly LoomDecisionGraphEdge[]
): LoomDecisionGraphIndexes {
  const indexes: Required<LoomDecisionGraphIndexes> = {
    byNodeKind: {},
    byEdgeKind: {},
    byTaskId: {},
    byJobId: {},
    byLane: {}
  };
  for (const node of nodes) {
    addIndexValue(indexes.byNodeKind, node.kind, node.id);
    if (node.taskId) addIndexValue(indexes.byTaskId, node.taskId, node.id);
    if (node.jobId) addIndexValue(indexes.byJobId, node.jobId, node.id);
    if (node.lane) addIndexValue(indexes.byLane, node.lane, node.id);
  }
  for (const edge of edges) {
    addIndexValue(indexes.byEdgeKind, edge.kind, edge.id);
  }
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

function assertLoomDecisionGraph(value: LoomDecisionGraph, file: string): void {
  if (!value || typeof value !== 'object') throw new Error(`invalid ${file}: expected decisionGraph object`);
  if (value.kind !== 'loom.decision-graph') {
    throw new Error(`invalid ${file}: expected decisionGraph kind "loom.decision-graph"`);
  }
  if (value.version !== 1) throw new Error(`invalid ${file}: expected decisionGraph version 1`);
  if (!Array.isArray(value.nodes)) throw new Error(`invalid ${file}: expected decisionGraph nodes array`);
  if (!Array.isArray(value.edges)) throw new Error(`invalid ${file}: expected decisionGraph edges array`);
  if (!Array.isArray(value.events)) throw new Error(`invalid ${file}: expected decisionGraph events array`);
  if (!Array.isArray(value.snapshots)) throw new Error(`invalid ${file}: expected decisionGraph snapshots array`);
}

function emptyGraphIndex(nodes: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const node of nodes) out[node] = [];
  return out;
}

function sortGraphIndex(index: Record<string, string[]>): void {
  for (const values of Object.values(index)) {
    values.sort();
  }
}

function swarmRunGraphRunId(input: LoomSwarmCodexRunGraph): string {
  const basename = path.basename(input.runDir || '');
  if (basename && basename !== path.sep) return basename;
  const idPart = input.id.split(':').filter(Boolean).at(-1);
  return idPart || 'current';
}

function timestampToIso(value: number): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : nowIso();
}

function assertSwarmCodexRunGraph(value: LoomSwarmCodexRunGraph): void {
  if (!value || typeof value !== 'object') throw new Error('invalid swarm run graph: expected object');
  if (value.kind !== 'frontier.swarm-codex.run-graph') {
    throw new Error('invalid swarm run graph: expected kind "frontier.swarm-codex.run-graph"');
  }
  if (value.version !== 1) throw new Error('invalid swarm run graph: expected version 1');
  if (!Array.isArray(value.nodes)) throw new Error('invalid swarm run graph: expected nodes array');
  if (!Array.isArray(value.edges)) throw new Error('invalid swarm run graph: expected edges array');
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));
  if (typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
      out[key] = toJsonValue(item);
    }
    return out;
  }
  return String(value);
}

function toJsonRecord(value: unknown): Record<string, JsonValue> | undefined {
  const json = toJsonValue(value);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined;
  return Object.keys(json).length > 0 ? json : undefined;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') out[key] = item;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0))).sort();
}

function uniqueEdges(edges: readonly LoomRunGraphEdge[]): LoomRunGraphEdge[] {
  const seen = new Set<string>();
  const out: LoomRunGraphEdge[] = [];
  for (const edge of edges) {
    if (!edge.from || !edge.to || !edge.type) continue;
    const key = `${edge.type}\0${edge.from}\0${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from: edge.from, to: edge.to, type: edge.type });
  }
  return out.sort((left, right) =>
    left.from.localeCompare(right.from) ||
    left.to.localeCompare(right.to) ||
    left.type.localeCompare(right.type)
  );
}

function requiredNodes(label: string, nodes: readonly string[]): string[] {
  const out = uniqueStrings(nodes);
  if (out.length === 0) throw new Error(`invalid run graph chunk: ${label} must not be empty`);
  return out;
}

function pairwiseEdges(nodes: readonly string[], type: string): LoomRunGraphEdge[] {
  const edges: LoomRunGraphEdge[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push({ from: nodes[index] as string, to: nodes[index + 1] as string, type });
  }
  return edges;
}

function normalizeChunkRoles(roles: Record<string, readonly string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(roles)) {
    const normalized = uniqueStrings(values);
    if (normalized.length > 0) out[key] = normalized;
  }
  return out;
}

function stableChunkId(kind: string, nodes: readonly string[], edges: readonly LoomRunGraphEdge[]): string {
  const edgePart = edges.map((edge) => `${edge.type}:${edge.from}->${edge.to}`).join('|');
  return `chunk:${kind}:${[...nodes].join(',')}:${edgePart}`;
}

function admissionStatusFromNode(node: LoomDecisionGraphNode): 'safe' | 'safe-with-losses' | 'review-required' | 'blocked' | undefined {
  const value = stringFromData(node.data, 'admissionStatus') ?? stringFromData(node.data, 'mergeReadiness');
  if (value === 'safe' || value === 'safe-with-losses' || value === 'review-required' || value === 'blocked') {
    return value;
  }
  return undefined;
}

function admissionReasonsFromNode(node: LoomDecisionGraphNode):
  | Array<'missing-sidecar' | 'empty-sidecar' | 'stale-source-hash' | 'symbol-conflict' | 'effect-conflict' | 'lossy-import' | 'tests-missing'>
  | undefined {
  const values = stringArrayFromData(node.data, 'admissionReasonCodes') ?? stringArrayFromData(node.data, 'reasonCodes');
  const allowed = new Set([
    'missing-sidecar',
    'empty-sidecar',
    'stale-source-hash',
    'symbol-conflict',
    'effect-conflict',
    'lossy-import',
    'tests-missing'
  ]);
  const out = (values ?? []).filter((value) => allowed.has(value)) as Array<
    'missing-sidecar' | 'empty-sidecar' | 'stale-source-hash' | 'symbol-conflict' | 'effect-conflict' | 'lossy-import' | 'tests-missing'
  >;
  return out.length ? out : undefined;
}

function evidenceKindFromNode(node: LoomDecisionGraphNode): LoomEvidenceKind | undefined {
  return stringFromData(node.data, 'evidenceKind') as LoomEvidenceKind | undefined;
}

function stringFromData(data: Record<string, JsonValue> | undefined, key: string): string | undefined {
  const value = data?.[key];
  return typeof value === 'string' && value ? value : undefined;
}

function stringArrayFromData(data: Record<string, JsonValue> | undefined, key: string): string[] | undefined {
  const value = data?.[key];
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return out.length ? out : undefined;
}
