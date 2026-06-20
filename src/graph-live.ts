import path from 'node:path';
import type {
  LoomSwarmCodexLiveRunGraphEvent,
  LoomSwarmCodexRunGraph,
  LoomSwarmCodexRunGraphImportOptions,
  LoomSwarmCodexRunGraphInput
} from './types.js';

export const FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENT_KIND = 'frontier.swarm-codex.live-run-graph-event';
export const FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENTS_ARTIFACT = 'frontier.swarm-codex.live-run-graph-events';

export function parseSwarmCodexRunGraphInput(input: string): LoomSwarmCodexRunGraphInput {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('invalid swarm run graph input: empty input');

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (parseError) {
    const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const events = lines.map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch (lineError) {
        throw new Error(`invalid swarm live run graph JSONL at line ${index + 1}: ${errorMessage(lineError)}`);
      }
    });
    try {
      return normalizeParsedSwarmCodexInput(events);
    } catch (jsonlError) {
      throw new Error(`invalid swarm run graph input: ${errorMessage(jsonlError)}; JSON parse failed with ${errorMessage(parseError)}`);
    }
  }
  return normalizeParsedSwarmCodexInput(parsed);
}

export function materializeSwarmCodexLiveRunGraphEvents(
  input: readonly LoomSwarmCodexLiveRunGraphEvent[],
  options: LoomSwarmCodexRunGraphImportOptions = {}
): LoomSwarmCodexRunGraph {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('invalid swarm live run graph events: expected at least one event');
  }

  const nodes = new Map<string, LoomSwarmCodexRunGraph['nodes'][number]>();
  const edges = new Map<string, LoomSwarmCodexRunGraph['edges'][number]>();
  let runId: string | undefined;
  let outDir: string | undefined;
  let generatedAt = 0;

  for (const event of input) {
    assertSwarmCodexLiveRunGraphEvent(event);
    if (!runId && event.runId) runId = event.runId;
    generatedAt = Math.max(generatedAt, event.generatedAt);

    const eventOutDir = stringRecordValue(event.data, 'outDir');
    if (!outDir && eventOutDir) outDir = eventOutDir;

    for (const node of event.nodes ?? []) {
      if (!node || typeof node.id !== 'string' || !node.id) continue;
      if (!outDir && node.kind === 'run' && typeof node.path === 'string' && node.path) outDir = node.path;
      if (!runId && node.kind === 'run' && typeof node.label === 'string' && node.label) runId = node.label;
      const existing = nodes.get(node.id);
      nodes.set(node.id, existing ? mergeSwarmCodexRunGraphNode(existing, node) : node);
    }

    for (const edge of event.edges ?? []) {
      if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue;
      if (!edge.from || !edge.to || edge.from === edge.to) continue;
      const edgeId = typeof edge.id === 'string' && edge.id ? edge.id : `${edge.kind}:${edge.from}->${edge.to}`;
      const next = { ...edge, id: edgeId };
      const existing = edges.get(edgeId);
      edges.set(edgeId, existing ? mergeSwarmCodexRunGraphEdge(existing, next) : next);
    }
  }

  if (!generatedAt) generatedAt = Date.now();
  const fallbackDir = options.sourcePath && options.sourcePath !== 'stdin' ? path.dirname(options.sourcePath) : '';
  outDir = outDir ?? fallbackDir;
  const runDir = inferRunDirFromOutDir(outDir);
  const fallbackRunId = path.basename(runDir || outDir || '') || 'current';
  runId = options.runId ?? runId ?? fallbackRunId;

  const nodeList = Array.from(nodes.values()).sort((left, right) => left.id.localeCompare(right.id));
  const edgeList = Array.from(edges.values()).sort((left, right) => left.id.localeCompare(right.id));
  const indexes = createSwarmCodexRunGraphIndexes(nodeList);
  const nodeKinds = countStrings(nodeList.map((node) => node.kind));
  const edgeKinds = countStrings(edgeList.map((edge) => edge.kind));

  return {
    kind: 'frontier.swarm-codex.run-graph',
    version: 1,
    id: `frontier-swarm-codex.live-run-graph:${runId}`,
    generatedAt,
    runDir,
    outDir,
    nodes: nodeList,
    edges: edgeList,
    indexes,
    summary: {
      nodeCount: nodeList.length,
      edgeCount: edgeList.length,
      nodeKinds,
      edgeKinds,
      taskCount: nodeKinds.task ?? 0,
      jobCount: nodeKinds.job ?? 0,
      candidateCount: nodeKinds.candidate ?? 0,
      evidenceCount: nodeKinds.evidence ?? 0,
      decisionCount: nodeKinds.decision ?? 0,
      gateCount: nodeKinds.gate ?? 0
    }
  };
}

function normalizeParsedSwarmCodexInput(value: unknown): LoomSwarmCodexRunGraphInput {
  if (Array.isArray(value)) {
    for (const event of value) assertSwarmCodexLiveRunGraphEvent(event as LoomSwarmCodexLiveRunGraphEvent);
    return value as LoomSwarmCodexLiveRunGraphEvent[];
  }
  if (!value || typeof value !== 'object') {
    throw new Error('invalid swarm run graph input: expected JSON object or JSONL live events');
  }
  const kind = (value as { kind?: unknown }).kind;
  if (kind === 'frontier.swarm-codex.run-graph') {
    assertSwarmCodexRunGraph(value as LoomSwarmCodexRunGraph);
    return value as LoomSwarmCodexRunGraph;
  }
  if (kind === FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENT_KIND) {
    assertSwarmCodexLiveRunGraphEvent(value as LoomSwarmCodexLiveRunGraphEvent);
    return [value as LoomSwarmCodexLiveRunGraphEvent];
  }
  throw new Error('invalid swarm run graph input: expected frontier-swarm-codex run graph or live run graph events');
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

function assertSwarmCodexLiveRunGraphEvent(value: LoomSwarmCodexLiveRunGraphEvent): void {
  if (!value || typeof value !== 'object') throw new Error('invalid swarm live run graph event: expected object');
  if (value.kind !== FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENT_KIND) {
    throw new Error(`invalid swarm live run graph event: expected kind "${FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENT_KIND}"`);
  }
  if (value.version !== 1) throw new Error('invalid swarm live run graph event: expected version 1');
  if (typeof value.type !== 'string' || !value.type) throw new Error('invalid swarm live run graph event: expected type');
  if (typeof value.generatedAt !== 'number' || !Number.isFinite(value.generatedAt)) {
    throw new Error('invalid swarm live run graph event: expected numeric generatedAt');
  }
  if (value.nodes !== undefined && !Array.isArray(value.nodes)) {
    throw new Error('invalid swarm live run graph event: expected nodes array');
  }
  if (value.edges !== undefined && !Array.isArray(value.edges)) {
    throw new Error('invalid swarm live run graph event: expected edges array');
  }
}

function mergeSwarmCodexRunGraphNode(
  left: LoomSwarmCodexRunGraph['nodes'][number],
  right: LoomSwarmCodexRunGraph['nodes'][number]
): LoomSwarmCodexRunGraph['nodes'][number] {
  const leftTime = typeof left.generatedAt === 'number' ? left.generatedAt : -Infinity;
  const rightTime = typeof right.generatedAt === 'number' ? right.generatedAt : -Infinity;
  const older = rightTime >= leftTime ? left : right;
  const newer = rightTime >= leftTime ? right : left;
  const merged = {
    ...definedObject(older),
    ...definedObject(newer)
  } as LoomSwarmCodexRunGraph['nodes'][number];
  const refs = mergeRecordValues(older.refs, newer.refs);
  if (Object.keys(refs).length > 0) merged.refs = refs as Record<string, string>;
  const data = mergeRecordValues(older.data, newer.data);
  if (Object.keys(data).length > 0) merged.data = data;
  return merged;
}

function mergeSwarmCodexRunGraphEdge(
  left: LoomSwarmCodexRunGraph['edges'][number],
  right: LoomSwarmCodexRunGraph['edges'][number]
): LoomSwarmCodexRunGraph['edges'][number] {
  const merged = {
    ...definedObject(left),
    ...definedObject(right)
  } as LoomSwarmCodexRunGraph['edges'][number];
  const data = mergeRecordValues(left.data, right.data);
  if (Object.keys(data).length > 0) merged.data = data;
  return merged;
}

function createSwarmCodexRunGraphIndexes(
  nodes: readonly LoomSwarmCodexRunGraph['nodes'][number][]
): LoomSwarmCodexRunGraph['indexes'] {
  const indexes: LoomSwarmCodexRunGraph['indexes'] = {
    byKind: {},
    byJobId: {},
    byTaskId: {}
  };
  for (const node of nodes) {
    addGraphIndexValue(indexes.byKind, node.kind, node.id);
    if (node.jobId) addGraphIndexValue(indexes.byJobId, node.jobId, node.id);
    if (node.taskId) addGraphIndexValue(indexes.byTaskId, node.taskId, node.id);
  }
  for (const index of Object.values(indexes)) sortGraphIndex(index);
  return indexes;
}

function addGraphIndexValue(index: Record<string, string[]>, key: string, value: string): void {
  const list = index[key] ?? [];
  list.push(value);
  index[key] = list;
}

function sortGraphIndex(index: Record<string, string[]>): void {
  for (const values of Object.values(index)) values.sort();
}

function countStrings(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function definedObject<T extends object>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item;
  }
  return out as Partial<T>;
}

function mergeRecordValues(left: unknown, right: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const record of [left, right]) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
      if (value !== undefined) out[key] = value;
    }
  }
  return out;
}

function inferRunDirFromOutDir(outDir: string): string {
  if (!outDir) return '';
  return path.basename(outDir) === 'collected' ? path.dirname(outDir) : outDir;
}

function stringRecordValue(record: unknown, key: string): string | undefined {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' && value ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
