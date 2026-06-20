import { abs, pathExists, readJson, resolveRoot, writeJson } from './common.js';
import { readLoomConfig } from './config.js';
import type { LoomConfig, LoomGraph, LoomRunGraph, LoomRunGraphOptions } from './types.js';

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
