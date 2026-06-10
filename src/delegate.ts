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

export function resolveDelegateTarget(command: string): { target: DelegateTarget; cliPath: string } {
  const target = delegateTargets[command];
  if (!target) throw new Error(`unknown delegated command: ${command}`);
  const packageRoot = findPackageRoot(target.packageName);
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    bin?: string | Record<string, string>;
  };
  const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[target.binName];
  if (!bin) throw new Error(`${target.packageName} does not expose bin ${target.binName}`);
  return { target, cliPath: path.join(packageRoot, bin) };
}

export async function runDelegateCommand(command: string, args: string[]): Promise<number> {
  let cliPath: string;
  try {
    cliPath = resolveDelegateTarget(command).cliPath;
  } catch (error) {
    process.stderr.write(delegateErrorMessage(command, error));
    return 1;
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
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

function delegateErrorMessage(command: string, error: unknown): string {
  const target = delegateTargets[command];
  const detail = error instanceof Error ? error.message : String(error);
  const installHint = target?.required === false ? `Install ${target.packageName} to enable loom ${command}.\n` : '';
  return `loom ${command} is unavailable: ${detail}\n${installHint}`;
}
