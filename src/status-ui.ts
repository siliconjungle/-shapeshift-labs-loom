import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { abs, pathExists } from './common.js';
import { readCollectionHealth, targetHealth } from './status-ui-health.js';

type UiTargetKind = 'run' | 'collection';
type UiTargetFlag = '--run' | '--collection';
export type UiArtifactRole = 'active' | 'health' | 'landed';
type UiDashboardUrlState = 'assigned-on-launch';

interface UiArtifactSpec {
  label: string;
  relativePath: string;
  role: UiArtifactRole;
}

export interface UiArtifact {
  label: string;
  path: string;
  role: UiArtifactRole;
}

export interface DetectedUiTarget {
  kind: UiTargetKind;
  path: string;
  flag: UiTargetFlag;
  command: string;
  dashboardCommand: string;
  explicitCommand: string;
  dataSource: string;
  dataSourcePath: string;
  dashboardUrl: string;
  dashboardUrlState: UiDashboardUrlState;
  health: string;
  artifacts: string[];
  activeArtifacts: string[];
  healthArtifacts: string[];
  landedArtifacts: string[];
  activeJobs?: number;
  landed?: number;
  applied?: number;
  committed?: number;
  skipped?: number;
  usefulPatchCount?: number;
  stalePatchCount?: number;
  total?: number;
  failed?: number;
}

export type NumericUiTargetField =
  | 'activeJobs'
  | 'landed'
  | 'applied'
  | 'committed'
  | 'skipped'
  | 'usefulPatchCount'
  | 'stalePatchCount'
  | 'total'
  | 'failed';

export async function readUiLaunchStatus(root: string): Promise<Record<string, unknown>> {
  const detected = await detectLoomUiTargets(root);
  return {
    command: 'loom ui <run-or-collection>',
    dashboardCommand: 'loom swarm dashboard <run-or-collection>',
    runFlag: '--run <run-dir>',
    collectionFlag: '--collection <collection-dir-or-json>',
    continuationFlag: '--continuation <continuation-dir-or-json>',
    argumentForms: [
      '--run <path>',
      '--run=<path>',
      '--collection <path>',
      '--collection=<path>',
      '--continuation <path>',
      '--continuation=<path>'
    ],
    shortcuts: [
      'Bare run paths are forwarded as --run.',
      'Paths ending in collected, collection, or collection.json are forwarded as --collection.',
      'Equals-form source and server options are normalized before launching frontier-loom-ui.'
    ],
    health: summarizeUiLaunchHealth(detected),
    dashboardUrl: 'http://127.0.0.1:<assigned-port>/',
    dashboardUrlNote: 'frontier-loom-ui prints the active URL when launched; pass --port <port> for a stable URL.',
    detected
  };
}

export function loomStatusMessage(uiLaunch: Record<string, unknown>): string {
  const detected = detectedUiTargets(uiLaunch.detected);
  if (detected.length > 0) {
    const count = detected.length;
    return [
      `loom project detected; ${count} UI target${count === 1 ? '' : 's'} available via loom ui <path>`,
      'ui target health:',
      ...detected.slice(0, 6).map(formatUiTargetStatusLine),
      ...(detected.length > 6 ? [`- ${detected.length - 6} more UI target${detected.length - 6 === 1 ? '' : 's'} in status --json`] : [])
    ].join('\n');
  }
  return 'loom project detected; launch the dashboard with loom ui <run-or-collection>';
}

async function detectLoomUiTargets(root: string): Promise<DetectedUiTarget[]> {
  const detected: DetectedUiTarget[] = [];
  await detectUiTargetsInDir(root, root, detected);
  for (const parent of ['agent-runs', '.loom/runs']) {
    await detectUiTargetsInDir(root, abs(root, parent), detected);
  }
  const seen = new Set<string>();
  return detected.filter((item) => {
    const key = `${item.kind}:${item.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function detectUiTargetsInDir(root: string, dir: string, out: DetectedUiTarget[]): Promise<void> {
  const entries = await safeReadDir(dir);
  if (!entries) return;
  await addUiTargetIfPresent(root, dir, out);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = path.join(dir, entry.name);
    await addUiTargetIfPresent(root, child, out);
    await addCollectionTargetIfPresent(root, path.join(child, 'collected'), out);
  }
}

async function addUiTargetIfPresent(root: string, dir: string, out: DetectedUiTarget[]): Promise<void> {
  if (await isCollectionTarget(dir)) {
    await addUiTarget(root, dir, 'collection', '--collection', out);
    return;
  }
  if (await isRunTarget(dir)) await addUiTarget(root, dir, 'run', '--run', out);
}

async function addCollectionTargetIfPresent(root: string, dir: string, out: DetectedUiTarget[]): Promise<void> {
  if (await isCollectionTarget(dir)) await addUiTarget(root, dir, 'collection', '--collection', out);
}

async function addUiTarget(
  root: string,
  targetPath: string,
  kind: UiTargetKind,
  flag: UiTargetFlag,
  out: DetectedUiTarget[]
): Promise<void> {
  const relative = path.relative(root, targetPath).replaceAll(path.sep, '/') || '.';
  const artifacts = await collectUiArtifacts(root, targetPath, kind);
  const collectionHealth = kind === 'collection' ? await readCollectionHealth(targetPath) : {};
  const dataSource = `${flag} ${relative}`;
  out.push({
    kind,
    path: relative,
    flag,
    command: `loom ui ${relative}`,
    dashboardCommand: `loom swarm dashboard ${relative}`,
    explicitCommand: `loom ui ${flag} ${relative}`,
    dataSource,
    dataSourcePath: relative,
    dashboardUrl: 'http://127.0.0.1:<assigned-port>/',
    dashboardUrlState: 'assigned-on-launch',
    health: targetHealth(kind, artifacts, collectionHealth),
    artifacts: artifacts.map((artifact) => artifact.path),
    activeArtifacts: artifactPathsByRole(artifacts, 'active'),
    healthArtifacts: artifactPathsByRole(artifacts, 'health'),
    landedArtifacts: artifactPathsByRole(artifacts, 'landed'),
    ...collectionHealth
  });
}

async function isRunTarget(dir: string): Promise<boolean> {
  const runMarkers = ['codex-events.jsonl', 'codex-stderr.log', 'prompt.md', 'last-message.md'];
  for (const marker of runMarkers) {
    if (await pathExists(path.join(dir, marker))) return true;
  }
  return false;
}

async function isCollectionTarget(dir: string): Promise<boolean> {
  if (await pathExists(path.join(dir, 'collection.json'))) return true;
  const basename = path.basename(dir).toLowerCase();
  return basename === 'collected' && await pathExists(dir);
}

async function safeReadDir(dir: string): Promise<Dirent[] | undefined> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
}

function runArtifactSpecs(): UiArtifactSpec[] {
  return [
    { label: 'events', relativePath: 'codex-events.jsonl', role: 'active' },
    { label: 'stderr', relativePath: 'codex-stderr.log', role: 'active' },
    { label: 'prompt', relativePath: 'prompt.md', role: 'active' },
    { label: 'last-message', relativePath: 'last-message.md', role: 'active' }
  ];
}

function collectionArtifactSpecs(): UiArtifactSpec[] {
  return [
    { label: 'collection', relativePath: 'collection.json', role: 'health' },
    { label: 'compact-dashboard', relativePath: 'compact-dashboard.json', role: 'health' },
    { label: 'apply-ledger', relativePath: 'apply-ledger/apply-ledger.json', role: 'landed' },
    { label: 'apply-ledger', relativePath: 'apply-ledger.json', role: 'landed' },
    { label: 'artifact-store', relativePath: 'artifact-store/artifact-store.json', role: 'health' },
    { label: 'evidence-index', relativePath: 'evidence-index.json', role: 'health' },
    { label: 'merge-index', relativePath: 'merge-index.json', role: 'health' },
    { label: 'queue-overlay', relativePath: 'queue-overlay.json', role: 'health' }
  ];
}

async function collectUiArtifacts(root: string, targetPath: string, kind: UiTargetKind): Promise<UiArtifact[]> {
  const artifacts: UiArtifact[] = [];
  const specs = kind === 'run' ? runArtifactSpecs() : collectionArtifactSpecs();
  for (const spec of specs) {
    const absolutePath = path.join(targetPath, spec.relativePath);
    if (!await pathExists(absolutePath)) continue;
    artifacts.push({
      label: spec.label,
      path: path.relative(root, absolutePath).replaceAll(path.sep, '/'),
      role: spec.role
    });
  }
  return artifacts;
}

function artifactPathsByRole(artifacts: UiArtifact[], role: UiArtifactRole): string[] {
  return artifacts.filter((artifact) => artifact.role === role).map((artifact) => artifact.path);
}

function summarizeUiLaunchHealth(targets: DetectedUiTarget[]): Record<string, unknown> {
  return {
    targetCount: targets.length,
    runCount: targets.filter((target) => target.kind === 'run').length,
    collectionCount: targets.filter((target) => target.kind === 'collection').length,
    activeJobs: sumNumberField(targets, 'activeJobs'),
    landed: sumNumberField(targets, 'landed'),
    applied: sumNumberField(targets, 'applied'),
    committed: sumNumberField(targets, 'committed'),
    skipped: sumNumberField(targets, 'skipped'),
    usefulPatchCount: sumNumberField(targets, 'usefulPatchCount'),
    stalePatchCount: sumNumberField(targets, 'stalePatchCount'),
    failed: sumNumberField(targets, 'failed'),
    activeArtifactPaths: uniqueStrings(targets.flatMap((target) => target.activeArtifacts)),
    landedArtifactPaths: uniqueStrings(targets.flatMap((target) => target.landedArtifacts)),
    healthArtifactPaths: uniqueStrings(targets.flatMap((target) => target.healthArtifacts))
  };
}

function formatUiTargetStatusLine(target: DetectedUiTarget): string {
  const details = [
    `dashboard=${target.command}`,
    `url=${target.dashboardUrl}`,
    `source=${target.dataSource}`,
    `health=${target.health}`
  ];
  if (typeof target.total === 'number') details.push(`total=${target.total}`);
  if (typeof target.activeJobs === 'number') details.push(`active jobs=${target.activeJobs}`);
  if (typeof target.landed === 'number') details.push(`landed=${target.landed}`);
  if (typeof target.applied === 'number') details.push(`applied=${target.applied}`);
  if (typeof target.committed === 'number') details.push(`committed=${target.committed}`);
  if (typeof target.skipped === 'number') details.push(`skipped=${target.skipped}`);
  if (typeof target.failed === 'number') details.push(`failed=${target.failed}`);
  if (typeof target.usefulPatchCount === 'number') details.push(`patches=${target.usefulPatchCount}`);
  if (target.activeArtifacts.length) details.push(`active artifacts=${formatPathList(target.activeArtifacts)}`);
  if (target.landedArtifacts.length) details.push(`landed artifacts=${formatPathList(target.landedArtifacts)}`);
  if (target.healthArtifacts.length) details.push(`health artifacts=${formatPathList(target.healthArtifacts)}`);
  return `- ${target.kind} ${target.path}: ${details.join('; ')}`;
}

function formatPathList(paths: string[]): string {
  const visible = paths.slice(0, 3);
  return `${visible.join(', ')}${paths.length > visible.length ? ` (+${paths.length - visible.length} more)` : ''}`;
}

function detectedUiTargets(value: unknown): DetectedUiTarget[] {
  return Array.isArray(value) ? value.filter(isDetectedUiTarget) : [];
}

function isDetectedUiTarget(value: unknown): value is DetectedUiTarget {
  return isObject(value) &&
    (value.kind === 'run' || value.kind === 'collection') &&
    typeof value.path === 'string' &&
    typeof value.command === 'string' &&
    typeof value.dataSource === 'string' &&
    typeof value.dashboardUrl === 'string' &&
    typeof value.health === 'string' &&
    Array.isArray(value.activeArtifacts) &&
    Array.isArray(value.landedArtifacts) &&
    Array.isArray(value.healthArtifacts);
}

function sumNumberField(targets: DetectedUiTarget[], key: NumericUiTargetField): number {
  return targets.reduce((sum, target) => {
    const value = target[key];
    return sum + (typeof value === 'number' ? value : 0);
  }, 0);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
