import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

export interface DelegateTarget {
  packageName: string;
  binName: string;
  required: boolean;
  description: string;
}

export type DelegateResolution = 'env-cli' | 'env-package-root' | 'package-bin';

export interface ResolvedDelegateTarget {
  target: DelegateTarget;
  cliPath: string;
  packageRoot?: string;
  resolution: DelegateResolution;
}

export const delegateTargets: Record<string, DelegateTarget> = {
  swarm: {
    packageName: '@shapeshift-labs/frontier-swarm-codex',
    binName: 'frontier-swarm',
    required: true,
    description: 'Frontier Swarm and Codex worker orchestration.'
  },
  'swarm-codex': {
    packageName: '@shapeshift-labs/frontier-swarm-codex',
    binName: 'frontier-swarm-codex',
    required: true,
    description: 'Explicit Frontier Swarm Codex adapter alias.'
  },
  ui: {
    packageName: '@shapeshift-labs/frontier-loom-ui',
    binName: 'frontier-loom-ui',
    required: true,
    description: 'Dark Loom dashboard for inspecting and steering swarm runs and collections.'
  },
  lang: {
    packageName: '@shapeshift-labs/frontier-lang-cli',
    binName: 'frontier-lang',
    required: true,
    description: 'Frontier Lang parse, check, import, projection, and slice tools.'
  },
  'frontier-lang': {
    packageName: '@shapeshift-labs/frontier-lang-cli',
    binName: 'frontier-lang',
    required: true,
    description: 'Explicit Frontier Lang CLI alias.'
  },
  frontier: {
    packageName: '@shapeshift-labs/frontier-framework',
    binName: 'frontier',
    required: true,
    description: 'Frontier Framework app, evidence, harness, and build tools.'
  },
  framework: {
    packageName: '@shapeshift-labs/frontier-framework',
    binName: 'frontier',
    required: true,
    description: 'Explicit Frontier Framework CLI alias.'
  }
};

export function isDelegateCommand(command: string): boolean {
  return Boolean(delegateTargets[command]);
}

export function listDelegateTargets(): Array<{ command: string } & DelegateTarget> {
  return Object.entries(delegateTargets).map(([command, target]) => ({ command, ...target }));
}

export function resolveDelegateTarget(command: string): ResolvedDelegateTarget {
  const target = delegateTargets[command];
  if (!target) throw new Error(`unknown delegated command: ${command}`);
  const cliOverride = readDelegateEnv(command, 'CLI');
  if (cliOverride) {
    const cliPath = path.resolve(cliOverride);
    if (!fs.existsSync(cliPath)) throw new Error(`${delegateEnvName(command, 'CLI')} points to a missing file: ${cliPath}`);
    return { target, cliPath, resolution: 'env-cli' };
  }
  const packageRootOverride = readDelegateEnv(command, 'PACKAGE_ROOT') ?? readDelegateEnv(command, 'ROOT');
  const packageRoot = packageRootOverride ? path.resolve(packageRootOverride) : findPackageRoot(target.packageName);
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    bin?: string | Record<string, string>;
  };
  const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[target.binName];
  if (!bin) throw new Error(`${target.packageName} does not expose bin ${target.binName}`);
  return {
    target,
    packageRoot,
    cliPath: path.join(packageRoot, bin),
    resolution: packageRootOverride ? 'env-package-root' : 'package-bin'
  };
}

export async function runDelegateCommand(command: string, args: string[]): Promise<number> {
  let cliPath: string;
  try {
    cliPath = resolveDelegateTarget(command).cliPath;
  } catch (error) {
    process.stderr.write(delegateErrorMessage(command, error));
    return 1;
  }
  const forwardedArgs = command === 'ui' ? normalizeLoomUiArgs(args) : args;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...forwardedArgs], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export function normalizeLoomUiArgs(args: string[]): string[] {
  const normalizedArgs = normalizeLoomUiOptionArgs(args);
  if (normalizedArgs.length === 0 || hasExplicitLoomUiSource(normalizedArgs) || hasLoomUiHelpArg(normalizedArgs)) return normalizedArgs;
  const targetIndex = firstLoomUiTargetIndex(normalizedArgs);
  if (targetIndex === -1) return normalizedArgs;
  const targetPath = normalizedArgs[targetIndex];
  if (!targetPath) return normalizedArgs;
  return [
    ...normalizedArgs.slice(0, targetIndex),
    inferLoomUiSourceFlag(targetPath),
    targetPath,
    ...normalizedArgs.slice(targetIndex + 1)
  ];
}

function findPackageRoot(packageName: string): string {
  let entry: string;
  try {
    entry = require.resolve(packageName);
  } catch {
    throw new Error(`package is not installed: ${packageName}`);
  }
  let dir = path.dirname(entry);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`could not find package root for ${packageName}`);
}

function readDelegateEnv(command: string, suffix: string): string | undefined {
  const value = process.env[delegateEnvName(command, suffix)];
  return value && value.trim().length ? value.trim() : undefined;
}

function delegateEnvName(command: string, suffix: string): string {
  return `LOOM_DELEGATE_${command.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${suffix}`;
}

function delegateErrorMessage(command: string, error: unknown): string {
  const target = delegateTargets[command];
  const detail = error instanceof Error ? error.message : String(error);
  const installHint = target?.required === false ? `Install ${target.packageName} to enable loom ${command}.\n` : '';
  return `loom ${command} is unavailable: ${detail}\n${installHint}`;
}

function hasExplicitLoomUiSource(args: string[]): boolean {
  return args.some((arg) =>
    arg === '--run' ||
    arg.startsWith('--run=') ||
    arg === '--collection' ||
    arg.startsWith('--collection=') ||
    arg === '--continuation' ||
    arg.startsWith('--continuation=')
  );
}

function hasLoomUiHelpArg(args: string[]): boolean {
  return args.includes('help') || args.includes('--help') || args.includes('-h');
}

function normalizeLoomUiOptionArgs(args: string[]): string[] {
  const optionsWithValues = loomUiOptionsWithValues();
  const normalized: string[] = [];
  for (const arg of args) {
    if (!arg.startsWith('--') || !arg.includes('=')) {
      normalized.push(arg);
      continue;
    }
    const separator = arg.indexOf('=');
    const option = arg.slice(0, separator);
    if (!optionsWithValues.has(option)) {
      normalized.push(arg);
      continue;
    }
    normalized.push(option, arg.slice(separator + 1));
  }
  return normalized;
}

function firstLoomUiTargetIndex(args: string[]): number {
  const optionsWithValues = loomUiOptionsWithValues();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg.startsWith('--')) {
      const option = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
      if (optionsWithValues.has(option) && !arg.includes('=')) index += 1;
      continue;
    }
    if (arg.startsWith('-')) continue;
    return index;
  }
  return -1;
}

function loomUiOptionsWithValues(): Set<string> {
  return new Set([
    '--cwd',
    '--host',
    '--port',
    '--steering-out-dir',
    '--steeringOutDir',
    '--run',
    '--collection',
    '--continuation'
  ]);
}

function inferLoomUiSourceFlag(targetPath: string): '--run' | '--collection' {
  const normalized = targetPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase();
  if (basename === 'collected' || basename === 'collection' || basename === 'collection.json') return '--collection';
  return '--run';
}
