import fs from 'node:fs/promises';
import path from 'node:path';
import type { DetectedUiTarget, NumericUiTargetField, UiArtifact, UiArtifactRole } from './status-ui.js';

export async function readCollectionHealth(dir: string): Promise<Partial<DetectedUiTarget>> {
  const compact = await safeReadJson(path.join(dir, 'compact-dashboard.json'));
  const mergeMetrics = await safeReadJson(path.join(dir, 'merge-metrics-feedback.json'));
  const mergeMetricsSummary = recordValue(mergeMetrics?.summary);
  const ledger = await readApplyLedgerHealth(dir);
  return {
    ...optionalNumberField(compact, 'activeJobs'),
    ...optionalNumberField(compact, 'usefulPatchCount'),
    ...optionalNumberField(compact, 'stalePatchCount'),
    ...optionalNumberField(compact, 'total'),
    ...mergeOptionalNumber('landed', maxDefinedNumber(numberFromRecord(compact, 'landedCount'), ledger.landed)),
    ...mergeOptionalNumber('applied', ledger.applied),
    ...mergeOptionalNumber('committed', ledger.committed),
    ...mergeOptionalNumber('skipped', ledger.skipped),
    ...mergeOptionalNumber('failed', ledger.failed),
    ...mergeOptionalNumber('mergeMetricEventCount', maxDefinedNumber(numberFromRecord(mergeMetricsSummary, 'eventCount'), numberFromRecord(mergeMetrics, 'eventCount'))),
    ...mergeOptionalNumber('mergeMetricCorrelatedRegionCount', numberFromRecord(mergeMetricsSummary, 'correlatedRegionCount')),
    ...mergeOptionalNumber('mergeMetricSuggestionCount', numberFromRecord(mergeMetricsSummary, 'suggestionCount')),
    ...mergeOptionalNumber('mergeMetricPreferredLeaseKeyCount', numberFromRecord(mergeMetricsSummary, 'preferredLeaseKeyCount')),
    ...mergeOptionalNumber('mergeMetricSplitTaskRegionKeyCount', numberFromRecord(mergeMetricsSummary, 'splitTaskRegionKeyCount'))
  };
}

export function targetHealth(
  kind: 'run' | 'collection',
  artifacts: UiArtifact[],
  collectionHealth: Partial<DetectedUiTarget>
): string {
  if (collectionHealth.failed && collectionHealth.failed > 0) return 'attention';
  if (collectionHealth.activeJobs && collectionHealth.activeJobs > 0) return 'active';
  if (collectionHealth.landed && collectionHealth.landed > 0) return 'landed';
  if (collectionHealth.usefulPatchCount && collectionHealth.usefulPatchCount > 0) return 'patches-ready';
  if (collectionHealth.mergeMetricSuggestionCount && collectionHealth.mergeMetricSuggestionCount > 0) return 'merge-feedback';
  if (kind === 'run' && artifacts.some((artifact) => artifact.role === 'active')) return 'active-artifacts';
  if (kind === 'collection') return 'collection-ready';
  return 'ready';
}

async function readApplyLedgerHealth(dir: string): Promise<{
  landed?: number;
  applied?: number;
  committed?: number;
  skipped?: number;
  failed?: number;
}> {
  for (const candidate of ['apply-ledger/apply-ledger.json', 'apply-ledger.json']) {
    const ledger = await safeReadJson(path.join(dir, candidate));
    if (!ledger) continue;
    const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
    const applied = entries.filter((entry) => isObject(entry) && entry.status === 'applied').length;
    const committed = entries.filter((entry) => isObject(entry) && entry.status === 'committed').length;
    const skipped = entries.filter((entry) => isObject(entry) && entry.status === 'skipped').length;
    const landed = entries.filter((entry) => isObject(entry) && (entry.status === 'applied' || entry.status === 'committed')).length;
    const failed = entries.filter((entry) => isObject(entry) && entry.status === 'failed').length;
    return {
      ...mergeOptionalNumber('landed', numberFromPath(ledger, ['summary', 'landed']) ?? landed),
      ...mergeOptionalNumber('applied', numberFromPath(ledger, ['summary', 'applied']) ?? applied),
      ...mergeOptionalNumber('committed', numberFromPath(ledger, ['summary', 'committed']) ?? committed),
      ...mergeOptionalNumber('skipped', numberFromPath(ledger, ['summary', 'skipped']) ?? skipped),
      ...mergeOptionalNumber('failed', numberFromPath(ledger, ['summary', 'failed']) ?? failed)
    };
  }
  return {};
}

async function safeReadJson(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function optionalNumberField(record: Record<string, unknown> | undefined, key: NumericUiTargetField): Partial<DetectedUiTarget> {
  return mergeOptionalNumber(key, numberFromRecord(record, key));
}

function mergeOptionalNumber(key: NumericUiTargetField, value: number | undefined): Partial<DetectedUiTarget> {
  return typeof value === 'number' ? { [key]: value } : {};
}

function numberFromRecord(record: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberFromPath(record: Record<string, unknown>, keys: string[]): number | undefined {
  let current: unknown = record;
  for (const key of keys) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return typeof current === 'number' && Number.isFinite(current) && current >= 0 ? Math.floor(current) : undefined;
}

function maxDefinedNumber(...values: Array<number | undefined>): number | undefined {
  const numbers = values.filter((value): value is number => typeof value === 'number');
  return numbers.length ? Math.max(...numbers) : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
