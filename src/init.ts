import fs from 'node:fs/promises';
import { appendLineIfMissing, ensureDir, nowIso, resolveRoot, writeJson } from './common.js';
import { createLoomConfig, writeLoomConfig } from './config.js';
import { writeSymbolicHead } from './store.js';
import type { LoomCommandResult, LoomInitOptions } from './types.js';

export async function initLoomProject(options: LoomInitOptions = {}): Promise<LoomCommandResult> {
  const root = resolveRoot(options.root);
  const config = createLoomConfig({ ...options, root });
  const configPath = await writeLoomConfig(root, config, options.force === true);

  for (const dir of Object.values(config.generated)) {
    await ensureDir(`${root}/${dir}`);
  }
  await ensureDir(`${root}/.loom/objects/pack`);
  await ensureDir(`${root}/.loom/objects/info`);
  await ensureDir(`${root}/.loom/refs/heads`);
  await ensureDir(`${root}/.loom/refs/tags`);
  await ensureDir(`${root}/.loom/logs/refs/heads`);
  await writeSymbolicHead(root, 'refs/heads/main');

  await writeJson(`${root}/.loom/repo.json`, {
    kind: 'loom.repo',
    version: 1,
    name: config.name,
    generatedAt: nowIso(),
    configPath: 'loom.json',
    graphPath: '.loom/graph/current.json'
  });
  await writeJson(`${root}/.loom/index.json`, {
    kind: 'loom.index',
    version: 1,
    generatedAt: nowIso(),
    entries: []
  });

  await fs.writeFile(`${root}/.loomignore`, `${[
    '# Loom scan ignores',
    'node_modules/**',
    'dist/**',
    'coverage/**',
    '.git/**',
    '.loom/**'
  ].join('\n')}\n`);
  await appendLineIfMissing(`${root}/.gitignore`, '.loom/');

  return { ok: true, message: `initialized ${config.name}`, path: configPath, config };
}
