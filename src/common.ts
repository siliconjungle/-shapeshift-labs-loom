import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export function resolveRoot(root = process.cwd()): string {
  return path.resolve(root);
}

export function rel(root: string, file: string): string {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

export function abs(root: string, file: string): string {
  return path.resolve(root, file);
}

export async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256(text: string | Buffer): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export async function gitHead(root: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function gitDirtyCount(root: string): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: root });
    return stdout.split(/\r?\n/).filter(Boolean).length;
  } catch {
    return undefined;
  }
}

export async function appendLineIfMissing(file: string, line: string): Promise<void> {
  const exists = await pathExists(file);
  const text = exists ? await fs.readFile(file, 'utf8') : '';
  const lines = text.split(/\r?\n/).map((item) => item.trim());
  if (lines.includes(line)) return;
  const prefix = text.length && !text.endsWith('\n') ? '\n' : '';
  await fs.writeFile(file, `${text}${prefix}${line}\n`);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function packageVersion(name: string): Promise<string | undefined> {
  try {
    const pkg = require(`${name}/package.json`) as { version?: string };
    return String(pkg.version ?? '');
  } catch {
    try {
      const packageRoot = packageRootForEntry(require.resolve(name));
      const pkg = await readJson<{ version?: string }>(path.join(packageRoot, 'package.json'));
      return String(pkg.version ?? '');
    } catch {
      return undefined;
    }
  }
}

function packageRootForEntry(entry: string): string {
  let dir = path.dirname(entry);
  while (dir !== path.dirname(dir)) {
    if (fsSync.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`could not find package root for ${entry}`);
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
