# ADR-008: CLI and API Gateway Design

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-008 |
| **Initiative** | CLI and API Gateway |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** providing user access to the AQB evaluation harness through both a command-line interface for interactive and CI/CD usage and a programmatic API for tool integration and custom workflows,

**facing** the challenge of exposing the evaluation pipeline (corpus loading, adapter selection, runner execution, matching, metrics, scorecard generation) through a consistent interface that supports multiple output formats (JSON for machines, tables for humans, formatted reports for stakeholders), provides meaningful progress feedback for long-running evaluations, handles errors gracefully with appropriate exit codes, and remains extensible as new commands are added,

**we decided for** a Commander.js-based CLI with four primary commands (`run`, `scorecard`, `validate-corpus`, `list-adapters`), a parallel programmatic API exposing the same capabilities through TypeScript function imports (`evaluate()`, `scorecard()`), three output formats (JSON, table, scorecard report), a configuration file strategy supporting both `.aqbrc.json` and `aqb.config.ts`, progress reporting via per-sample progress bar with ETA and live domain metrics, and structured exit codes (0=success, 1=failures, 2=config error, 3=adapter error),

**and neglected** (a) a web-based GUI because AQB is a benchmark tool primarily used in development and CI/CD environments where CLI is the standard interface; (b) a REST API server because it adds deployment and lifecycle management overhead for a tool that runs as a batch process; (c) a TUI (terminal user interface) because it limits scriptability and CI/CD integration,

**to achieve** a consistent, scriptable interface for automated benchmark runs in CI/CD, a programmatic API for custom integrations and workflow orchestration, clear progress feedback for long-running evaluations (1,680 samples can take 1+ hours), machine-parseable output for downstream tooling, and a familiar CLI experience following Unix conventions,

**accepting that** Commander.js CLI has limited interactive capabilities compared to a TUI, dual API surface (CLI + programmatic) requires maintaining parity between both, configuration file flexibility (JSON + TypeScript) adds parsing complexity, and progress reporting adds visual noise that must be suppressible for CI environments.

---

## Problem Statement

The AQB harness currently has no user-facing interface. The package.json defines script entries but no CLI implementation:

| Script | Status | Gap |
|--------|--------|-----|
| `npm run aqb` | Defined (`tsx src/cli.ts`) | `src/cli.ts` does not exist |
| `npx aqb run` | Not configured | No binary entry in package.json |
| Programmatic API | Barrel file exports types + functions | No high-level `evaluate()` or `scorecard()` functions |

### User Scenarios Requiring CLI/API

| Scenario | User | Interface | Requirements |
|----------|------|-----------|--------------|
| Run evaluation against corpus | Tool developer | CLI | `aqb run --adapter semgrep --corpus ./corpus/v0.1/` |
| Generate scorecard | Tool developer | CLI | `aqb scorecard --results ./results/semgrep/` |
| Validate corpus before PR | Corpus contributor | CLI | `aqb validate-corpus --path ./corpus/v0.1/` |
| List available adapters | Any user | CLI | `aqb list-adapters` |
| CI/CD benchmark run | CI pipeline | CLI + JSON | `aqb run --adapter aqe --output json > results.json` |
| Custom evaluation workflow | Researcher | Programmatic API | `import { evaluate } from '@aqb/harness'` |
| Compare two tool versions | Tool developer | CLI | `aqb compare --baseline v1.json --candidate v2.json` |
| Check progress of long run | Tool developer | CLI | Progress bar with ETA during `aqb run` |

### Requirements by Interface

| Requirement | CLI | API | Priority |
|-------------|-----|-----|----------|
| Adapter selection | `--adapter <name>` flag | `adapter` parameter | Must have |
| Corpus path | `--corpus <path>` flag | `corpusPath` parameter | Must have |
| Domain filtering | `--domain <name>` flag | `domains` array parameter | Must have |
| Language filtering | `--language <name>` flag | `languages` array parameter | Should have |
| Difficulty filtering | `--difficulty <1-5>` flag | `difficulties` array parameter | Should have |
| Output format | `--output json\|table\|scorecard` flag | Return type is always typed | Must have |
| Concurrency | `--concurrency <N>` flag | `concurrency` parameter | Should have |
| Timeout override | `--timeout <ms>` flag | `timeout` parameter | Should have |
| Progress reporting | Progress bar (suppressible with `--quiet`) | Event emitter callbacks | Should have |
| Exit codes | 0/1/2/3 | Thrown exceptions with types | Must have |
| Configuration file | `.aqbrc.json` or `aqb.config.ts` | Direct parameter passing | Should have |

---

## Opportunity

A well-designed CLI and API Gateway provides the user-facing surface for the entire AQB benchmark platform.

| Dimension | Before | After |
|-----------|--------|-------|
| Running evaluation | Requires writing custom script | `npx aqb run --adapter semgrep` |
| Viewing results | Read raw JSON files | `npx aqb scorecard --format table` |
| Validating corpus | No validation tool | `npx aqb validate-corpus` |
| CI/CD integration | Not possible | `npx aqb run --output json --quiet` |
| Programmatic usage | Import low-level functions | `import { evaluate } from '@aqb/harness'` |
| Configuration | Hardcoded or per-call flags | `.aqbrc.json` with defaults |
| Progress visibility | None | Per-sample progress bar with ETA |
| Error handling | Unstructured errors | Typed exit codes + error messages |

### Command Tree

```
aqb
|
+-- run                     Run evaluation against corpus
|   +-- --adapter <name>    Required: adapter to evaluate
|   +-- --corpus <path>     Corpus directory (default: ./corpus/v0.1/)
|   +-- --domain <name>     Filter by domain (repeatable)
|   +-- --language <name>   Filter by language (repeatable)
|   +-- --difficulty <N>    Filter by difficulty (repeatable)
|   +-- --concurrency <N>   Parallel containers (default: 4)
|   +-- --timeout <ms>      Per-sample timeout override
|   +-- --output <format>   json | table | scorecard (default: table)
|   +-- --results-dir <p>   Save results to directory
|   +-- --quiet             Suppress progress output
|   +-- --no-docker         Use non-Docker execution mode
|
+-- scorecard               Generate scorecard from results
|   +-- --results <path>    Path to results JSON
|   +-- --format <fmt>      json | table | report (default: table)
|   +-- --compare <path>    Compare against baseline results
|
+-- validate-corpus         Validate corpus sample files
|   +-- --path <path>       Corpus directory (default: ./corpus/v0.1/)
|   +-- --strict            Fail on warnings (not just errors)
|   +-- --domain <name>     Validate specific domain only
|
+-- list-adapters           List available adapters
|   +-- --verbose           Show adapter configuration details
|
+-- compare                 Compare two evaluation results
|   +-- --baseline <path>   Baseline results JSON
|   +-- --candidate <path>  Candidate results JSON
|   +-- --output <format>   json | table (default: table)
```

### Programmatic API

```
@aqb/harness exports:

// High-level evaluation
evaluate(options: EvaluateOptions): Promise<AQBResult>
  options:
    adapter: string | AQBToolAdapter
    corpusPath: string
    domains?: Domain[]
    languages?: Language[]
    difficulties?: Difficulty[]
    concurrency?: number
    timeout?: number
    onProgress?: (event: RunEvent) => void

// Scorecard generation
generateScorecard(result: AQBResult): Scorecard

// Comparison
compareResults(baseline: AQBResult, candidate: AQBResult): ComparisonResult

// Corpus operations
validateCorpus(path: string, options?: ValidateOptions): ValidationResult[]
loadCorpus(path: string, filter?: CorpusFilter): CorpusSample[]

// Adapter operations
listAdapters(): AdapterInfo[]
getAdapter(name: string): AQBToolAdapter

// Re-exports of lower-level functions
matchFindings(...)
computeMetrics(...)
computeDomainMetrics(...)
computeDifficultyMetrics(...)
```

---

## Summary

| Capability | Description |
|------------|-------------|
| Commander.js CLI | Four primary commands: run, scorecard, validate-corpus, list-adapters |
| Programmatic API | TypeScript functions: evaluate(), generateScorecard(), compareResults() |
| Output formats | JSON (machine), table (human), scorecard report (stakeholder) |
| Configuration | `.aqbrc.json` or `aqb.config.ts` with CLI flag overrides |
| Progress reporting | Per-sample progress bar with ETA, live domain metrics (suppressible) |
| Exit codes | 0=success, 1=failures found, 2=config error, 3=adapter error |
| Domain/language/difficulty filtering | Evaluate subset of corpus |
| Comparison mode | Delta analysis between two evaluation runs |

### Exit Code Specification

| Exit Code | Name | Condition | Example |
|-----------|------|-----------|---------|
| 0 | Success | Evaluation completed, no errors | Clean run |
| 1 | Findings | Evaluation completed, tool found issues (normal for benchmark) | `aqb run` completed successfully |
| 2 | Config Error | Invalid configuration, missing required flags, invalid corpus path | `aqb run` without `--adapter` |
| 3 | Adapter Error | Adapter failed to initialize or crashed | Docker not available, adapter not found |
| 4 | Corpus Error | Corpus validation failed (for `validate-corpus`) | Invalid sample schema |
| 130 | Interrupted | User pressed Ctrl+C | Manual cancellation |

Note: Exit code 1 is used for `validate-corpus` failures to align with standard Unix convention (non-zero = error). For `run`, exit code 0 means the run completed (findings are expected, not errors).

### Configuration File Schema

```json
// .aqbrc.json
{
  "corpus": "./corpus/v0.1/",
  "defaultAdapter": "aqe",
  "concurrency": 4,
  "timeout": 60000,
  "output": "table",
  "resultsDir": "./results/",
  "docker": {
    "enabled": true,
    "pullPolicy": "if-not-present"
  },
  "adapters": {
    "semgrep": {
      "rules": ["p/security-audit", "p/typescript"],
      "dockerImage": "returntocorp/semgrep:1.60.0"
    },
    "eslint": {
      "config": ".eslintrc.json",
      "noDocker": true
    }
  }
}
```

### Output Format Examples

**Table format (human-readable):**
```
AQB Evaluation Results - semgrep v1.60.0
Corpus: v0.1 | Samples: 1,680 | Duration: 47m 23s

Overall Metrics:
  Precision:  0.847     Recall:     0.723     F1:         0.780
  FPR:        0.153     Fabrication: 0.023    SWR:        0.691
  Cost:       $0.00     Findings/$:  Inf

Domain Breakdown:
  Domain              P       R       F1      Samples
  security            0.891   0.812   0.850   200
  defects             0.823   0.687   0.749   150
  test-generation     0.756   0.634   0.689   120
  ...
```

**JSON format (machine-readable):**
```json
{
  "tool": "semgrep",
  "version": "1.60.0",
  "run_id": "run_20260309_143022",
  "corpus_version": "0.1.0",
  "metrics": { "precision": 0.847, "recall": 0.723, ... },
  "domain_metrics": { "security": { ... }, ... }
}
```

### Progress Reporting

```
AQB Evaluation: semgrep v1.60.0
[========>-------------------] 28% | 470/1680 samples | ETA: 35m 12s
  security: 142/200 (R=0.81)  defects: 89/150 (R=0.69)  ...
  Current: security-sql-injection-143 [2.3s]
```

---

## Options Considered

### Option 1: [Selected] -- Commander.js CLI + Programmatic API

**Description:** Commander.js-based CLI for interactive and CI/CD use, parallel programmatic API for custom workflows, three output formats, configuration file support.

**Pros:**
- Commander.js is already a dependency in `package.json`
- CLI follows Unix conventions (flags, exit codes, stdout/stderr)
- Programmatic API enables custom evaluation workflows
- JSON output integrates with CI/CD pipelines (jq, scripts)
- Configuration file reduces repetitive flag passing
- Progress reporting makes long runs manageable

**Cons:**
- Dual API surface (CLI + programmatic) requires parity maintenance
- Commander.js has limited subcommand composition
- Configuration merging (file + flags + defaults) adds complexity

### Option 2: [Rejected] -- Web-based GUI

**Description:** Build a web application for evaluating tools and viewing results.

**Pros:**
- Rich visualization of results
- Interactive exploration of domain breakdowns
- Accessible to non-CLI users

**Cons:**
- Adds web server infrastructure (Express, React, etc.)
- Not suitable for CI/CD integration
- Deployment and hosting requirements
- Not aligned with developer workflow (benchmarks are typically CLI tools)
- Massive scope increase

**Rejection rationale:** AQB is a benchmark tool. Benchmarks are run from the command line or CI/CD, not from web browsers. A web GUI can be added later for leaderboard visualization but is not the primary interface.

### Option 3: [Rejected] -- REST API Server

**Description:** Run AQB as a long-lived REST API server that accepts evaluation requests.

**Pros:**
- Language-agnostic client integration
- Stateful: can manage evaluation runs across requests
- Could serve leaderboard data

**Cons:**
- Requires server lifecycle management (start, stop, health checks)
- Adds HTTP framework dependency (Express, Fastify)
- Batch evaluation does not benefit from request/response model
- Deployment complexity for a CLI tool
- Security considerations for API exposure

**Rejection rationale:** AQB evaluations are batch processes, not request/response interactions. A REST server adds deployment complexity without benefiting the core use case of running benchmarks.

---

## Consequences

### Positive
- `npx aqb run --adapter semgrep` provides a single command to evaluate any tool
- JSON output enables seamless CI/CD integration (`npx aqb run --output json > results.json`)
- Programmatic API enables researchers to build custom evaluation workflows
- Configuration file reduces repetitive flag passing for regular users
- Progress reporting prevents user anxiety during 1+ hour evaluation runs
- Structured exit codes enable CI/CD pipelines to react appropriately
- `npx aqb validate-corpus` provides immediate feedback for corpus contributors

### Negative
- CLI and programmatic API must be kept in sync (dual maintenance)
- Commander.js does not support async command handlers natively (requires wrapper)
- Configuration file parsing adds startup latency (negligible)
- Progress bar output interferes with JSON output (must use stderr for progress, stdout for results)

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| CLI/API parity drift | Medium | Medium | CLI commands delegate to API functions; single implementation |
| Progress bar breaks piped output | Medium | Low | Use stderr for progress; `--quiet` flag disables |
| Configuration file security (API keys in .aqbrc.json) | Medium | High | Document: use environment variables for secrets; never commit .aqbrc.json |
| npx binary name conflicts | Low | Low | Register unique name `@aqb/harness`; use scoped binary |
| Commander.js version incompatibility | Low | Low | Pin version in package.json |

---

## Governance

| Review Board | Date | Outcome | Review Cadence | Next Review |
|--------------|------|---------|----------------|-------------|
| AQB Architecture Team | 2026-03-09 | Proposed | 6 months | 2026-09-09 |

---

## Status History

| Status | Approver | Date |
|--------|----------|------|
| Proposed | Architecture Team | 2026-03-09 |

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Parent | ADR-001 | Bounded Context Map | CLI and API Gateway is a bounded context defined in ADR-001 |
| Invokes | ADR-003 | Evaluation Engine Runner Architecture | `aqb run` invokes the runner |
| Lists | ADR-004 | Adapter Layer Anti-Corruption Pattern | `aqb list-adapters` queries adapter registry |
| Displays | ADR-006 | Metrics and Scoring | `aqb scorecard` formats Scorecard output |
| Validates | ADR-002 | Corpus Aggregate Design | `aqb validate-corpus` uses corpus Zod schemas |
| Stores | ADR-011 | Leaderboard and Results | `aqb run --results-dir` saves results for leaderboard |
| Orchestrates | ADR-007 | Agentic Evaluation Protocol | Extended `aqb run --agentic` orchestrates four-phase protocol |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | Commander.js | Library | https://www.npmjs.com/package/commander (v13.x in package.json) |
| REF-002 | Chalk | Library | https://www.npmjs.com/package/chalk (v5.4.x in package.json) |
| REF-003 | Package.json scripts | Configuration | `harness/package.json` (lines 14-15) |
| REF-004 | Index barrel file | Source Code | `harness/src/index.ts` |
| REF-005 | Unix exit code conventions | Standard | IEEE Std 1003.1 (POSIX) |
| REF-006 | 12-Factor CLI Apps | Pattern | https://medium.com/@jdxcode/12-factor-cli-apps-dd3c227a0e46 |
