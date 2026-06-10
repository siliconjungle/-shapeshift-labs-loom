import type { LoomCommandResult, LoomGraph } from './types.js';

export function printResult(value: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (isGraph(value)) {
    printGraph(value);
    return;
  }
  if (isResult(value)) {
    process.stdout.write(`${value.ok ? 'ok' : 'error'}: ${value.message}\n`);
    printKnownFields(value);
    return;
  }
  process.stdout.write(`${String(value)}\n`);
}

function printGraph(graph: LoomGraph): void {
  const summary = graph.summary;
  process.stdout.write(`loom graph: ${summary.files} files, ${summary.bytes} bytes\n`);
  process.stdout.write(`semantic: ${summary.semanticImports} imported, ${summary.semanticFailures} failed\n`);
  process.stdout.write(`symbols: ${summary.semanticSymbols}, regions: ${summary.semanticOwnershipRegions}, hints: ${summary.semanticPatchHints}\n`);
}

function printKnownFields(result: LoomCommandResult): void {
  if (typeof result.path === 'string') process.stdout.write(`path: ${result.path}\n`);
  if (typeof result.objectId === 'string') process.stdout.write(`object: ${result.objectId}\n`);
  if (typeof result.ref === 'string') process.stdout.write(`ref: ${result.ref}\n`);
  if (result.graphSummary) process.stdout.write(`graph: ${JSON.stringify(result.graphSummary)}\n`);
  if (Array.isArray(result.missing)) process.stdout.write(`missing required: ${formatList(result.missing)}\n`);
  if (Array.isArray(result.optionalMissing)) process.stdout.write(`missing optional: ${formatList(result.optionalMissing)}\n`);
  if (Array.isArray(result.nativeCommands)) printCommandRows('native commands', result.nativeCommands);
  if (Array.isArray(result.delegates)) printDelegateRows(result.delegates);
  if (Array.isArray(result.added) || Array.isArray(result.changed) || Array.isArray(result.deleted)) {
    process.stdout.write(`added: ${arrayCount(result.added)}, changed: ${arrayCount(result.changed)}, deleted: ${arrayCount(result.deleted)}\n`);
  }
}

function isGraph(value: unknown): value is LoomGraph {
  return Boolean(value && typeof value === 'object' && (value as LoomGraph).kind === 'loom.graph');
}

function isResult(value: unknown): value is LoomCommandResult {
  return Boolean(value && typeof value === 'object' && typeof (value as LoomCommandResult).ok === 'boolean');
}

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function formatList(value: unknown[]): string {
  return value.length ? value.map(String).join(', ') : 'none';
}

function printCommandRows(title: string, rows: unknown[]): void {
  process.stdout.write(`${title}:\n`);
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    process.stdout.write(`- ${String(record.command)}: ${String(record.purpose ?? '')}\n`);
  }
}

function printDelegateRows(rows: unknown[]): void {
  process.stdout.write('delegates:\n');
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const state = record.available ? 'available' : 'missing';
    const required = record.required ? 'required' : 'optional';
    const version = record.version ? ` @ ${String(record.version)}` : '';
    process.stdout.write(`- ${String(record.command)}: ${state}, ${required}${version}\n`);
  }
}
