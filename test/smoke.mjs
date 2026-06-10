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
fs.writeFileSync(path.join(root, 'src', 'view.jsx'), 'export function View() { return <main />; }\n');
fs.writeFileSync(path.join(root, 'src', 'theme.css'), 'main { display: block; }\n');
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'index.html'), '<main></main>\n');

run('init', '--name', 'demo');
const expectedVersion = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).version;
assert.equal(run('version').trim(), expectedVersion);
assert.equal(run('--version').trim(), expectedVersion);
run('scan');
run('status');
const capabilities = JSON.parse(run('capabilities', '--json'));
assert.equal(capabilities.ok, true);
assert.ok(capabilities.nativeCommands.some((item) => item.command === 'scan'));
assert.ok(capabilities.delegates.some((item) => item.command === 'lang' && item.available));
assert.ok(capabilities.delegates.some((item) => item.command === 'swarm' && item.available));
const frontierDelegate = capabilities.delegates.find((item) => item.command === 'frontier');
assert.equal(frontierDelegate.required, true);
assert.equal(frontierDelegate.available, true);
assert.equal(frontierDelegate.resolution, 'package-bin');
assert.equal(frontierDelegate.pathRequired, false);
const doctor = JSON.parse(run('doctor', '--json'));
assert.equal(doctor.ok, true);
assert.deepEqual(doctor.missing, []);
assert.deepEqual(doctor.optionalMissing, []);
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
assert.equal(graph.summary.files, 5);
assert.equal(graph.summary.syntaxes.jsx, 1);
assert.equal(graph.summary.syntaxes.css, 1);
assert.equal(graph.summary.syntaxes.html, 1);
assert.deepEqual(graph.files.map((file) => file.path), [
  'public/index.html',
  'src/app.ts',
  'src/nested/util.ts',
  'src/theme.css',
  'src/view.jsx'
]);
const jsxRecord = graph.files.find((file) => file.path === 'src/view.jsx');
assert.equal(jsxRecord.language, 'javascript');
assert.equal(jsxRecord.syntax, 'jsx');
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
assert.equal(api.languageForPath('x.jsx'), 'javascript');
assert.equal(api.syntaxForPath('x.jsx'), 'jsx');
assert.equal(typeof api.scanLoomProject, 'function');
assert.equal(typeof api.readLoomCapabilities, 'function');
assert.equal(api.isDelegateCommand('lang'), true);
assert.equal(api.isDelegateCommand('frontier'), true);

const langHelp = run('lang', '--help');
assert.match(langHelp, /frontier-lang/);
const swarmHelp = run('swarm', 'help');
assert.match(swarmHelp, /frontier-swarm/);
const frontierHelp = run('frontier', 'help');
assert.match(frontierHelp, /frontier <command>/);
const symlinkBin = path.join(root, 'loom-bin');
fs.symlinkSync(cli, symlinkBin);
const symlinkHelp = execFileSync(symlinkBin, ['help'], { cwd: root, encoding: 'utf8' });
assert.match(symlinkHelp, /semantic repo collaboration/);

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
