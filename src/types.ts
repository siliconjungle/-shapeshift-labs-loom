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
  | 'css'
  | 'html'
  | 'unknown';

export type LoomSyntax =
  | LoomLanguage
  | 'jsx'
  | 'tsx'
  | 'json'
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
  sourceKind?: LoomRunGraphSourceKind;
  sourceMetadata?: LoomRunGraphSourceMetadata;
  summary: LoomRunGraphSummary;
  graph: LoomRunJobGraph;
  decisionGraph?: LoomDecisionGraph;
  projections?: LoomRunGraphProjections;
  metadata?: Record<string, JsonValue>;
}

export type LoomRunGraphSourceKind = 'loom-native' | 'frontier-run' | string;

export interface LoomRunGraphSourceMetadata {
  kind: LoomRunGraphSourceKind;
  artifactKind?: string;
  artifactId?: string;
  path?: string;
  runDir?: string;
  outDir?: string;
  importedAt?: string;
  eventCount?: number;
  eventTypes?: string[];
  [key: string]: JsonValue | undefined;
}

export type LoomDecisionGraphNodeKind =
  | 'intent'
  | 'task'
  | 'worker'
  | 'candidate'
  | 'evidence'
  | 'gate'
  | 'decision'
  | 'merge'
  | 'panel'
  | 'replay'
  | 'rsi'
  | 'semantic-change'
  | 'tournament'
  | (string & {});

export type LoomDecisionGraphEdgeKind =
  | 'contains'
  | 'depends-on'
  | 'dependsOn'
  | 'parent-task'
  | 'assigned-to'
  | 'produces'
  | 'verifies'
  | 'conflictsWith'
  | 'uses'
  | 'blocks'
  | 'unblocks'
  | 'approves'
  | 'rejects'
  | 'supersedes'
  | 'competes-with'
  | 'selects'
  | 'merges'
  | 'mergesInto'
  | 'replays'
  | 'improves'
  | 'derived-from'
  | (string & {});

export type LoomDecisionGraphRecordStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'blocked'
  | 'completed'
  | 'skipped'
  | 'accepted'
  | 'rejected'
  | (string & {});

export type LoomDecisionGraphRecordKind =
  | 'loom.decision-graph.evidence'
  | 'loom.decision-graph.gate'
  | 'loom.decision-graph.semantic-change'
  | 'loom.decision-graph.merge-candidate'
  | 'loom.decision-graph.tournament'
  | 'loom.decision-graph.panel'
  | 'loom.decision-graph.panel-projection'
  | 'loom.decision-graph.patch-event'
  | 'loom.decision-graph.replay'
  | 'loom.decision-graph.improvement-loop'
  | (string & {});

export type LoomMergeAdmissionStatus =
  | 'safe'
  | 'safe-with-losses'
  | 'review-required'
  | 'blocked'
  | (string & {});

export type LoomMergeAdmissionReasonCode =
  | 'missing-sidecar'
  | 'empty-sidecar'
  | 'stale-source-hash'
  | 'symbol-conflict'
  | 'effect-conflict'
  | 'lossy-import'
  | 'tests-missing'
  | (string & {});

export interface LoomDecisionGraph {
  kind: 'loom.decision-graph';
  version: 1;
  generatedAt: string;
  nodes: LoomDecisionGraphNode[];
  edges: LoomDecisionGraphEdge[];
  events: LoomDecisionGraphEvent[];
  snapshots: LoomDecisionGraphSnapshot[];
  indexes?: LoomDecisionGraphIndexes;
  records?: LoomDecisionGraphRecord[];
  metadata?: Record<string, JsonValue>;
}

export interface LoomDecisionGraphNode {
  id: string;
  kind: LoomDecisionGraphNodeKind;
  label?: string;
  sourceKind?: string;
  taskId?: string;
  jobId?: string;
  lane?: string;
  workerId?: string;
  candidateId?: string;
  model?: string;
  computeId?: string;
  modelTier?: string;
  bucket?: string;
  status?: LoomDecisionGraphRecordStatus;
  outcome?: string;
  path?: string;
  createdAt?: string;
  updatedAt?: string;
  refs?: Record<string, string>;
  data?: Record<string, JsonValue>;
}

export interface LoomDecisionGraphEdge {
  id: string;
  kind: LoomDecisionGraphEdgeKind;
  from: string;
  to: string;
  label?: string;
  sourceKind?: string;
  createdAt?: string;
  data?: Record<string, JsonValue>;
}

export interface LoomDecisionGraphEvent {
  kind: 'loom.decision-graph.event';
  version: 1;
  id: string;
  type: string;
  generatedAt: string;
  runId?: string;
  taskId?: string;
  jobId?: string;
  lane?: string;
  status?: LoomDecisionGraphRecordStatus;
  outcome?: string;
  nodeIds?: string[];
  edgeIds?: string[];
  nodes?: LoomDecisionGraphNode[];
  edges?: LoomDecisionGraphEdge[];
  data?: Record<string, JsonValue>;
}

export interface LoomDecisionGraphSnapshot {
  kind: 'loom.decision-graph.snapshot';
  version: 1;
  id: string;
  generatedAt: string;
  label?: string;
  nodeIds: string[];
  edgeIds: string[];
  eventIds: string[];
  summary: LoomDecisionGraphSnapshotSummary;
  data?: Record<string, JsonValue>;
}

export interface LoomDecisionGraphSnapshotSummary {
  nodes: number;
  edges: number;
  events: number;
  records?: number;
}

export interface LoomDecisionGraphIndexes {
  byNodeKind: Record<string, string[]>;
  byEdgeKind: Record<string, string[]>;
  byTaskId?: Record<string, string[]>;
  byJobId?: Record<string, string[]>;
  byLane?: Record<string, string[]>;
}

export interface LoomDecisionGraphRecordBase {
  id: string;
  kind: LoomDecisionGraphRecordKind;
  nodeId?: string;
  taskId?: string;
  jobId?: string;
  lane?: string;
  label?: string;
  status?: LoomDecisionGraphRecordStatus;
  createdAt?: string;
  updatedAt?: string;
  refs?: Record<string, string>;
  data?: Record<string, JsonValue>;
}

export type LoomEvidenceKind =
  | 'command'
  | 'test'
  | 'browser'
  | 'fuzz'
  | 'oracle'
  | 'artifact'
  | 'benchmark'
  | (string & {});

export interface LoomEvidenceRecord extends LoomDecisionGraphRecordBase {
  kind: 'loom.decision-graph.evidence';
  evidenceKind?: LoomEvidenceKind;
  artifactKind?: string;
  path?: string;
  sha256?: string;
  sizeBytes?: number;
  producerNodeId?: string;
  consumerNodeIds?: string[];
}

export interface LoomGateRecord extends LoomDecisionGraphRecordBase {
  kind: 'loom.decision-graph.gate';
  gateId?: string;
  gateKind?: 'test' | 'build' | 'lint' | 'semantic-admission' | 'merge-admission' | (string & {});
  command?: string;
  required?: boolean;
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
  evidenceIds?: string[];
}

export interface LoomSemanticChangeRecord extends LoomDecisionGraphRecordBase {
  kind: 'loom.decision-graph.semantic-change';
  changeId?: string;
  symbolId?: string;
  declarationKind?: string;
  sourceSpan?: LoomSourceSpan;
  operation?: 'add' | 'update' | 'delete' | 'move' | 'rename' | 'unknown' | (string & {});
  confidence?: number;
  conflictReason?: LoomMergeAdmissionReasonCode | string;
  files?: string[];
  symbols?: string[];
  ownershipRegionIds?: string[];
  editScriptStatus?: string;
  mergeReadiness?: string;
  patchId?: string;
}

export interface LoomMergeCandidateRecord extends LoomDecisionGraphRecordBase {
  kind: 'loom.decision-graph.merge-candidate';
  candidateId?: string;
  sourceNodeId?: string;
  admissionStatus?: LoomMergeAdmissionStatus;
  admissionReasonCodes?: LoomMergeAdmissionReasonCode[];
  score?: number;
  disposition?: string;
  patchPath?: string;
  bundlePath?: string;
  evidenceIds?: string[];
  gateIds?: string[];
  semanticChangeIds?: string[];
}

export interface LoomTournamentRecord extends LoomDecisionGraphRecordBase {
  kind: 'loom.decision-graph.tournament';
  candidateIds?: string[];
  candidates?: LoomTournamentCandidateRecord[];
  winnerCandidateId?: string;
  criteria?: string[];
  rounds?: number;
}

export interface LoomTournamentCandidateRecord {
  id: string;
  label?: string;
  model?: string;
  score?: number;
  rank?: number;
  selected?: boolean;
  data?: Record<string, JsonValue>;
}

export interface LoomPanelRecord extends LoomDecisionGraphRecordBase {
  kind: 'loom.decision-graph.panel';
  reviewerIds?: string[];
  decisionIds?: string[];
  quorum?: number;
  result?: string;
}

export type LoomPanelProjectionKind =
  | 'intent'
  | 'decomposition'
  | 'tournament'
  | 'performance'
  | 'evidence'
  | 'merge'
  | 'rsi'
  | (string & {});

export interface LoomPanelProjectionRecord extends LoomDecisionGraphRecordBase {
  kind: 'loom.decision-graph.panel-projection';
  panelKind: LoomPanelProjectionKind;
  sourceNodeIds?: string[];
  sourceEdgeIds?: string[];
  queryRef?: string;
  layoutRef?: string;
}

export interface LoomPatchEventRecord extends LoomDecisionGraphRecordBase {
  kind: 'loom.decision-graph.patch-event';
  eventId?: string;
  operation?: string;
  path?: string;
  basis?: string;
  nextBasis?: string;
  patchPath?: string;
  actor?: string;
  occurredAt?: string;
  result?: string;
}

export interface LoomReplayRecord extends LoomDecisionGraphRecordBase {
  kind: 'loom.decision-graph.replay';
  sourceRunId?: string;
  targetRunId?: string;
  eventIds?: string[];
  snapshotIds?: string[];
  result?: string;
}

export interface LoomImprovementLoopRecord extends LoomDecisionGraphRecordBase {
  kind: 'loom.decision-graph.improvement-loop';
  loopId?: string;
  iteration?: number;
  objective?: string;
  trigger?: string;
  inputCandidateIds?: string[];
  outputCandidateIds?: string[];
  acceptedChangeIds?: string[];
}

export type LoomDecisionGraphRecord =
  | LoomEvidenceRecord
  | LoomGateRecord
  | LoomSemanticChangeRecord
  | LoomMergeCandidateRecord
  | LoomTournamentRecord
  | LoomPanelRecord
  | LoomPanelProjectionRecord
  | LoomPatchEventRecord
  | LoomReplayRecord
  | LoomImprovementLoopRecord;

export type LoomRunGraphTypedNode = LoomDecisionGraphNode;
export type LoomRunGraphTypedEdge = LoomDecisionGraphEdge;
export type LoomRunGraphEvent = LoomDecisionGraphEvent;
export type LoomRunGraphSnapshot = LoomDecisionGraphSnapshot;

export interface LoomSourceSpan {
  file: string;
  start: number;
  end: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

export interface LoomRunGraphSummary {
  nodes: number;
  edges: number;
  roots: number;
  leaves: number;
  issues: number;
  typedCounts?: LoomRunGraphTypedCounts;
}

export interface LoomRunGraphTypedCounts {
  intents?: number;
  tasks?: number;
  workers?: number;
  candidates?: number;
  evidence?: number;
  gates?: number;
  decisions?: number;
  merges?: number;
  replay?: number;
  panels?: number;
  tournaments?: number;
  rsiLoops?: number;
  semanticChanges?: number;
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

export interface LoomRunGraphProjections {
  panels?: LoomPanelProjectionRecord[];
  chunks?: LoomRunGraphChunkTemplate[];
}

export type LoomRunGraphChunkKind =
  | 'chain'
  | 'fork'
  | 'join'
  | 'barrier'
  | 'race-select'
  | 'tournament'
  | 'synthesis'
  | 'verification-gate'
  | 'merge-gate'
  | 'retry-loop'
  | 'rsi-loop';

export interface LoomRunGraphChunkTemplate {
  kind: 'loom.run-graph.chunk-template';
  version: 1;
  id: string;
  chunkKind: LoomRunGraphChunkKind;
  nodes: string[];
  edges: LoomRunGraphEdge[];
  entryNodes: string[];
  exitNodes: string[];
  roles: Record<string, string[]>;
  metadata?: Record<string, JsonValue>;
}

export interface LoomRunGraphChunkTemplateSet {
  kind: 'loom.run-graph.chunk-templates';
  version: 1;
  chunks: LoomRunGraphChunkTemplate[];
}

export interface LoomRunGraphChunkCommonOptions {
  id?: string;
  edgeType?: string;
  metadata?: Record<string, JsonValue>;
}

export interface LoomRunGraphOptions {
  root?: string;
  runId?: string;
}

export interface LoomFrontierRunImportOptions extends LoomRunGraphOptions {
  sourcePath?: string;
}

export interface LoomRunGraphImportResult extends LoomCommandResult {
  runId: string;
  present: boolean;
  source: string;
  sourceKind: LoomRunGraphSourceKind;
  graphSummary: LoomRunGraphSummary;
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
