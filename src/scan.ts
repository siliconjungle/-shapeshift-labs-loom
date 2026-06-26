import fs from 'node:fs/promises';
import { rel, gitHead, nowIso, resolveRoot, sha256, writeJson } from './common.js';
import { readLoomConfig, readLoomIgnore } from './config.js';
import { listFiles, matchesAny } from './glob.js';
import { updateRef, writeLoomObject } from './store.js';
import type { LoomFileRecord, LoomGraph, LoomLanguage, LoomScanOptions, LoomSemanticSummary, LoomSyntax } from './types.js';

interface CompilerApi {
  importNativeSource?: (input: Record<string, unknown>) => unknown;
}

export async function scanLoomProject(options: LoomScanOptions = {}): Promise<{ ok: boolean; graph: LoomGraph }> {
  const root = resolveRoot(options.root);
  const config = await readLoomConfig(root);
  const ignored = await readLoomIgnore(root);
  const files = await collectSourceFiles(root);
  const compiler = config.frontier.semanticImport ? await loadCompiler() : undefined;
  let semanticFiles = 0;
  let semanticBytes = 0;
  const records: LoomFileRecord[] = [];

  for (const file of files) {
    const relative = rel(root, file);
    if (!matchesAny(relative, config.source.include)) continue;
    if (matchesAny(relative, [...config.source.exclude, ...ignored])) continue;
    const bytes = await fs.readFile(file);
    if (bytes.byteLength > config.source.maxFileBytes) continue;
    const sourceText = bytes.toString('utf8');
    const language = languageForPath(relative);
    const syntax = syntaxForPath(relative);
    const record: LoomFileRecord = {
      path: relative,
      language,
      syntax,
      bytes: bytes.byteLength,
      sha256: sha256(bytes)
    };
    if (shouldImportSemantic(language, config, semanticFiles, semanticBytes, bytes.byteLength)) {
      record.semantic = await importSemantic(compiler, language, relative, sourceText);
      semanticFiles += 1;
      semanticBytes += bytes.byteLength;
    }
    records.push(record);
  }

  const graph = createGraph(root, records, await gitHead(root));
  if (options.write !== false) {
    const graphObject = await writeLoomObject(root, 'graph', graph);
    graph.objectId = graphObject.id;
    await writeJson(`${root}/${config.generated.graph}/current.json`, graph);
    await writeJson(`${root}/.loom/index.json`, {
      kind: 'loom.index',
      version: 1,
      generatedAt: graph.generatedAt,
      graphObjectId: graphObject.id,
      entries: records
    });
    await writeJson(`${root}/${config.generated.objects}/source-index.json`, {
      kind: 'loom.sourceIndex',
      version: 1,
      generatedAt: graph.generatedAt,
      graphObjectId: graphObject.id,
      files: records
    });
    await updateRef(root, 'refs/graphs/current', graphObject.id, 'scan');
  }
  return { ok: true, graph };
}

export async function collectSourceFiles(root: string): Promise<string[]> {
  return listFiles(root);
}

function createGraph(root: string, files: LoomFileRecord[], head: string | undefined): LoomGraph {
  const languages: Record<string, number> = {};
  const syntaxes: Record<string, number> = {};
  for (const file of files) languages[file.language] = (languages[file.language] ?? 0) + 1;
  for (const file of files) syntaxes[file.syntax ?? file.language] = (syntaxes[file.syntax ?? file.language] ?? 0) + 1;
  return {
    kind: 'loom.graph',
    version: 1,
    generatedAt: nowIso(),
    root,
    gitHead: head,
    configPath: 'loom.json',
    summary: {
      files: files.length,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      languages,
      syntaxes,
      semanticImports: files.filter((file) => file.semantic?.ok).length,
      semanticSymbols: files.reduce((sum, file) => sum + (file.semantic?.symbols ?? 0), 0),
      semanticOwnershipRegions: files.reduce((sum, file) => sum + (file.semantic?.ownershipRegions ?? 0), 0),
      semanticPatchHints: files.reduce((sum, file) => sum + (file.semantic?.patchHints ?? 0), 0),
      semanticFailures: files.filter((file) => file.semantic && !file.semantic.ok).length
    },
    files
  };
}

function shouldImportSemantic(language: LoomLanguage, config: Awaited<ReturnType<typeof readLoomConfig>>, files: number, bytes: number, nextBytes: number): boolean {
  if (!config.frontier.semanticImport || language === 'unknown') return false;
  if (!config.source.languages.includes(language)) return false;
  if (files >= config.frontier.semanticImportMaxFiles) return false;
  return bytes + nextBytes <= config.frontier.semanticImportMaxBytes;
}

async function loadCompiler(): Promise<CompilerApi | undefined> {
  try {
    return await import('@shapeshift-labs/frontier-lang-compiler') as CompilerApi;
  } catch {
    return undefined;
  }
}

async function importSemantic(compiler: CompilerApi | undefined, language: LoomLanguage, sourcePath: string, sourceText: string): Promise<LoomSemanticSummary> {
  if (!compiler?.importNativeSource) return emptySemantic(false, 'frontier-lang-compiler unavailable');
  try {
    const result = compiler.importNativeSource({ language, sourcePath, sourceText }) as Record<string, unknown>;
    const index = objectRecord(result.semanticIndex);
    const metadata = objectRecord(result.metadata);
    const universalAst = objectRecord(result.universalAst);
    return {
      ok: true,
      importId: stringValue(result.id),
      readiness: stringValue(result.readiness) ?? stringValue(metadata.readiness),
      symbols: countRecords(index.symbols),
      ownershipRegions: countRecords(index.ownershipRegions ?? index.regions),
      patchHints: countRecords(index.patchHints ?? index.patchRecords),
      losses: countRecords(result.losses),
      sourceMapMappings: countSourceMapMappings(result.sourceMaps),
      universalAstId: stringValue(universalAst.id)
    };
  } catch (error) {
    return emptySemantic(false, error instanceof Error ? error.message : String(error));
  }
}

function emptySemantic(ok: boolean, message: string): LoomSemanticSummary {
  return { ok, symbols: 0, ownershipRegions: 0, patchHints: 0, losses: 0, sourceMapMappings: 0, message };
}

function countSourceMapMappings(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.reduce((sum, map) => sum + countRecords(objectRecord(map).mappings), 0);
}

function countRecords(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

export function languageForPath(file: string): LoomLanguage {
  if (/\.jsx$/.test(file)) return 'javascript';
  if (/\.tsx$/.test(file)) return 'typescript';
  if (/\.[cm]?js$/.test(file)) return 'javascript';
  if (/\.tsx?$/.test(file)) return 'typescript';
  if (/\.py$/.test(file)) return 'python';
  if (/\.rs$/.test(file)) return 'rust';
  if (/\.[ch]$/.test(file)) return 'c';
  if (/\.cs$/.test(file)) return 'csharp';
  if (/\.go$/.test(file)) return 'go';
  if (/\.java$/.test(file)) return 'java';
  if (/\.kt$/.test(file)) return 'kotlin';
  if (/\.swift$/.test(file)) return 'swift';
  if (/\.css$/.test(file)) return 'css';
  if (/\.html?$/.test(file)) return 'html';
  return 'unknown';
}

export function syntaxForPath(file: string): LoomSyntax {
  if (/\.jsx$/.test(file)) return 'jsx';
  if (/\.tsx$/.test(file)) return 'tsx';
  if (/\.[cm]?js$/.test(file)) return 'javascript';
  if (/\.ts$/.test(file)) return 'typescript';
  if (/\.py$/.test(file)) return 'python';
  if (/\.rs$/.test(file)) return 'rust';
  if (/\.[ch]$/.test(file)) return 'c';
  if (/\.cs$/.test(file)) return 'csharp';
  if (/\.go$/.test(file)) return 'go';
  if (/\.java$/.test(file)) return 'java';
  if (/\.kt$/.test(file)) return 'kotlin';
  if (/\.swift$/.test(file)) return 'swift';
  if (/\.css$/.test(file)) return 'css';
  if (/\.json$/.test(file)) return 'json';
  if (/\.html?$/.test(file)) return 'html';
  if (/\.svg$/.test(file)) return 'svg';
  if (/\.mdx?$/.test(file)) return 'markdown';
  if (/\.txt$/.test(file)) return 'text';
  return 'unknown';
}
