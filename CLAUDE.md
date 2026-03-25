# Claude Code Configuration — AQB (Agentic Quality Benchmark)

## Project Overview

AQB is a multi-domain benchmark for evaluating AI-powered quality engineering agents.
It measures how well QE agents find bugs, generate tests, and assess quality across
**14 QE domains** with **1,680+ labeled samples**, a standardized evaluation harness,
and metrics designed specifically for agentic systems.

- **Repository**: `agentic-quality-benchmark/agentic-quality-benchmark`
- **License**: Code = MIT, Data = CC BY 4.0
- **Corpus**: `corpus/v0.1/` (public) + `corpus/held-out/` (30% held-out for leaderboard)
- **Harness**: `harness/` — TypeScript package `@aqb/harness`
- **Proposal**: `docs/proposal.md` — full design spec

## Three-Layer Architecture

```
Layer 3: Agentic Behavior — learning transfer, swarm coordination, fabrication detection
Layer 2: Evaluation Harness — Dockerized runner, matcher, metrics, adapters
Layer 1: Seeded Defect Corpus — 1,680+ labeled samples, 14 domains, 5 languages
```

## 14 QE Domains

| # | Domain | Key Metric | Corpus Source |
|---|--------|------------|---------------|
| 1 | `security` | Recall@CWE-Top25 | Juliet + SastBench |
| 2 | `defects` | AUC-ROC | Defects4J + BugsInPy |
| 3 | `test-generation` | Mutation Score | TestGenEval |
| 4 | `coverage-analysis` | Gap Detection Accuracy | Synthetic + LCOV |
| 5 | `quality` | Expert Agreement | Expert-rated |
| 6 | `requirements` | Ambiguity F1 | Synthetic + real specs |
| 7 | `code-intelligence` | Impact Prediction F1 | Annotated repos |
| 8 | `contracts` | Breaking Change F1 | API version pairs |
| 9 | `accessibility` | WCAG Violation Recall | axe-core fixtures |
| 10 | `performance` | Latency Prediction | Profiled apps |
| 11 | `chaos-resilience` | Fault Detection Rate | Microservices |
| 12 | `enterprise-integration` | Protocol Compliance | WSDL/SAP/Kafka |
| 13 | `flaky-tests` | Detection Recall | iDFlakies |
| 14 | `visual-regression` | Change Detection F1 | Screenshot pairs |

Plus: **fabrication-stress-test** (~100 clean code samples) and **composite-scenarios** (~30 E2E)

## Behavioral Rules (Always Enforced)

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary for achieving the goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (*.md) unless explicitly requested
- NEVER save working files, text/mds, or tests to the root folder
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files

## File Organization

- NEVER save to root folder — use the directories below
- `harness/src/` — harness source code (types, matcher, metrics, adapters, CLI, runner)
- `harness/src/adapters/` — tool adapter implementations
- `corpus/v0.1/` — public corpus samples by domain
- `corpus/held-out/` — held-out test set (never published)
- `docs/` — documentation and ADRs (`docs/adr/`)
- `tests/` — test files
- `config/` — configuration files
- `scripts/` — utility and data-sourcing scripts
- `results/` — evaluation results by tool
- `leaderboard/` — leaderboard data
- `docker/` — Dockerfiles for tool adapters

## Project Architecture

- Follow Domain-Driven Design with bounded contexts
- Keep files under 500 lines
- Use typed interfaces for all public APIs (see `harness/src/types.ts`)
- Prefer TDD London School (mock-first) for new code
- Ensure input validation at system boundaries
- ADRs live in `docs/adr/` — follow WH(Y) enhanced format (see ADR-001)

### Key Types (harness/src/types.ts)

- `Domain` — 14 QE domain string literals
- `CorpusSample` — labeled sample with files + ground truth
- `Finding` — what a tool reports (domain, category, severity, location)
- `AQBToolAdapter` — interface adapters must implement (`analyze(sample) → Finding[]`)
- `AQBResult` — full evaluation result with matches + metrics
- `AgenticMetrics` — learning transfer, multi-agent, explanation quality, etc.
- `Scorecard` — aggregate evaluation scorecard

### Matching Algorithm (harness/src/matcher.ts)

- Same file path (normalized)
- Line range overlap >= 50% (or within ±5 lines for single-line issues)
- Domain match + category match (with CWE alias support)
- Partial match counted as 0.5 TP

### Metrics (harness/src/metrics.ts)

- Standard: precision, recall, F1, FPR, fabrication rate
- Severity-weighted recall (critical=3x, high=2x)
- Cost efficiency: findings per dollar
- Per-domain, per-difficulty, per-language breakdowns

## Build & Test

```bash
cd harness
npm install
npm run build        # TypeScript → dist/
npm test -- --run    # Vitest (ALWAYS use --run flag)
npm run lint         # ESLint
npm run validate-corpus   # Validate corpus labels
npx aqb run --adapter <name> --corpus ../corpus/v0.1  # Run evaluation
```

- ALWAYS run tests after making code changes
- ALWAYS verify build succeeds before committing
- NEVER run `npm test` without `--run` flag (watch mode risk)

## Corpus Sample Schema

Every sample requires:
```json
{
  "id": "domain-category-NNN",
  "domain": "<one of 14 domains>",
  "category": "subcategory",
  "language": "typescript|python|java|go|other",
  "difficulty": 1-5,
  "files": [{ "path": "...", "content": "..." }],
  "ground_truth": {
    "issues": [{ "type": "CWE-89", "severity": "critical", "location": {...}, "description": "...", "fix_available": true }],
    "false_positives": [{ "location": {...}, "reason": "..." }]
  },
  "metadata": {
    "source": "cve-id or synthetic",
    "sourcing_method": "real_cve|historical_bugfix|mutation_seeded|synthetic|adversarial_negative",
    "human_verified": true,
    "verification_date": "YYYY-MM-DD",
    "verified_by": ["handle1", "handle2"]
  }
}
```

**Quality requirements:**
- Every sample verified by >= 2 reviewers
- Adversarial negatives >= 20% of each domain
- Difficulty rated independently

## Adapter Development

Tool adapters implement `AQBToolAdapter` in `harness/src/adapters/`:
```typescript
export interface AQBToolAdapter {
  name: string;
  version: string;
  analyze(sample: CorpusSample): Promise<Finding[]>;
  setup?(): Promise<void>;
  teardown?(): Promise<void>;
}
```

Built-in adapters to implement: `aqe`, `semgrep`, `eslint`, `sonarqube`, `codeql`, `axe`, `llm-raw`

## ADR Format (WH(Y) Enhanced)

All ADRs use the WH(Y) enhanced format with structured decision statements:

```markdown
# ADR-NNN: Title

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-NNN |
| **Initiative** | Short name |
| **Proposed By** | Architecture Team |
| **Date** | YYYY-MM-DD |
| **Status** | Proposed / Accepted / Superseded |

---

## ADR (WH(Y) Statement format)

**In the context of** [situation],
**facing** [problem],
**we decided for** [decision],
**and neglected** [alternatives],
**to achieve** [goals],
**accepting that** [trade-offs].

---

## Problem Statement
## Opportunity
## Summary
## Options Considered
## Consequences (Positive / Negative / Risks)
## Governance
## Status History
## Dependencies
## References
```

## Security Rules

- NEVER hardcode API keys, secrets, or credentials in source files
- NEVER commit .env files or any file containing secrets
- Always validate user input at system boundaries
- Always sanitize file paths to prevent directory traversal
- Corpus samples must not contain real credentials (sanitize before committing)

## Critical Policies

### Integrity Rule (ABSOLUTE)
- NO shortcuts, fake data, or false claims
- ALWAYS implement properly, verify before claiming success
- ALWAYS run actual tests, not assume they pass
- Corpus labels MUST be accurate — mislabeled data ruins the benchmark

### Data Protection
- NEVER run `rm -f` on `corpus/` or `*.db` files without confirmation
- ALWAYS backup before destructive operations
- The held-out set (`corpus/held-out/`) must NEVER be leaked or published

### Git Operations
- NEVER auto-commit/push without explicit user request
- ALWAYS wait for user confirmation before git operations

## Concurrency Rules

- All operations MUST be concurrent/parallel in a single message
- ALWAYS batch ALL file reads/writes/edits in ONE message
- ALWAYS batch ALL Bash commands in ONE message
- ALWAYS use `run_in_background: true` for agent Task calls
- After spawning, STOP — do NOT poll or check status

## Task Tracking with Beads

This project uses **Beads** (`bd`) for structured task tracking with dependency-aware work queues.
Beads is initialized in stealth mode (local `.beads/` directory, not committed to repo).

### Essential Commands

```bash
export PATH="$HOME/.local/bin:$PATH"  # Ensure bd is on PATH

bd ready                    # What can I work on now? (no open blockers)
bd list                     # All issues with hierarchy
bd show <id>                # Full details of an issue
bd update <id> --claim      # Claim a task (sets assignee + in_progress)
bd close <id> --reason "Done: brief description"  # Complete a task
bd dep tree <id>            # View dependency tree
bd create "Title" -p 1 -t task --parent <epic-id>  # Create subtask
```

### Workflow Rules

- ALWAYS run `bd ready` at session start to find actionable work
- ALWAYS `bd update <id> --claim` before starting a task
- ALWAYS `bd close <id> --reason "..."` when done
- Use `bd dep add <child> <parent> --type blocks` for blocking dependencies
- Use `--json` flag when consuming output programmatically
- If you discover new work while implementing, use `bd create` with `--parent` to track it

### Epic IDs (for reference)

| ID | Epic |
|----|------|
| `kbu` | Shared Kernel & Core Types |
| `62a` | Corpus Management |
| `b4m` | Evaluation Engine |
| `92d` | Adapter Layer |
| `d9l` | Matching Engine |
| `6aj` | Metrics & Scoring |
| `69y` | Agentic Evaluation |
| `m6k` | Leaderboard & Results |
| `6z7` | CLI & API Gateway |
| `iuj` | CI/CD Pipeline |
| `189` | Testing Strategy |

## Agentic QE v3 Integration

This project uses **Agentic QE v3** for quality engineering during development.

### Using AQE MCP Tools

AQE tools use `mcp__agentic-qe__` prefix. Call `fleet_init` first.

```typescript
// Initialize fleet
mcp__agentic-qe__fleet_init({ topology: "hierarchical", maxAgents: 15, memoryBackend: "hybrid" })

// Generate tests for harness code
mcp__agentic-qe__test_generate_enhanced({ targetPath: "harness/src/matcher.ts", framework: "vitest" })

// Assess quality
mcp__agentic-qe__quality_assess({ scope: "full", includeMetrics: true })
```

### Data Storage

- **Memory Backend**: `.agentic-qe/memory.db` (SQLite)
- **Configuration**: `.agentic-qe/config.yaml`
