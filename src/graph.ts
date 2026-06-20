import path from 'node:path';
import { abs, nowIso, pathExists, readJson, resolveRoot, writeJson } from './common.js';
import { readLoomConfig } from './config.js';
import type {
  JsonValue,
  LoomConfig,
  LoomGraph,
  LoomRunGraph,
  LoomRunGraphEdge,
  LoomRunGraphImportResult,
  LoomRunGraphIssue,
  LoomRunGraphOptions,
  LoomRunGraphSourceKind,
  LoomRunJobGraph,
  LoomSwarmCodexRunGraph,
  LoomSwarmCodexRunGraphImportOptions
} from './types.js';

export const LOOM_NATIVE_RUN_GRAPH_SOURCE: LoomRunGraphSourceKind = 'loom-native';
export const FRONTIER_SWARM_CODEX_RUN_GRAPH_SOURCE: LoomRunGraphSourceKind = 'frontier-swarm-codex';

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
  const root = resolveRoot(options.root);
  const runId = options.runId ?? swarmRunGraphRunId(input);
  const graph = normalizeSwarmCodexJobGraph(input);
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
      importedAt: nowIso()
    },
    summary: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      roots: graph.roots.length,
      leaves: graph.leaves.length,
      issues: graph.issues.length
    },
    graph,
    metadata: {
      swarmCodex: toJsonValue({
        id: input.id,
        summary: input.summary,
        indexes: input.indexes,
        nodes: input.nodes,
        edges: input.edges
      })
    }
  };
}

export async function importSwarmCodexRunGraph(
  input: LoomSwarmCodexRunGraph,
  options: LoomSwarmCodexRunGraphImportOptions = {}
): Promise<LoomRunGraphImportResult> {
  const graph = normalizeSwarmCodexRunGraph(input, options);
  const runId = options.runId ?? graph.runId ?? 'current';
  const file = await writeLoomRunGraph(graph, { root: options.root, runId });
  return {
    ok: true,
    message: `imported frontier-swarm-codex run graph ${runId}`,
    path: file,
    runId,
    present: true,
    source: FRONTIER_SWARM_CODEX_RUN_GRAPH_SOURCE,
    sourceKind: FRONTIER_SWARM_CODEX_RUN_GRAPH_SOURCE,
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
