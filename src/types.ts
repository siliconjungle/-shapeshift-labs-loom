export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type LoomLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'rust'
  | 'c'
  | 'csharp'
  | 'go'
  | 'java'
  | 'kotlin'
  | 'swift'
  | 'unknown';

export type LoomSyntax =
  | LoomLanguage
  | 'jsx'
  | 'tsx'
  | 'css'
  | 'json'
  | 'html'
  | 'svg'
  | 'markdown'
  | 'text';

export interface LoomConfig {
  kind: 'loom.config';
  version: 1;
  name: string;
  root: string;
  source: LoomSourceConfig;
  generated: LoomGeneratedConfig;
  frontier: LoomFrontierConfig;
}

export interface LoomSourceConfig {
  include: string[];
  exclude: string[];
  languages: LoomLanguage[];
  maxFileBytes: number;
}

export interface LoomGeneratedConfig {
  dir: string;
  graph: string;
  objects: string;
  refs: string;
  logs: string;
  info: string;
  hooks: string;
  runs: string;
  queues: string;
  evidence: string;
  projections: string;
  locks: string;
}

export interface LoomFrontierConfig {
  semanticImport: boolean;
  semanticImportMaxFiles: number;
  semanticImportMaxBytes: number;
}

export interface LoomFileRecord {
  path: string;
  language: LoomLanguage;
  syntax?: LoomSyntax;
  bytes: number;
  sha256: string;
  semantic?: LoomSemanticSummary;
}

export interface LoomSemanticSummary {
  ok: boolean;
  importId?: string;
  readiness?: string;
  symbols: number;
  ownershipRegions: number;
  patchHints: number;
  losses: number;
  sourceMapMappings: number;
  universalAstId?: string;
  message?: string;
}

export interface LoomGraph {
  kind: 'loom.graph';
  version: 1;
  generatedAt: string;
  root: string;
  gitHead?: string;
  configPath: string;
  summary: LoomGraphSummary;
  objectId?: string;
  files: LoomFileRecord[];
}

export interface LoomGraphSummary {
  files: number;
  bytes: number;
  languages: Record<string, number>;
  syntaxes?: Record<string, number>;
  semanticImports: number;
  semanticSymbols: number;
  semanticOwnershipRegions: number;
  semanticPatchHints: number;
  semanticFailures: number;
}

export interface LoomRunGraph {
  kind: 'loom.run-graph';
  version: 1;
  generatedAt: string;
  root: string;
  runId?: string;
  planId?: string;
  source?: string;
  summary: LoomRunGraphSummary;
  graph: LoomRunJobGraph;
  metadata?: Record<string, JsonValue>;
}

export interface LoomRunGraphSummary {
  nodes: number;
  edges: number;
  roots: number;
  leaves: number;
  issues: number;
}

export interface LoomRunJobGraph {
  nodes: string[];
  edges: LoomRunGraphEdge[];
  dependentsByJobId: Record<string, string[]>;
  dependenciesByJobId: Record<string, string[]>;
  roots: string[];
  leaves: string[];
  issues: LoomRunGraphIssue[];
}

export interface LoomRunGraphEdge {
  from: string;
  to: string;
  type: 'depends-on' | 'parent-task' | string;
}

export interface LoomRunGraphIssue {
  code: string;
  message: string;
  severity?: 'info' | 'warning' | 'error' | string;
  path?: string;
  [key: string]: JsonValue | undefined;
}

export interface LoomRunGraphOptions {
  root?: string;
  runId?: string;
}

export interface LoomInitOptions {
  root?: string;
  name?: string;
  include?: string[];
  exclude?: string[];
  languages?: LoomLanguage[];
  force?: boolean;
}

export interface LoomScanOptions {
  root?: string;
  write?: boolean;
}

export interface LoomCommandResult {
  ok: boolean;
  message: string;
  path?: string;
  [key: string]: unknown;
}

export interface LoomSnapshotOptions {
  root?: string;
  message?: string;
}
