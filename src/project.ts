import { nowIso, resolveRoot, writeJson } from './common.js';
import { readLoomConfig } from './config.js';
import { readLoomGraph } from './graph.js';
import type { LoomCommandResult } from './types.js';

export async function createLoomProjectionPlan(options: { root?: string; target: string; outDir?: string }): Promise<LoomCommandResult> {
  const root = resolveRoot(options.root);
  const config = await readLoomConfig(root);
  const graph = await readLoomGraph({ root });
  const target = options.target.trim();
  if (!target) throw new Error('project requires --to <target>');
  const plan = {
    kind: 'loom.projectionPlan',
    version: 1,
    generatedAt: nowIso(),
    target,
    sourceGraph: `${config.generated.graph}/current.json`,
    sourceGitHead: graph.gitHead,
    summary: graph.summary,
    routes: graph.files.map((file) => ({
      sourcePath: file.path,
      sourceLanguage: file.language,
      sourceHash: file.sha256,
      target,
      status: file.semantic?.ok ? 'semantic-imported' : 'hash-only',
      semantic: file.semantic
    }))
  };
  const outDir = options.outDir ?? config.generated.projections;
  const outFile = `${root}/${outDir}/${target}.json`;
  await writeJson(outFile, plan);
  return { ok: true, message: `wrote ${target} projection plan`, path: outFile, plan };
}
