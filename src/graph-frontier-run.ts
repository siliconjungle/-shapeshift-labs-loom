import {
  parseRunEventsJsonl,
  replayRunEvents,
  type FrontierRunEvent
} from '@shapeshift-labs/frontier-run';
import { nowIso, resolveRoot } from './common.js';
import {
  FRONTIER_RUN_GRAPH_SOURCE,
  normalizeFrontierRunDecisionGraph,
  normalizeFrontierRunJobGraph
} from './graph-frontier-run-convert.js';
import {
  createFrontierRunPanelRecords,
  summarizeFrontierRunTypedCounts,
  toFrontierRunJsonValue,
  uniqueFrontierRunStrings
} from './graph-frontier-run-records.js';
import type {
  LoomFrontierRunImportOptions,
  LoomRunGraph
} from './types.js';

export { FRONTIER_RUN_GRAPH_SOURCE } from './graph-frontier-run-convert.js';

export function parseFrontierRunEventsInput(text: string): FrontierRunEvent[] {
  return parseRunEventsJsonl(text);
}

export function normalizeFrontierRunEvents(
  input: readonly FrontierRunEvent[],
  options: LoomFrontierRunImportOptions = {}
): LoomRunGraph {
  const projection = replayRunEvents(input);
  const root = resolveRoot(options.root);
  const run = projection.run;
  const outputRunId = options.runId ?? run.id;
  const graph = normalizeFrontierRunJobGraph(run.graph);
  const decisionGraph = normalizeFrontierRunDecisionGraph(projection);
  const typedCounts = summarizeFrontierRunTypedCounts(decisionGraph);
  const panels = createFrontierRunPanelRecords(decisionGraph);
  const eventTypes = uniqueFrontierRunStrings(projection.events.map((event) => event.type));
  return {
    kind: 'loom.run-graph',
    version: 1,
    generatedAt: run.updatedAt || nowIso(),
    root,
    runId: outputRunId,
    source: FRONTIER_RUN_GRAPH_SOURCE,
    sourceKind: FRONTIER_RUN_GRAPH_SOURCE,
    sourceMetadata: {
      kind: FRONTIER_RUN_GRAPH_SOURCE,
      artifactKind: 'frontier.run.events',
      artifactId: run.id,
      ...(options.sourcePath ? { path: options.sourcePath } : {}),
      importedAt: nowIso(),
      eventCount: projection.events.length,
      eventTypes
    },
    summary: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      roots: graph.roots.length,
      leaves: graph.leaves.length,
      issues: graph.issues.length,
      ...(Object.keys(typedCounts).length ? { typedCounts } : {})
    },
    graph,
    decisionGraph,
    ...(panels.length ? { projections: { panels } } : {}),
    metadata: {
      frontierRun: toFrontierRunJsonValue({
        id: run.id,
        goal: run.goal,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        refs: run.refs,
        heads: run.heads,
        eventCount: projection.events.length,
        nodeCount: Object.keys(run.graph.nodes).length,
        edgeCount: Object.keys(run.graph.edges).length,
        metadata: run.metadata
      })
    }
  };
}
