import { abs, pathExists, readJson, resolveRoot } from './common.js';
import { readLoomConfig } from './config.js';
import type { LoomGraph } from './types.js';

export async function readLoomGraph(options: { root?: string } = {}): Promise<LoomGraph> {
  const root = resolveRoot(options.root);
  const config = await readLoomConfig(root);
  const file = abs(root, `${config.generated.graph}/current.json`);
  if (!(await pathExists(file))) throw new Error('missing .loom graph; run loom scan first');
  return readJson<LoomGraph>(file);
}
