import { abs, gitDirtyCount, packageVersion, pathExists, readJson, resolveRoot } from './common.js';
import { readLoomConfig } from './config.js';
import { readHeadRef, readRef } from './store.js';
import type { LoomCommandResult, LoomGraph } from './types.js';

const frontierPackages = [
  '@shapeshift-labs/frontier',
  '@shapeshift-labs/frontier-lang',
  '@shapeshift-labs/frontier-lang-compiler',
  '@shapeshift-labs/frontier-swarm',
  '@shapeshift-labs/frontier-swarm-codex'
];

export async function readLoomStatus(options: { root?: string } = {}): Promise<LoomCommandResult> {
  const root = resolveRoot(options.root);
  const configExists = await pathExists(abs(root, 'loom.json'));
  const config = configExists ? await readLoomConfig(root) : undefined;
  const graphPath = config ? abs(root, `${config.generated.graph}/current.json`) : undefined;
  const graph = graphPath && await pathExists(graphPath) ? await readJson<LoomGraph>(graphPath) : undefined;
  const headRef = configExists ? await readHeadRef(root).catch(() => undefined) : undefined;
  const headObject = headRef ? await readRef(root, headRef).catch(() => undefined) : undefined;
  const packages = await readPackageVersions();
  return {
    ok: configExists,
    ready: Boolean(config && graph),
    message: configExists ? 'loom project detected' : 'missing loom.json',
    root,
    configPath: configExists ? abs(root, 'loom.json') : undefined,
    graphPath,
    gitDirtyCount: await gitDirtyCount(root),
    headRef,
    headObject,
    graphSummary: graph?.summary,
    packages
  };
}

export async function doctorLoomProject(options: { root?: string } = {}): Promise<LoomCommandResult> {
  const status = await readLoomStatus(options);
  const packages = status.packages as Record<string, string | undefined>;
  const missing = Object.entries(packages).filter(([, version]) => !version).map(([name]) => name);
  return {
    ok: missing.length === 0,
    message: missing.length ? `missing packages: ${missing.join(', ')}` : 'frontier package resolution ok',
    status,
    missing
  };
}

async function readPackageVersions(): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  for (const name of frontierPackages) out[name] = await packageVersion(name);
  return out;
}
