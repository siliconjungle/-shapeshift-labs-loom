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
const loomHelp = run('help');
assert.match(loomHelp, /loom swarm ui \[<run-or-collection>\]/);
assert.match(loomHelp, /status prints UI target dashboard commands, URL behavior, data source, run health, landed\/applied counts, and active artifact paths/);
assert.match(loomHelp, /status --json reports uiLaunch commands, dashboard URL hints/);
assert.match(loomHelp, /--steering-out-dir/);
assert.match(loomHelp, /--run=agent-runs\/my-run/);
assert.match(loomHelp, /loom run-graph read\|status\|write-json/);
const runGraphHelp = run('run-graph', 'help');
assert.match(runGraphHelp, /loom run-graph - durable swarm run dependency graph helpers/);
assert.match(runGraphHelp, /loom run-graph write-json <file\|->/);
fs.mkdirSync(path.join(root, 'agent-runs', 'demo', 'collected'), { recursive: true });
fs.mkdirSync(path.join(root, 'agent-runs', 'demo', 'collected', 'apply-ledger'), { recursive: true });
fs.writeFileSync(path.join(root, 'agent-runs', 'demo', 'codex-events.jsonl'), '{}\n');
fs.writeFileSync(path.join(root, 'agent-runs', 'demo', 'collected', 'collection.json'), '{}\n');
fs.writeFileSync(path.join(root, 'agent-runs', 'demo', 'collected', 'compact-dashboard.json'), JSON.stringify({
  kind: 'frontier.swarm-codex.compact-dashboard',
  total: 3,
  activeJobs: 0,
  usefulPatchCount: 2,
  stalePatchCount: 0,
  landedCount: 1
}, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'agent-runs', 'demo', 'collected', 'apply-ledger', 'apply-ledger.json'), JSON.stringify({
  kind: 'frontier.swarm-codex.apply-ledger',
  summary: {
    total: 2,
    applied: 1,
    committed: 0,
    skipped: 0,
    failed: 1
  },
  entries: [
    {
      jobId: 'demo-landed',
      status: 'applied',
      bundlePath: 'agent-runs/demo/collected/needs-human-port/demo-landed/merge.json',
      patchPath: 'agent-runs/demo/collected/needs-human-port/demo-landed/changes.patch'
    },
    {
      jobId: 'demo-failed',
      status: 'failed',
      bundlePath: 'agent-runs/demo/collected/failed-evidence/demo-failed/merge.json'
    }
  ]
}, null, 2) + '\n');
run('scan');
const statusText = run('status');
assert.match(statusText, /UI targets available via loom ui <path>/);
assert.match(statusText, /ui target health:/);
assert.match(statusText, /run agent-runs\/demo: dashboard=loom ui agent-runs\/demo; url=http:\/\/127\.0\.0\.1:<assigned-port>\/; source=--run agent-runs\/demo; health=active-artifacts; active artifacts=agent-runs\/demo\/codex-events\.jsonl/);
assert.match(statusText, /collection agent-runs\/demo\/collected: dashboard=loom ui agent-runs\/demo\/collected; url=http:\/\/127\.0\.0\.1:<assigned-port>\/; source=--collection agent-runs\/demo\/collected; health=attention; total=3; active jobs=0; landed=1; applied=1; committed=0; skipped=0; failed=1; patches=2/);
assert.match(statusText, /landed artifacts=agent-runs\/demo\/collected\/apply-ledger\/apply-ledger\.json/);
assert.match(statusText, /health artifacts=agent-runs\/demo\/collected\/collection\.json, agent-runs\/demo\/collected\/compact-dashboard\.json/);
const status = JSON.parse(run('status', '--json'));
assert.equal(status.uiLaunch.command, 'loom ui <run-or-collection>');
assert.equal(status.uiLaunch.dashboardCommand, 'loom swarm dashboard <run-or-collection>');
assert.equal(status.uiLaunch.continuationFlag, '--continuation <continuation-dir-or-json>');
assert.equal(status.uiLaunch.dashboardUrl, 'http://127.0.0.1:<assigned-port>/');
assert.match(status.uiLaunch.dashboardUrlNote, /prints the active URL/);
assert.equal(status.uiLaunch.health.targetCount, 2);
assert.equal(status.uiLaunch.health.runCount, 1);
assert.equal(status.uiLaunch.health.collectionCount, 1);
assert.equal(status.uiLaunch.health.landed, 1);
assert.equal(status.uiLaunch.health.applied, 1);
assert.equal(status.uiLaunch.health.failed, 1);
assert.ok(status.uiLaunch.health.activeArtifactPaths.includes('agent-runs/demo/codex-events.jsonl'));
assert.ok(status.uiLaunch.health.landedArtifactPaths.includes('agent-runs/demo/collected/apply-ledger/apply-ledger.json'));
assert.ok(status.uiLaunch.shortcuts.some((item) => item.includes('--collection')));
assert.ok(status.uiLaunch.shortcuts.some((item) => item.includes('Equals-form')));
assert.ok(status.uiLaunch.argumentForms.includes('--run=<path>'));
assert.ok(status.uiLaunch.argumentForms.includes('--collection=<path>'));
const detectedRun = status.uiLaunch.detected.find((item) => item.kind === 'run' && item.path === 'agent-runs/demo');
assert.ok(detectedRun);
assert.equal(detectedRun.health, 'active-artifacts');
assert.equal(detectedRun.dataSource, '--run agent-runs/demo');
assert.equal(detectedRun.dashboardUrl, 'http://127.0.0.1:<assigned-port>/');
assert.ok(detectedRun.activeArtifacts.includes('agent-runs/demo/codex-events.jsonl'));
assert.ok(status.uiLaunch.detected.some((item) =>
  item.kind === 'run' &&
  item.path === 'agent-runs/demo' &&
  item.command === 'loom ui agent-runs/demo' &&
  item.explicitCommand === 'loom ui --run agent-runs/demo'
));
const detectedCollection = status.uiLaunch.detected.find((item) => item.kind === 'collection' && item.path === 'agent-runs/demo/collected');
assert.ok(detectedCollection);
assert.equal(detectedCollection.health, 'attention');
assert.equal(detectedCollection.activeJobs, 0);
assert.equal(detectedCollection.landed, 1);
assert.equal(detectedCollection.applied, 1);
assert.equal(detectedCollection.committed, 0);
assert.equal(detectedCollection.skipped, 0);
assert.equal(detectedCollection.failed, 1);
assert.equal(detectedCollection.usefulPatchCount, 2);
assert.equal(detectedCollection.dataSource, '--collection agent-runs/demo/collected');
assert.equal(detectedCollection.dataSourcePath, 'agent-runs/demo/collected');
assert.ok(detectedCollection.healthArtifacts.includes('agent-runs/demo/collected/compact-dashboard.json'));
assert.ok(detectedCollection.landedArtifacts.includes('agent-runs/demo/collected/apply-ledger/apply-ledger.json'));
assert.ok(status.uiLaunch.detected.some((item) =>
  item.kind === 'collection' &&
  item.path === 'agent-runs/demo/collected' &&
  item.dashboardCommand === 'loom swarm dashboard agent-runs/demo/collected' &&
  item.explicitCommand === 'loom ui --collection agent-runs/demo/collected'
));
const capabilities = JSON.parse(run('capabilities', '--json'));
assert.equal(capabilities.ok, true);
assert.ok(capabilities.nativeCommands.some((item) => item.command === 'scan'));
assert.ok(capabilities.delegates.some((item) => item.command === 'lang' && item.available));
assert.ok(capabilities.delegates.some((item) => item.command === 'swarm' && item.available));
assert.ok(capabilities.delegates.some((item) => item.command === 'ui' && item.available));
const frontierDelegate = capabilities.delegates.find((item) => item.command === 'frontier');
assert.equal(frontierDelegate.required, true);
assert.equal(frontierDelegate.available, true);
assert.equal(frontierDelegate.resolution, 'package-bin');
assert.equal(frontierDelegate.pathRequired, false);
const uiDelegate = capabilities.delegates.find((item) => item.command === 'ui');
assert.equal(uiDelegate.required, true);
assert.equal(uiDelegate.pathRequired, false);
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
assert.equal(typeof api.readLoomGraph, 'function');
assert.equal(typeof api.readLoomRunGraph, 'function');
assert.equal(typeof api.writeLoomRunGraph, 'function');
assert.equal(typeof api.readLoomCapabilities, 'function');
assert.equal(api.isDelegateCommand('lang'), true);
assert.equal(api.isDelegateCommand('frontier'), true);
assert.equal(api.isDelegateCommand('ui'), true);
const sourceGraphViaApi = await api.readLoomGraph({ root });
assert.equal(sourceGraphViaApi.kind, 'loom.graph');
assert.equal(sourceGraphViaApi.summary.files, 5);
const runGraph = {
  kind: 'loom.run-graph',
  version: 1,
  generatedAt: new Date(0).toISOString(),
  root,
  runId: 'demo/run:graph',
  planId: 'demo-plan',
  source: 'smoke',
  summary: {
    nodes: 2,
    edges: 1,
    roots: 1,
    leaves: 1,
    issues: 0
  },
  graph: {
    nodes: ['prepare', 'verify'],
    edges: [{ from: 'prepare', to: 'verify', type: 'depends-on' }],
    dependentsByJobId: { prepare: ['verify'], verify: [] },
    dependenciesByJobId: { prepare: [], verify: ['prepare'] },
    roots: ['prepare'],
    leaves: ['verify'],
    issues: []
  },
  metadata: {
    lane: 'loom'
  }
};
const runGraphPath = await api.writeLoomRunGraph(runGraph, { root });
assert.equal(path.relative(root, runGraphPath).replaceAll(path.sep, '/'), '.loom/graph/runs/demo_run_graph.json');
assert.deepEqual(await api.readLoomRunGraph({ root, runId: 'demo/run:graph' }), runGraph);
const missingRunGraphStatus = JSON.parse(run('run-graph', 'status', 'missing/run', '--json'));
assert.equal(missingRunGraphStatus.ok, false);
assert.equal(missingRunGraphStatus.present, false);
assert.equal(missingRunGraphStatus.runId, 'missing/run');
assert.equal(relativeToRoot(missingRunGraphStatus.path), '.loom/graph/runs/missing_run.json');
assert.match(missingRunGraphStatus.message, /missing loom run graph/);
const runGraphStatus = JSON.parse(run('run-graph', 'status', 'demo/run:graph', '--json'));
assert.equal(runGraphStatus.ok, true);
assert.equal(runGraphStatus.present, true);
assert.equal(runGraphStatus.runId, 'demo/run:graph');
assert.equal(runGraphStatus.planId, 'demo-plan');
assert.deepEqual(runGraphStatus.graphSummary, runGraph.summary);
const runGraphStatusText = run('run-graph', 'status', 'demo/run:graph');
assert.match(runGraphStatusText, /ok: found loom run graph demo\/run:graph/);
assert.match(runGraphStatusText, /present: yes/);
const runGraphViaCli = JSON.parse(run('run-graph', 'read', 'demo/run:graph'));
assert.deepEqual(runGraphViaCli, runGraph);
const cliRunGraph = {
  ...runGraph,
  runId: 'cli/write',
  planId: 'cli-plan',
  metadata: {
    lane: 'loom',
    command: 'write-json'
  }
};
fs.writeFileSync(path.join(root, 'run-graph-input.json'), `${JSON.stringify(cliRunGraph, null, 2)}\n`);
const writeRunGraph = JSON.parse(run('run-graph', 'write-json', 'run-graph-input.json', '--json'));
assert.equal(writeRunGraph.ok, true);
assert.equal(writeRunGraph.runId, 'cli/write');
assert.equal(relativeToRoot(writeRunGraph.path), '.loom/graph/runs/cli_write.json');
assert.deepEqual(JSON.parse(run('run-graph', 'read', 'cli/write')), cliRunGraph);
const graphAfterRunGraph = JSON.parse(fs.readFileSync(path.join(root, '.loom', 'graph', 'current.json'), 'utf8'));
assert.equal(graphAfterRunGraph.kind, 'loom.graph');
assert.equal(graphAfterRunGraph.summary.files, 5);

const langHelp = run('lang', '--help');
assert.match(langHelp, /frontier-lang/);
const swarmHelp = run('swarm', 'help');
assert.match(swarmHelp, /frontier-swarm/);
const frontierHelp = run('frontier', 'help');
assert.match(frontierHelp, /frontier <command>/);
const uiHelp = run('ui', '--help');
assert.match(uiHelp, /frontier-loom-ui/);
const fakeSwarmCodex = path.join(root, 'fake-swarm-codex.mjs');
fs.writeFileSync(fakeSwarmCodex, [
  'const payload = { argv: process.argv.slice(2) };',
  'process.stdout.write(JSON.stringify(payload) + "\\n");',
  ''
].join('\n'));
const overrideEnv = { LOOM_DELEGATE_SWARM_CODEX_CLI: fakeSwarmCodex };
const overrideCapabilities = JSON.parse(runWithEnv(overrideEnv, 'capabilities', '--json'));
const overrideSwarmCodex = overrideCapabilities.delegates.find((item) => item.command === 'swarm-codex');
assert.equal(overrideSwarmCodex.available, true);
assert.equal(overrideSwarmCodex.resolution, 'env-cli');
assert.equal(overrideSwarmCodex.cliPath, fakeSwarmCodex);
const overrideDelegate = JSON.parse(runWithEnv(overrideEnv, 'swarm-codex', 'continue', '--collection', 'agent-runs/demo/collected'));
assert.deepEqual(overrideDelegate.argv, ['continue', '--collection', 'agent-runs/demo/collected']);
const fakeUi = path.join(root, 'fake-ui.mjs');
fs.writeFileSync(fakeUi, [
  'const payload = { argv: process.argv.slice(2) };',
  'process.stdout.write(JSON.stringify(payload) + "\\n");',
  ''
].join('\n'));
const uiOverrideEnv = { LOOM_DELEGATE_UI_CLI: fakeUi };
const overrideUi = JSON.parse(runWithEnv(uiOverrideEnv, 'ui', '--run', 'agent-runs/demo'));
assert.deepEqual(overrideUi.argv, ['--run', 'agent-runs/demo']);
const overrideUiEqualsRun = JSON.parse(runWithEnv(uiOverrideEnv, 'ui', '--run=agent-runs/demo', '--port=4173', '--steering-out-dir=agent-runs/steering'));
assert.deepEqual(overrideUiEqualsRun.argv, ['--run', 'agent-runs/demo', '--port', '4173', '--steering-out-dir', 'agent-runs/steering']);
const overrideUiEqualsCollection = JSON.parse(runWithEnv(uiOverrideEnv, 'ui', '--collection=agent-runs/demo/collected', '--continuation=agent-runs/demo/continuation'));
assert.deepEqual(overrideUiEqualsCollection.argv, ['--collection', 'agent-runs/demo/collected', '--continuation', 'agent-runs/demo/continuation']);
const overrideUiBareRun = JSON.parse(runWithEnv(uiOverrideEnv, 'ui', 'agent-runs/demo', '--open'));
assert.deepEqual(overrideUiBareRun.argv, ['--run', 'agent-runs/demo', '--open']);
const overrideUiBareCollection = JSON.parse(runWithEnv(uiOverrideEnv, 'ui', '--port', '4173', 'agent-runs/demo/collected'));
assert.deepEqual(overrideUiBareCollection.argv, ['--port', '4173', '--collection', 'agent-runs/demo/collected']);
const overrideUiBareCollectionAfterEqualsPort = JSON.parse(runWithEnv(uiOverrideEnv, 'ui', '--port=4173', 'agent-runs/demo/collected'));
assert.deepEqual(overrideUiBareCollectionAfterEqualsPort.argv, ['--port', '4173', '--collection', 'agent-runs/demo/collected']);
const overrideSwarmDashboard = JSON.parse(runWithEnv(uiOverrideEnv, 'swarm', 'dashboard', 'agent-runs/demo/collected'));
assert.deepEqual(overrideSwarmDashboard.argv, ['--collection', 'agent-runs/demo/collected']);
const overrideSwarmDashboardEquals = JSON.parse(runWithEnv(uiOverrideEnv, 'swarm', 'dashboard', '--collection=agent-runs/demo/collected'));
assert.deepEqual(overrideSwarmDashboardEquals.argv, ['--collection', 'agent-runs/demo/collected']);
const overrideSwarmDashboardJson = JSON.parse(runWithEnv(uiOverrideEnv, 'swarm', 'dashboard', 'agent-runs/demo/collected/collection.json'));
assert.deepEqual(overrideSwarmDashboardJson.argv, ['--collection', 'agent-runs/demo/collected/collection.json']);
const overrideSwarmUi = JSON.parse(runWithEnv(uiOverrideEnv, 'swarm', 'ui', 'agent-runs/demo', '--open'));
assert.deepEqual(overrideSwarmUi.argv, ['--run', 'agent-runs/demo', '--open']);
const symlinkBin = path.join(root, 'loom-bin');
fs.symlinkSync(cli, symlinkBin);
const symlinkHelp = execFileSync(symlinkBin, ['help'], { cwd: root, encoding: 'utf8' });
assert.match(symlinkHelp, /semantic repo collaboration/);

function run(...args) {
  return execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
}

function runWithEnv(env, ...args) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

function relativeToRoot(file) {
  return path.relative(fs.realpathSync(root), file).replaceAll(path.sep, '/');
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
