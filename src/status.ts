import { abs, gitDirtyCount, packageVersion, pathExists, readJson, resolveRoot } from './common.js';
import { readLoomConfig } from './config.js';
import { inspectDelegates } from './capabilities.js';
import { readHeadRef, readRef } from './store.js';
import type { LoomCommandResult, LoomGraph } from './types.js';

const packageChecks = [
  { name: '@shapeshift-labs/frontier', required: true },
  { name: '@shapeshift-labs/frontier-lang', required: true },
  { name: '@shapeshift-labs/frontier-lang-cli', required: true },
  { name: '@shapeshift-labs/frontier-lang-compiler', required: true },
  { name: '@shapeshift-labs/frontier-swarm', required: true },
  { name: '@shapeshift-labs/frontier-swarm-codex', required: true },
  { name: '@shapeshift-labs/frontier-framework', required: true }
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
  const delegates = await inspectDelegates();
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
    packages,
    delegates
  };
}

export async function doctorLoomProject(options: { root?: string } = {}): Promise<LoomCommandResult> {
  const status = await readLoomStatus(options);
  const packages = status.packages as Record<string, string | undefined>;
  const required = new Set(packageChecks.filter((item) => item.required).map((item) => item.name));
  const missing = Object.entries(packages).filter(([name, version]) => required.has(name) && !version).map(([name]) => name);
  const optionalMissing = Object.entries(packages).filter(([name, version]) => !required.has(name) && !version).map(([name]) => name);
  return {
    ok: missing.length === 0,
    message: missing.length ? `missing packages: ${missing.join(', ')}` : 'frontier package resolution ok',
    status,
    missing,
    optionalMissing
  };
}

async function readPackageVersions(): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const item of packageChecks) out[item.name] = await packageVersion(item.name) ?? null;
  return out;
}
