import { resolveRoot } from './common.js';
import { readLoomGraph } from './graph.js';
import { scanLoomProject } from './scan.js';
import type { LoomCommandResult } from './types.js';

export async function diffLoomProject(options: { root?: string } = {}): Promise<LoomCommandResult> {
  const root = resolveRoot(options.root);
  const graph = await readLoomGraph({ root });
  const saved = new Map(graph.files.map((file) => [file.path, file]));
  const fresh = await scanLoomProject({ root, write: false });
  const current = new Map(fresh.graph.files.map((file) => [file.path, file]));

  const added = [...current.keys()].filter((file) => !saved.has(file)).sort();
  const deleted = [...saved.keys()].filter((file) => !current.has(file)).sort();
  const changed = [...current.entries()]
    .filter(([file, row]) => saved.has(file) && saved.get(file)?.sha256 !== row.sha256)
    .map(([file]) => file)
    .sort();

  return {
    ok: true,
    message: `${added.length} added, ${changed.length} changed, ${deleted.length} deleted`,
    added,
    changed,
    deleted
  };
}
