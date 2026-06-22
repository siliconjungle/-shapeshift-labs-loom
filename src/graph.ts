import type { FrontierRunEvent } from '@shapeshift-labs/frontier-run';
import { abs, nowIso, pathExists, readJson, resolveRoot, writeJson } from './common.js';
import { readLoomConfig } from './config.js';
import {
  FRONTIER_RUN_GRAPH_SOURCE,
  normalizeFrontierRunEvents,
  parseFrontierRunEventsInput
} from './graph-frontier-run.js';
import type {
  JsonValue,
  LoomDecisionGraph,
  LoomFrontierRunImportOptions,
  LoomConfig,
  LoomGraph,
  LoomPanelProjectionRecord,
  LoomRunGraph,
  LoomRunGraphChunkKind,
  LoomRunGraphChunkTemplate,
  LoomRunGraphEdge,
  LoomRunGraphImportResult,
  LoomRunGraphOptions,
  LoomRunGraphSourceKind
} from './types.js';

export const LOOM_NATIVE_RUN_GRAPH_SOURCE: LoomRunGraphSourceKind = 'loom-native';
export const LOOM_RUN_GRAPH_CHUNK_TEMPLATE_KIND = 'loom.run-graph.chunk-template';
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
