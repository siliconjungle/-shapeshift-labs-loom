import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-smoke-'));
const cli = path.resolve('dist/cli.js');

fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.mkdirSync(path.join(root, 'src', 'nested'), { recursive: true });
fs.writeFileSync(path.join(root, 'src', 'app.ts'), [
  'export interface Counter { value: number }',
  'export function increment(counter: Counter): Counter {',
  '  return { value: counter.value + 1 };',
  '}',
  ''
].join('\n'));
fs.writeFileSync(path.join(root, 'src', 'nested', 'util.ts'), 'export const nested = true;\n');

run('init', '--name', 'demo', '--source', 'src/**/*.ts');
run('scan');
run('status');
run('graph');
const snapshotOut = JSON.parse(run('snapshot', '-m', 'first semantic checkpoint', '--json'));
assert.equal(snapshotOut.ok, true);
assert.equal(snapshotOut.ref, 'refs/heads/main');
assert.ok(fs.existsSync(path.join(root, '.loom', 'HEAD')));
assert.ok(fs.existsSync(path.join(root, '.loom', 'refs', 'heads', 'main')));
const stored = JSON.parse(run('cat-file', snapshotOut.objectId, '--json'));
assert.equal(stored.type, 'snapshot');
run('project', '--to', 'python');

const graph = JSON.parse(fs.readFileSync(path.join(root, '.loom', 'graph', 'current.json'), 'utf8'));
assert.equal(graph.kind, 'loom.graph');
assert.equal(graph.summary.files, 2);
assert.deepEqual(graph.files.map((file) => file.path), ['src/app.ts', 'src/nested/util.ts']);
assert.equal(typeof graph.objectId, 'string');

fs.appendFileSync(path.join(root, 'src', 'app.ts'), 'export const one = 1;\n');
const loomBeforeDiff = snapshotTree(path.join(root, '.loom'));
const diff = JSON.parse(run('diff', '--json'));
assert.deepEqual(diff.added, []);
assert.deepEqual(diff.changed, ['src/app.ts']);
assert.deepEqual(diff.deleted, []);
assert.deepEqual(snapshotTree(path.join(root, '.loom')), loomBeforeDiff);

const api = await import('../dist/index.js');
assert.equal(api.languageForPath('x.ts'), 'typescript');
assert.equal(typeof api.scanLoomProject, 'function');
assert.equal(api.isDelegateCommand('lang'), true);
assert.equal(api.isDelegateCommand('frontier'), true);

const langHelp = run('lang', '--help');
assert.match(langHelp, /frontier-lang/);
const swarmHelp = run('swarm', 'help');
assert.match(swarmHelp, /frontier-swarm/);

function run(...args) {
  return execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
}

function snapshotTree(dir) {
  const rows = [];
  visit(dir);
  return rows.sort();

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(file);
      } else if (entry.isFile()) {
        const relative = path.relative(dir, file).replaceAll(path.sep, '/');
        const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        rows.push(`${relative}:${hash}`);
      }
    }
  }
}
