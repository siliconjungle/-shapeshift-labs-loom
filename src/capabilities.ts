import { packageVersion, resolveRoot } from './common.js';
import { listDelegateTargets, resolveDelegateTarget } from './delegate.js';
import type { LoomCommandResult } from './types.js';

const nativeCommands = [
  { command: 'init', purpose: 'Create loom.json, .loomignore, and .loom workspace storage.' },
  { command: 'scan', purpose: 'Import configured source files into the current semantic graph.' },
  { command: 'status', purpose: 'Report workspace, graph, package, and delegate health.' },
  { command: 'graph', purpose: 'Print the current semantic graph.' },
  { command: 'diff', purpose: 'Compare the saved semantic graph against current source files.' },
  { command: 'snapshot', purpose: 'Write a content-addressed semantic graph checkpoint.' },
  { command: 'cat-file', purpose: 'Print a stored Loom object by id.' },
  { command: 'project', purpose: 'Create a target-language projection plan.' },
  { command: 'doctor', purpose: 'Check Frontier package and delegate resolution.' },
  { command: 'capabilities', purpose: 'List native commands and delegated package surfaces.' }
];

export async function readLoomCapabilities(options: { root?: string } = {}): Promise<LoomCommandResult> {
  return {
    ok: true,
    message: 'loom capability surface',
    root: resolveRoot(options.root),
    nativeCommands,
    delegates: await inspectDelegates()
  };
}

export async function inspectDelegates(): Promise<Array<Record<string, unknown>>> {
  const rows = [];
  for (const target of listDelegateTargets()) {
    let available = false;
    let cliPath: string | undefined;
    let error: string | undefined;
    try {
      cliPath = resolveDelegateTarget(target.command).cliPath;
      available = true;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    rows.push({
      ...target,
      available,
      version: await packageVersion(target.packageName) ?? null,
      cliPath,
      error
    });
  }
  return rows;
}
