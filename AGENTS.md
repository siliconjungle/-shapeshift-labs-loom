# Loom Agent Notes

Loom is the semantic collaboration CLI over Frontier Lang, Frontier Swarm, and Frontier Framework. Use it as the first coordination surface when working on generic swarm, semantic merge, or cross-language projection flows.

## CLI Workflow

- Verify the installed delegate surface before broad work:
  - `loom doctor`
  - `loom capabilities --json`
- Initialize only when a repo does not already have a Loom config:
  - `loom init --name <project-name> --source "src/**/*.ts" --source "test/**/*.mjs" --source "AGENTS.md"`
- Keep `loom.json` and `.loomignore` reviewable. Keep `.loom/` local and ignored because it stores generated semantic graph/evidence objects.
- Use bounded semantic scans before swarm runs:
  - `loom scan --json`
  - `loom diff --json`
  - `loom snapshot` when the graph is stable enough to checkpoint.
- Use Loom delegates for swarm orchestration:
  - `loom swarm plan ...`
  - `loom swarm run ... --semantic-import --semantic-import-expected`
  - `loom swarm collect ... --semantic-import-expected`
  - `loom swarm query ...`
  - `loom swarm score ...`

## Semantic Merge Policy

- Semantic edit-script admission is review acceleration, not a correctness proof.
- Auto-merge candidates must still apply cleanly and pass the declared checks before being treated as accepted.
- Prefer JS/TS semantic sidecars for ownership regions, changed symbols, edit-script status, and merge-readiness classification.
- If Loom delegates resolve stale package versions, update Loom's pinned dependencies and republish before running a serious swarm wave.
