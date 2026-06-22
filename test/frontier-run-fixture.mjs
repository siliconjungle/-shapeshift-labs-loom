export function createFrontierRunEventsFixture(frontierRun) {
  const runId = 'frontier-run-demo';
  const actorId = 'loom-smoke';
  const startedAt = new Date(0).toISOString();
  const finishedAt = new Date(1000).toISOString();
  let actorSeq = 1;
  const created = frontierRun.createRunEvent({
    runId,
    actorId,
    actorSeq: actorSeq++,
    time: startedAt,
    type: 'run.created',
    payload: { goal: 'Loom frontier-run import smoke', metadata: { source: 'loom-smoke' } }
  });
  const lane = frontierRun.createRunNodeEvent(runId, actorId, actorSeq++, frontierRun.defineRunLane({
    id: 'lane:runtime',
    title: 'runtime',
    status: 'ready',
    createdAt: startedAt,
    updatedAt: startedAt
  }), { parents: [created.id], time: startedAt });
  const task = frontierRun.createRunNodeEvent(runId, actorId, actorSeq++, frontierRun.defineRunTask({
    id: 'task:demo',
    title: 'Demo task',
    laneId: 'lane:runtime',
    status: 'running',
    targetRefs: ['src/demo.ts'],
    allowedWrites: ['src/demo.ts'],
    createdAt: startedAt,
    updatedAt: startedAt
  }), { parents: [lane.id], time: startedAt });
  const attempt = frontierRun.createRunNodeEvent(runId, actorId, actorSeq++, frontierRun.defineRunAttempt({
    id: 'attempt:demo',
    title: 'Demo worker',
    taskId: 'task:demo',
    actorId,
    status: 'completed',
    startedAt,
    endedAt: finishedAt,
    model: 'gpt-5.5',
    metadata: { jobId: 'job-demo', lane: 'runtime' }
  }), { parents: [task.id], time: finishedAt });
  const patch = frontierRun.createRunNodeEvent(runId, actorId, actorSeq++, frontierRun.defineRunPatch({
    id: 'patch:demo',
    title: 'Demo patch',
    changedPaths: ['src/demo.ts'],
    summary: 'Demo patch',
    risk: 'low',
    metadata: { jobId: 'job-demo', taskId: 'task:demo', lane: 'runtime' }
  }), { parents: [attempt.id], time: finishedAt });
  const patchEdge = frontierRun.createRunEdgeEvent(runId, actorId, actorSeq++, frontierRun.linkRunNodes(
    'attempt:demo',
    'patch:demo',
    'produces-patch',
    { createdAt: finishedAt }
  ), { parents: [patch.id], time: finishedAt });
  const evidence = frontierRun.createRunNodeEvent(runId, actorId, actorSeq++, frontierRun.defineRunEvidence({
    id: 'evidence:demo',
    title: 'Smoke evidence',
    evidenceType: 'json',
    result: 'pass',
    summary: 'Smoke evidence passed',
    metadata: { jobId: 'job-demo', taskId: 'task:demo', lane: 'runtime' }
  }), { parents: [patchEdge.id], time: finishedAt });
  const evidenceEdge = frontierRun.createRunEdgeEvent(runId, actorId, actorSeq++, frontierRun.linkRunNodes(
    'attempt:demo',
    'evidence:demo',
    'produces-evidence',
    { createdAt: finishedAt }
  ), { parents: [evidence.id], time: finishedAt });
  const verification = frontierRun.createRunNodeEvent(runId, actorId, actorSeq++, frontierRun.defineRunVerification({
    id: 'verification:demo',
    title: 'npm test',
    status: 'passed',
    command: 'npm',
    args: ['test'],
    exitCode: 0,
    required: true,
    metadata: { jobId: 'job-demo', taskId: 'task:demo', lane: 'runtime' }
  }), { parents: [evidenceEdge.id], time: finishedAt });
  const verificationEdge = frontierRun.createRunEdgeEvent(runId, actorId, actorSeq++, frontierRun.linkRunNodes(
    'attempt:demo',
    'verification:demo',
    'verified-by',
    { createdAt: finishedAt }
  ), { parents: [verification.id], time: finishedAt });
  const decision = frontierRun.createRunEvent({
    runId,
    actorId,
    actorSeq: actorSeq++,
    parents: [verificationEdge.id],
    time: finishedAt,
    type: 'decision.recorded',
    payload: {
      decision: frontierRun.defineRunDecision({
        id: 'decision:demo',
        title: 'Apply demo patch',
        decision: 'apply',
        subjectIds: ['patch:demo'],
        actorId,
        reason: 'smoke test',
        requiredActions: [],
        metadata: { jobId: 'job-demo', taskId: 'task:demo', lane: 'runtime' }
      })
    }
  });
  return [created, lane, task, attempt, patch, patchEdge, evidence, evidenceEdge, verification, verificationEdge, decision];
}
