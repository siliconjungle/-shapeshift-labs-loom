import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, pathExists, readJson, sha256 } from './common.js';

export interface LoomStoredObject<T = unknown> {
  kind: 'loom.object';
  type: string;
  id: string;
  payload: T;
}

export async function writeLoomObject<T>(root: string, type: string, payload: T): Promise<LoomStoredObject<T>> {
  const body = stableStringify(payload);
  const id = sha256(`loom ${type}\0${body}`);
  const file = objectPath(root, id);
  if (!(await pathExists(file))) {
    await ensureDir(path.dirname(file));
    await fs.writeFile(file, `${JSON.stringify({ kind: 'loom.object', type, id, payload }, null, 2)}\n`);
  }
  return { kind: 'loom.object', type, id, payload };
}

export async function readLoomObject<T = unknown>(root: string, id: string): Promise<LoomStoredObject<T>> {
  return readJson<LoomStoredObject<T>>(objectPath(root, id));
}

export async function readHeadRef(root: string): Promise<string> {
  const text = await fs.readFile(path.join(root, '.loom', 'HEAD'), 'utf8');
  const trimmed = text.trim();
  if (trimmed.startsWith('ref: ')) return trimmed.slice(5);
  return 'HEAD';
}

export async function readRef(root: string, ref: string): Promise<string | undefined> {
  const file = refPath(root, ref);
  if (!(await pathExists(file))) return undefined;
  const text = await fs.readFile(file, 'utf8');
  return text.trim() || undefined;
}

export async function updateRef(root: string, ref: string, objectId: string, message: string): Promise<void> {
  const file = refPath(root, ref);
  const previous = await readRef(root, ref) ?? '0'.repeat(64);
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, `${objectId}\n`);
  await appendRefLog(root, ref, previous, objectId, message);
}

export async function writeSymbolicHead(root: string, ref = 'refs/heads/main'): Promise<void> {
  await ensureDir(path.join(root, '.loom'));
  await fs.writeFile(path.join(root, '.loom', 'HEAD'), `ref: ${ref}\n`);
}

export function objectPath(root: string, id: string): string {
  return path.join(root, '.loom', 'objects', id.slice(0, 2), `${id.slice(2)}.json`);
}

function refPath(root: string, ref: string): string {
  if (ref === 'HEAD') return path.join(root, '.loom', 'HEAD');
  return path.join(root, '.loom', ref);
}

async function appendRefLog(root: string, ref: string, previous: string, next: string, message: string): Promise<void> {
  const file = path.join(root, '.loom', 'logs', ref);
  await ensureDir(path.dirname(file));
  const line = `${new Date().toISOString()} ${previous} ${next} ${message.replace(/\s+/g, ' ').trim()}\n`;
  await fs.appendFile(file, line);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}
