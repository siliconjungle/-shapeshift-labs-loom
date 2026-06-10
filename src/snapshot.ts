import { gitHead, nowIso, readJson, resolveRoot, writeJson } from './common.js';
import { readLoomConfig } from './config.js';
import { scanLoomProject } from './scan.js';
import { readHeadRef, readLoomObject, readRef, updateRef, writeLoomObject } from './store.js';
import type { LoomCommandResult, LoomFileRecord, LoomSnapshotOptions } from './types.js';

interface LoomIndexFile {
  kind: 'loom.index';
  version: 1;
  generatedAt: string;
  graphObjectId?: string;
  entries: LoomFileRecord[];
}

export async function snapshotLoomProject(options: LoomSnapshotOptions = {}): Promise<LoomCommandResult> {
  const root = resolveRoot(options.root);
  const config = await readLoomConfig(root);
  await scanLoomProject({ root, write: true });
  const index = await readJson<LoomIndexFile>(`${root}/.loom/index.json`);
  const tree = await writeLoomObject(root, 'tree', {
    kind: 'loom.tree',
    version: 1,
    generatedAt: nowIso(),
    entries: index.entries.map((entry) => ({
      path: entry.path,
      language: entry.language,
      bytes: entry.bytes,
      sha256: entry.sha256,
      semantic: entry.semantic
    }))
  });
  const headRef = await readHeadRef(root);
  const parent = headRef === 'HEAD' ? await readRef(root, 'HEAD') : await readRef(root, headRef);
  const snapshot = await writeLoomObject(root, 'snapshot', {
    kind: 'loom.snapshot',
    version: 1,
    createdAt: nowIso(),
    message: options.message ?? 'loom snapshot',
    tree: tree.id,
    parent: parent ? [parent] : [],
    graph: index.graphObjectId,
    gitHead: await gitHead(root),
    summary: {
      files: index.entries.length,
      semanticImports: index.entries.filter((entry) => entry.semantic?.ok).length
    }
  });
  await updateRef(root, headRef, snapshot.id, options.message ?? 'snapshot');
  await writeJson(`${root}/${config.generated.graph}/HEAD.json`, {
    kind: 'loom.head',
    version: 1,
    ref: headRef,
    snapshot: snapshot.id,
    tree: tree.id,
    graph: index.graphObjectId
  });
  return {
    ok: true,
    message: `snapshot ${snapshot.id.slice(0, 12)}`,
    objectId: snapshot.id,
    tree: tree.id,
    ref: headRef,
    parent
  };
}

export async function catLoomObject(options: { root?: string; id: string }): Promise<unknown> {
  return readLoomObject(resolveRoot(options.root), options.id);
}
