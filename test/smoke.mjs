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
assert.match(loomHelp, /loom run-graph read\|status\|write-json\|import-swarm/);
const runGraphHelp = run('run-graph', 'help');
assert.match(runGraphHelp, /loom run-graph - durable swarm run dependency graph helpers/);
assert.match(runGraphHelp, /loom run-graph write-json <file\|->/);
assert.match(runGraphHelp, /loom run-graph import-swarm <json-or-jsonl\|->/);
assert.match(runGraphHelp, /live-run-graph-events\.jsonl/);
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
assert.equal(typeof api.normalizeSwarmCodexRunGraph, 'function');
assert.equal(typeof api.normalizeSwarmCodexLiveRunGraphEvents, 'function');
assert.equal(typeof api.parseSwarmCodexRunGraphInput, 'function');
assert.equal(typeof api.importSwarmCodexRunGraph, 'function');
assert.equal(typeof api.buildRunGraphChainChunk, 'function');
assert.equal(typeof api.buildRunGraphForkChunk, 'function');
assert.equal(typeof api.buildRunGraphJoinChunk, 'function');
assert.equal(typeof api.buildRunGraphPatternChunk, 'function');
assert.equal(typeof api.createLoomRunGraphPanelRecords, 'function');
assert.equal(typeof api.readLoomCapabilities, 'function');
assert.equal(api.isDelegateCommand('lang'), true);
assert.equal(api.isDelegateCommand('frontier'), true);
assert.equal(api.isDelegateCommand('ui'), true);
const typeDeclarations = fs.readFileSync(path.resolve('dist/index.d.ts'), 'utf8');
for (const exportedType of [
  'LoomDecisionGraph',
  'LoomDecisionGraphNode',
  'LoomDecisionGraphNodeKind',
  'LoomDecisionGraphEdge',
  'LoomDecisionGraphEvent',
  'LoomDecisionGraphSnapshot',
  'LoomEvidenceKind',
  'LoomEvidenceRecord',
  'LoomGateRecord',
  'LoomMergeAdmissionStatus',
  'LoomMergeAdmissionReasonCode',
  'LoomSemanticChangeRecord',
  'LoomMergeCandidateRecord',
  'LoomTournamentRecord',
  'LoomTournamentCandidateRecord',
  'LoomPanelRecord',
  'LoomPanelProjectionRecord',
  'LoomPatchEventRecord',
  'LoomReplayRecord',
  'LoomImprovementLoopRecord',
  'LoomRunGraphChunkKind',
  'LoomRunGraphChunkTemplate',
  'LoomRunGraphProjections',
  'LoomRunGraphTypedCounts',
  'LoomRunGraphTypedNode',
  'LoomRunGraphTypedEdge',
  'LoomRunGraphEvent',
  'LoomRunGraphSnapshot',
  'LoomSourceSpan'
]) {
  assert.match(typeDeclarations, new RegExp(`\\b${exportedType}\\b`));
}
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
  source: 'loom-native',
  sourceKind: 'loom-native',
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
const typedRunGraph = createTypedRunGraphFixture(root);
const typedRunGraphPath = await api.writeLoomRunGraph(typedRunGraph, { root });
assert.equal(path.relative(root, typedRunGraphPath).replaceAll(path.sep, '/'), '.loom/graph/runs/typed_run_graph.json');
const typedRunGraphRead = await api.readLoomRunGraph({ root, runId: 'typed/run:graph' });
assert.deepEqual(typedRunGraphRead, typedRunGraph);
assert.deepEqual(typedRunGraphRead.decisionGraph.nodes.map((node) => node.kind), [
  'intent',
  'task',
  'worker',
  'candidate',
  'evidence',
  'gate',
  'decision',
  'merge',
  'replay',
  'rsi'
]);
assert.equal(typedRunGraphRead.decisionGraph.edges.length, 9);
assert.equal(typedRunGraphRead.decisionGraph.events[0].type, 'typed.graph.recorded');
assert.equal(typedRunGraphRead.decisionGraph.snapshots[0].summary.nodes, 10);
assert.deepEqual(typedRunGraphRead.decisionGraph.records.map((record) => record.kind), [
  'loom.decision-graph.evidence',
  'loom.decision-graph.gate',
  'loom.decision-graph.semantic-change',
  'loom.decision-graph.merge-candidate',
  'loom.decision-graph.tournament',
  'loom.decision-graph.panel',
  'loom.decision-graph.panel-projection',
  'loom.decision-graph.patch-event',
  'loom.decision-graph.replay',
  'loom.decision-graph.improvement-loop'
]);
const chainChunk = api.buildRunGraphChainChunk(['intent:typed', 'task:typed', 'worker:typed']);
assert.equal(chainChunk.kind, 'loom.run-graph.chunk-template');
assert.equal(chainChunk.chunkKind, 'chain');
assert.deepEqual(chainChunk.entryNodes, ['intent:typed']);
assert.deepEqual(chainChunk.exitNodes, ['worker:typed']);
const mergeGateChunk = api.buildRunGraphPatternChunk('merge-gate', ['candidate:typed', 'gate:typed', 'merge:typed']);
assert.equal(mergeGateChunk.chunkKind, 'merge-gate');
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
assert.equal(runGraphStatus.source, 'loom-native');
assert.equal(runGraphStatus.sourceKind, 'loom-native');
assert.deepEqual(runGraphStatus.graphSummary, runGraph.summary);
const runGraphStatusText = run('run-graph', 'status', 'demo/run:graph');
assert.match(runGraphStatusText, /ok: found loom run graph demo\/run:graph/);
assert.match(runGraphStatusText, /present: yes/);
assert.match(runGraphStatusText, /source: loom-native/);
assert.match(runGraphStatusText, /source kind: loom-native/);
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
const swarmRunGraph = createSwarmRunGraphFixture(root);
const normalizedSwarmRunGraph = api.normalizeSwarmCodexRunGraph(swarmRunGraph, {
  root,
  runId: 'normalized/swarm',
  sourcePath: 'agent-runs/demo/collected/run-graph.json'
});
assert.equal(normalizedSwarmRunGraph.kind, 'loom.run-graph');
assert.equal(normalizedSwarmRunGraph.runId, 'normalized/swarm');
assert.equal(normalizedSwarmRunGraph.source, 'frontier-swarm-codex');
assert.equal(normalizedSwarmRunGraph.sourceKind, 'frontier-swarm-codex');
assert.equal(normalizedSwarmRunGraph.sourceMetadata.artifactKind, 'frontier.swarm-codex.run-graph');
assert.equal(normalizedSwarmRunGraph.sourceMetadata.path, 'agent-runs/demo/collected/run-graph.json');
assert.equal(normalizedSwarmRunGraph.summary.nodes, 4);
assert.equal(normalizedSwarmRunGraph.summary.edges, 3);
assert.deepEqual(normalizedSwarmRunGraph.summary.typedCounts, {
  intents: 1,
  tasks: 1,
  workers: 1,
  candidates: 1
});
assert.deepEqual(normalizedSwarmRunGraph.graph.dependenciesByJobId['candidate:job-a'], ['job:job-a']);
assert.deepEqual(normalizedSwarmRunGraph.graph.dependentsByJobId['task:task-a'], ['job:job-a']);
assert.equal(normalizedSwarmRunGraph.decisionGraph.kind, 'loom.decision-graph');
assert.deepEqual(new Set(normalizedSwarmRunGraph.decisionGraph.nodes.map((node) => node.kind)), new Set([
  'candidate',
  'intent',
  'task',
  'worker'
]));
assert.equal(normalizedSwarmRunGraph.decisionGraph.edges.length, 3);
assert.equal(normalizedSwarmRunGraph.decisionGraph.events.length, 0);
assert.equal(normalizedSwarmRunGraph.decisionGraph.snapshots[0].summary.nodes, 4);
assert.ok(normalizedSwarmRunGraph.decisionGraph.records.some((record) => record.kind === 'loom.decision-graph.merge-candidate'));
assert.equal(normalizedSwarmRunGraph.projections.panels.length, 7);
assert.ok(normalizedSwarmRunGraph.projections.panels.every((panel) => !('status' in panel)));
assert.equal(normalizedSwarmRunGraph.metadata.swarmCodex.summary.jobCount, 1);
fs.writeFileSync(path.join(root, 'swarm-run-graph.json'), `${JSON.stringify(swarmRunGraph, null, 2)}\n`);
const importSwarmCli = JSON.parse(run('run-graph', 'import-swarm', 'swarm-run-graph.json', '--run-id', 'imported/swarm', '--json'));
assert.equal(importSwarmCli.ok, true);
assert.equal(importSwarmCli.runId, 'imported/swarm');
assert.equal(importSwarmCli.source, 'frontier-swarm-codex');
assert.equal(importSwarmCli.sourceKind, 'frontier-swarm-codex');
assert.equal(relativeToRoot(importSwarmCli.path), '.loom/graph/runs/imported_swarm.json');
assert.deepEqual(importSwarmCli.graphSummary, {
  nodes: 4,
  edges: 3,
  roots: 1,
  leaves: 1,
  issues: 0,
  typedCounts: {
    intents: 1,
    tasks: 1,
    workers: 1,
    candidates: 1
  }
});
const importedSwarmStatus = JSON.parse(run('run-graph', 'status', 'imported/swarm', '--json'));
assert.equal(importedSwarmStatus.ok, true);
assert.equal(importedSwarmStatus.source, 'frontier-swarm-codex');
assert.equal(importedSwarmStatus.sourceKind, 'frontier-swarm-codex');
assert.equal(importedSwarmStatus.sourceMetadata.path, 'swarm-run-graph.json');
assert.deepEqual(importedSwarmStatus.graphSummary, importSwarmCli.graphSummary);
const importedSwarmRead = JSON.parse(run('run-graph', 'read', 'imported/swarm'));
assert.equal(importedSwarmRead.source, 'frontier-swarm-codex');
assert.equal(importedSwarmRead.sourceKind, 'frontier-swarm-codex');
assert.equal(importedSwarmRead.sourceMetadata.artifactId, swarmRunGraph.id);
assert.deepEqual(importedSwarmRead.graph.roots, ['run:demo']);
assert.deepEqual(importedSwarmRead.graph.leaves, ['candidate:job-a']);
assert.equal(importedSwarmRead.metadata.swarmCodex.nodes.length, 4);
const importSwarmApi = await api.importSwarmCodexRunGraph(swarmRunGraph, {
  root,
  runId: 'api/imported',
  sourcePath: 'live'
});
assert.equal(importSwarmApi.ok, true);
assert.equal(importSwarmApi.sourceKind, 'frontier-swarm-codex');
assert.equal(path.relative(root, importSwarmApi.path).replaceAll(path.sep, '/'), '.loom/graph/runs/api_imported.json');
const importedApiRead = await api.readLoomRunGraph({ root, runId: 'api/imported' });
assert.equal(importedApiRead.sourceMetadata.path, 'live');
assert.equal(importedApiRead.metadata.swarmCodex.summary.candidateCount, 1);
const liveRunGraphEvents = createSwarmLiveRunGraphEventsFixture(root);
const liveJsonl = liveRunGraphEvents.map((event) => JSON.stringify(event)).join('\n') + '\n';
const parsedLiveRunGraphEvents = api.parseSwarmCodexRunGraphInput(liveJsonl);
assert.equal(Array.isArray(parsedLiveRunGraphEvents), true);
assert.equal(parsedLiveRunGraphEvents.length, liveRunGraphEvents.length);
const normalizedLiveRunGraph = api.normalizeSwarmCodexLiveRunGraphEvents(parsedLiveRunGraphEvents, {
  root,
  runId: 'normalized/live',
  sourcePath: 'agent-runs/demo/live-run-graph-events.jsonl'
});
assert.equal(normalizedLiveRunGraph.kind, 'loom.run-graph');
assert.equal(normalizedLiveRunGraph.runId, 'normalized/live');
assert.equal(normalizedLiveRunGraph.source, 'frontier-swarm-codex');
assert.equal(normalizedLiveRunGraph.sourceKind, 'frontier-swarm-codex');
assert.equal(normalizedLiveRunGraph.sourceMetadata.artifactKind, 'frontier.swarm-codex.live-run-graph-events');
assert.equal(normalizedLiveRunGraph.sourceMetadata.path, 'agent-runs/demo/live-run-graph-events.jsonl');
assert.equal(normalizedLiveRunGraph.sourceMetadata.eventCount, liveRunGraphEvents.length);
assert.ok(normalizedLiveRunGraph.sourceMetadata.eventTypes.includes('job.finished'));
assert.equal(normalizedLiveRunGraph.summary.nodes, 4);
assert.equal(normalizedLiveRunGraph.summary.edges, 3);
assert.deepEqual(normalizedLiveRunGraph.graph.roots, ['run:demo']);
assert.deepEqual(normalizedLiveRunGraph.graph.leaves, ['candidate:job-a']);
assert.equal(normalizedLiveRunGraph.decisionGraph.events.length, liveRunGraphEvents.length);
assert.equal(normalizedLiveRunGraph.decisionGraph.snapshots[0].summary.events, liveRunGraphEvents.length);
assert.ok(normalizedLiveRunGraph.decisionGraph.events.some((event) =>
  event.type === 'job.finished' &&
  event.nodeIds.includes('candidate:job-a')
));
assert.equal(normalizedLiveRunGraph.metadata.swarmCodexLive.eventCount, liveRunGraphEvents.length);
fs.writeFileSync(path.join(root, 'live-run-graph-events.jsonl'), liveJsonl);
const importLiveCli = JSON.parse(run('run-graph', 'import-swarm', 'live-run-graph-events.jsonl', '--run-id', 'imported/live', '--json'));
assert.equal(importLiveCli.ok, true);
assert.equal(importLiveCli.runId, 'imported/live');
assert.equal(importLiveCli.source, 'frontier-swarm-codex');
assert.equal(importLiveCli.sourceKind, 'frontier-swarm-codex');
assert.equal(importLiveCli.sourceMetadata.artifactKind, 'frontier.swarm-codex.live-run-graph-events');
assert.equal(importLiveCli.sourceMetadata.eventCount, liveRunGraphEvents.length);
assert.equal(relativeToRoot(importLiveCli.path), '.loom/graph/runs/imported_live.json');
assert.deepEqual(importLiveCli.graphSummary, {
  nodes: 4,
  edges: 3,
  roots: 1,
  leaves: 1,
  issues: 0,
  typedCounts: {
    intents: 1,
    tasks: 1,
    workers: 1,
    candidates: 1
  }
});
const importedLiveStatus = JSON.parse(run('run-graph', 'status', 'imported/live', '--json'));
assert.equal(importedLiveStatus.ok, true);
assert.equal(importedLiveStatus.sourceKind, 'frontier-swarm-codex');
assert.equal(importedLiveStatus.sourceMetadata.path, 'live-run-graph-events.jsonl');
assert.equal(importedLiveStatus.sourceMetadata.artifactKind, 'frontier.swarm-codex.live-run-graph-events');
assert.equal(importedLiveStatus.sourceMetadata.eventCount, liveRunGraphEvents.length);
const importedLiveRead = JSON.parse(run('run-graph', 'read', 'imported/live'));
assert.equal(importedLiveRead.sourceKind, 'frontier-swarm-codex');
assert.equal(importedLiveRead.sourceMetadata.eventTypes.length, 4);
assert.equal(importedLiveRead.metadata.swarmCodex.summary.jobCount, 1);
assert.equal(importedLiveRead.metadata.swarmCodexLive.eventCount, liveRunGraphEvents.length);
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

function createTypedRunGraphFixture(rootDir) {
  const generatedAt = new Date(0).toISOString();
  const nodeKinds = ['intent', 'task', 'worker', 'candidate', 'evidence', 'gate', 'decision', 'merge', 'replay', 'rsi'];
  const nodeIds = nodeKinds.map((kind) => `${kind}:typed`);
  const typedNodes = nodeKinds.map((kind, index) => ({
    id: nodeIds[index],
    kind,
    label: `${kind} typed node`,
    taskId: 'typed-task',
    jobId: 'typed-job',
    lane: 'graph-types',
    status: 'completed',
    createdAt: generatedAt,
    updatedAt: generatedAt,
    ...(kind === 'worker' ? { workerId: 'typed-job' } : {}),
    ...(kind === 'candidate' ? { candidateId: 'typed-candidate', outcome: 'ready-to-apply' } : {}),
    ...(kind === 'evidence' ? { path: 'evidence/typed.json' } : {})
  }));
  const typedEdges = nodeIds.slice(1).map((to, index) => {
    const from = nodeIds[index];
    return {
      id: `edge:${from}->${to}`,
      kind: 'contains',
      from,
      to
    };
  });
  const dependentsByJobId = Object.fromEntries(nodeIds.map((id) => [id, []]));
  const dependenciesByJobId = Object.fromEntries(nodeIds.map((id) => [id, []]));
  for (const edge of typedEdges) {
    dependentsByJobId[edge.from].push(edge.to);
    dependenciesByJobId[edge.to].push(edge.from);
  }
  const records = [
    {
      kind: 'loom.decision-graph.evidence',
      id: 'record:evidence:typed',
      nodeId: 'evidence:typed',
      taskId: 'typed-task',
      jobId: 'typed-job',
      lane: 'graph-types',
      status: 'completed',
      path: 'evidence/typed.json',
      artifactKind: 'json'
    },
    {
      kind: 'loom.decision-graph.gate',
      id: 'record:gate:typed',
      nodeId: 'gate:typed',
      taskId: 'typed-task',
      jobId: 'typed-job',
      lane: 'graph-types',
      status: 'passed',
      command: 'node test/smoke.mjs',
      required: true,
      exitCode: 0,
      evidenceIds: ['record:evidence:typed']
    },
    {
      kind: 'loom.decision-graph.semantic-change',
      id: 'record:semantic-change:typed',
      nodeId: 'merge:typed',
      taskId: 'typed-task',
      lane: 'graph-types',
      status: 'completed',
      files: ['src/types.ts'],
      symbols: ['LoomDecisionGraph'],
      editScriptStatus: 'clean',
      mergeReadiness: 'ready'
    },
    {
      kind: 'loom.decision-graph.merge-candidate',
      id: 'record:merge-candidate:typed',
      nodeId: 'candidate:typed',
      taskId: 'typed-task',
      jobId: 'typed-job',
      lane: 'graph-types',
      status: 'accepted',
      candidateId: 'typed-candidate',
      sourceNodeId: 'candidate:typed',
      disposition: 'ready-to-apply',
      evidenceIds: ['record:evidence:typed'],
      gateIds: ['record:gate:typed'],
      semanticChangeIds: ['record:semantic-change:typed']
    },
    {
      kind: 'loom.decision-graph.tournament',
      id: 'record:tournament:typed',
      nodeId: 'decision:typed',
      taskId: 'typed-task',
      lane: 'graph-types',
      status: 'completed',
      candidateIds: ['typed-candidate'],
      winnerCandidateId: 'typed-candidate',
      criteria: ['tests', 'contract']
    },
    {
      kind: 'loom.decision-graph.panel',
      id: 'record:panel:typed',
      nodeId: 'decision:typed',
      taskId: 'typed-task',
      lane: 'graph-types',
      status: 'completed',
      reviewerIds: ['reviewer:typed'],
      decisionIds: ['decision:typed'],
      quorum: 1,
      result: 'accepted'
    },
    {
      kind: 'loom.decision-graph.panel-projection',
      id: 'record:panel-projection:typed',
      nodeId: 'decision:typed',
      taskId: 'typed-task',
      lane: 'graph-types',
      panelKind: 'merge',
      sourceNodeIds: ['candidate:typed', 'merge:typed'],
      sourceEdgeIds: ['edge:candidate:typed->evidence:typed']
    },
    {
      kind: 'loom.decision-graph.patch-event',
      id: 'record:patch-event:typed',
      nodeId: 'merge:typed',
      taskId: 'typed-task',
      lane: 'graph-types',
      eventId: 'patch:typed',
      operation: 'apply',
      path: 'src/types.ts',
      basis: 'before',
      nextBasis: 'after',
      patchPath: 'evidence/changes.patch',
      actor: 'coordinator',
      occurredAt: generatedAt,
      result: 'applied'
    },
    {
      kind: 'loom.decision-graph.replay',
      id: 'record:replay:typed',
      nodeId: 'replay:typed',
      taskId: 'typed-task',
      lane: 'graph-types',
      status: 'completed',
      sourceRunId: 'source-run',
      targetRunId: 'target-run',
      result: 'converged'
    },
    {
      kind: 'loom.decision-graph.improvement-loop',
      id: 'record:improvement-loop:typed',
      nodeId: 'rsi:typed',
      taskId: 'typed-task',
      lane: 'graph-types',
      status: 'completed',
      loopId: 'rsi:typed',
      iteration: 1,
      objective: 'improve merge readiness',
      inputCandidateIds: ['typed-candidate'],
      outputCandidateIds: ['typed-candidate'],
      acceptedChangeIds: ['record:semantic-change:typed']
    }
  ];
  return {
    kind: 'loom.run-graph',
    version: 1,
    generatedAt,
    root: rootDir,
    runId: 'typed/run:graph',
    planId: 'typed-plan',
    source: 'loom-native',
    sourceKind: 'loom-native',
    summary: {
      nodes: nodeIds.length,
      edges: typedEdges.length,
      roots: 1,
      leaves: 1,
      issues: 0
    },
    graph: {
      nodes: nodeIds,
      edges: typedEdges.map((edge) => ({ from: edge.from, to: edge.to, type: edge.kind })),
      dependentsByJobId,
      dependenciesByJobId,
      roots: [nodeIds[0]],
      leaves: [nodeIds.at(-1)],
      issues: []
    },
    decisionGraph: {
      kind: 'loom.decision-graph',
      version: 1,
      generatedAt,
      nodes: typedNodes,
      edges: typedEdges,
      events: [{
        kind: 'loom.decision-graph.event',
        version: 1,
        id: 'event:typed',
        type: 'typed.graph.recorded',
        generatedAt,
        runId: 'typed/run:graph',
        taskId: 'typed-task',
        jobId: 'typed-job',
        lane: 'graph-types',
        nodeIds,
        edgeIds: typedEdges.map((edge) => edge.id),
        data: { root: rootDir }
      }],
      snapshots: [{
        kind: 'loom.decision-graph.snapshot',
        version: 1,
        id: 'snapshot:typed',
        generatedAt,
        label: 'typed fixture',
        nodeIds,
        edgeIds: typedEdges.map((edge) => edge.id),
        eventIds: ['event:typed'],
        summary: {
          nodes: typedNodes.length,
          edges: typedEdges.length,
          events: 1,
          records: records.length
        }
      }],
      indexes: {
        byNodeKind: Object.fromEntries(typedNodes.map((node) => [node.kind, [node.id]])),
        byEdgeKind: {
          contains: typedEdges.map((edge) => edge.id)
        },
        byTaskId: {
          'typed-task': nodeIds
        },
        byJobId: {
          'typed-job': nodeIds
        },
        byLane: {
          'graph-types': nodeIds
        }
      },
      records,
      metadata: {
        fixture: true
      }
    },
    metadata: {
      lane: 'graph-types'
    }
  };
}

function createSwarmRunGraphFixture(rootDir) {
  const generatedAt = 0;
  const runDir = path.join(rootDir, 'agent-runs', 'demo');
  const outDir = path.join(runDir, 'collected');
  return {
    kind: 'frontier.swarm-codex.run-graph',
    version: 1,
    id: 'frontier-swarm-codex.run-graph:demo',
    generatedAt,
    runDir,
    outDir,
    nodes: [
      {
        id: 'run:demo',
        kind: 'run',
        label: 'demo',
        path: runDir,
        generatedAt,
        data: { outDir }
      },
      {
        id: 'task:task-a',
        kind: 'task',
        label: 'Task A',
        taskId: 'task-a',
        lane: 'loom',
        generatedAt
      },
      {
        id: 'job:job-a',
        kind: 'job',
        label: 'Job A',
        jobId: 'job-a',
        taskId: 'task-a',
        lane: 'loom',
        status: 'completed',
        generatedAt
      },
      {
        id: 'candidate:job-a',
        kind: 'candidate',
        label: 'Candidate A',
        jobId: 'job-a',
        taskId: 'task-a',
        lane: 'loom',
        status: 'completed',
        outcome: 'ready-to-apply',
        generatedAt
      }
    ],
    edges: [
      { id: 'contains:run:demo->task:task-a', kind: 'contains', from: 'run:demo', to: 'task:task-a' },
      { id: 'produces:task:task-a->job:job-a', kind: 'produces', from: 'task:task-a', to: 'job:job-a' },
      { id: 'produces:job:job-a->candidate:job-a', kind: 'produces', from: 'job:job-a', to: 'candidate:job-a' }
    ],
    indexes: {
      byKind: {
        run: ['run:demo'],
        task: ['task:task-a'],
        job: ['job:job-a'],
        candidate: ['candidate:job-a']
      },
      byJobId: {
        'job-a': ['candidate:job-a', 'job:job-a']
      },
      byTaskId: {
        'task-a': ['candidate:job-a', 'job:job-a', 'task:task-a']
      }
    },
    summary: {
      nodeCount: 4,
      edgeCount: 3,
      nodeKinds: { run: 1, task: 1, job: 1, candidate: 1 },
      edgeKinds: { contains: 1, produces: 2 },
      taskCount: 1,
      jobCount: 1,
      candidateCount: 1,
      evidenceCount: 0,
      decisionCount: 0,
      gateCount: 0
    }
  };
}

function createSwarmLiveRunGraphEventsFixture(rootDir) {
  const runDir = path.join(rootDir, 'agent-runs', 'demo');
  const outDir = path.join(runDir, 'collected');
  return [
    {
      kind: 'frontier.swarm-codex.live-run-graph-event',
      version: 1,
      type: 'run.started',
      runId: 'demo',
      generatedAt: 0,
      nodes: [{
        id: 'run:demo',
        kind: 'run',
        label: 'demo',
        path: outDir,
        status: 'running',
        generatedAt: 0,
        data: { jobCount: 1 }
      }],
      data: { outDir, jobCount: 1 }
    },
    {
      kind: 'frontier.swarm-codex.live-run-graph-event',
      version: 1,
      type: 'job.started',
      runId: 'demo',
      jobId: 'job-a',
      taskId: 'task-a',
      lane: 'loom',
      generatedAt: 1,
      nodes: [
        {
          id: 'task:task-a',
          kind: 'task',
          label: 'Task A',
          taskId: 'task-a',
          lane: 'loom',
          generatedAt: 1
        },
        {
          id: 'job:job-a',
          kind: 'job',
          label: 'Job A',
          jobId: 'job-a',
          taskId: 'task-a',
          lane: 'loom',
          status: 'running',
          generatedAt: 1
        }
      ],
      edges: [
        { id: 'contains:run:demo->task:task-a', kind: 'contains', from: 'run:demo', to: 'task:task-a' },
        { id: 'produces:task:task-a->job:job-a', kind: 'produces', from: 'task:task-a', to: 'job:job-a' }
      ]
    },
    {
      kind: 'frontier.swarm-codex.live-run-graph-event',
      version: 1,
      type: 'job.finished',
      runId: 'demo',
      jobId: 'job-a',
      taskId: 'task-a',
      lane: 'loom',
      generatedAt: 2,
      nodes: [
        {
          id: 'job:job-a',
          kind: 'job',
          label: 'Job A',
          jobId: 'job-a',
          taskId: 'task-a',
          lane: 'loom',
          status: 'completed',
          generatedAt: 2
        },
        {
          id: 'candidate:job-a',
          kind: 'candidate',
          label: 'Candidate A',
          jobId: 'job-a',
          taskId: 'task-a',
          lane: 'loom',
          status: 'completed',
          outcome: 'ready-to-apply',
          generatedAt: 2
        }
      ],
      edges: [
        { id: 'produces:job:job-a->candidate:job-a', kind: 'produces', from: 'job:job-a', to: 'candidate:job-a' }
      ],
      data: { status: 'completed', mergeDisposition: 'ready-to-apply' }
    },
    {
      kind: 'frontier.swarm-codex.live-run-graph-event',
      version: 1,
      type: 'run.finished',
      runId: 'demo',
      generatedAt: 3,
      nodes: [{
        id: 'run:demo',
        kind: 'run',
        label: 'demo',
        path: outDir,
        status: 'completed',
        outcome: 'ok',
        generatedAt: 3,
        data: { ok: true, summary: { total: 1 } }
      }],
      data: { ok: true, summary: { total: 1 } }
    }
  ];
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
