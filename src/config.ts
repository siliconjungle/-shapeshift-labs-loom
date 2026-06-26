import fs from 'node:fs/promises';
import path from 'node:path';
import { abs, pathExists, readJson, resolveRoot, writeJson } from './common.js';
import type { LoomConfig, LoomInitOptions, LoomLanguage } from './types.js';

export const loomConfigFile = 'loom.json';

export const defaultIncludes = [
  'src/**/*.js',
  'src/**/*.jsx',
  'src/**/*.mjs',
  'src/**/*.cjs',
  'src/**/*.ts',
  'src/**/*.tsx',
  'src/**/*.css',
  'src/**/*.json',
  'src/**/*.html',
  'src/**/*.svg',
  'app/**/*.js',
  'app/**/*.jsx',
  'app/**/*.ts',
  'app/**/*.tsx',
  'app/**/*.css',
  'pages/**/*.js',
  'pages/**/*.jsx',
  'pages/**/*.ts',
  'pages/**/*.tsx',
  'components/**/*.js',
  'components/**/*.jsx',
  'components/**/*.ts',
  'components/**/*.tsx',
  'test/**/*.js',
  'test/**/*.jsx',
  'test/**/*.mjs',
  'test/**/*.ts',
  'test/**/*.tsx',
  'packages/**/*.js',
  'packages/**/*.jsx',
  'packages/**/*.ts',
  'packages/**/*.tsx',
  'public/**/*.html',
  'public/**/*.css',
  'public/**/*.json',
  'public/**/*.svg',
  'public/**/*.txt',
  'public/**/*.md'
];

export const defaultExcludes = [
  'node_modules/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '.next/**',
  '.git/**',
  '.loom/**',
  'agent-runs/**'
];

export function createLoomConfig(options: LoomInitOptions = {}): LoomConfig {
  const root = resolveRoot(options.root);
  return {
    kind: 'loom.config',
    version: 1,
    name: options.name ?? path.basename(root),
    root: '.',
    source: {
      include: options.include?.length ? options.include : defaultIncludes,
      exclude: options.exclude?.length ? [...defaultExcludes, ...options.exclude] : defaultExcludes,
      languages: options.languages?.length ? options.languages : defaultLanguages(),
      maxFileBytes: 512_000
    },
    generated: {
      dir: '.loom',
      graph: '.loom/graph',
      objects: '.loom/objects',
      refs: '.loom/refs',
      logs: '.loom/logs',
      info: '.loom/info',
      hooks: '.loom/hooks',
      runs: '.loom/runs',
      queues: '.loom/queues',
      evidence: '.loom/evidence',
      projections: '.loom/projections',
      locks: '.loom/locks'
    },
    frontier: {
      semanticImport: true,
      semanticImportMaxFiles: 400,
      semanticImportMaxBytes: 2_000_000
    }
  };
}

export async function readLoomConfig(root = process.cwd()): Promise<LoomConfig> {
  const file = abs(resolveRoot(root), loomConfigFile);
  if (!(await pathExists(file))) throw new Error(`missing ${loomConfigFile}; run loom init first`);
  return readJson<LoomConfig>(file);
}

export async function writeLoomConfig(root: string, config: LoomConfig, force = false): Promise<string> {
  const file = abs(root, loomConfigFile);
  if (!force && await pathExists(file)) throw new Error(`${loomConfigFile} already exists; use --force to overwrite`);
  await writeJson(file, config);
  return file;
}

export async function readLoomIgnore(root: string): Promise<string[]> {
  const file = abs(root, '.loomignore');
  if (!(await pathExists(file))) return [];
  const text = await fs.readFile(file, 'utf8');
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

function defaultLanguages(): LoomLanguage[] {
  return ['javascript', 'typescript', 'python', 'rust', 'c', 'csharp', 'go', 'java', 'kotlin', 'swift', 'css', 'html'];
}
