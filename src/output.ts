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
