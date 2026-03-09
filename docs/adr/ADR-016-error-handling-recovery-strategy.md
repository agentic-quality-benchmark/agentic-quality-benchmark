# ADR-016: Error Handling and Recovery Strategy

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-016 |
| **Initiative** | Error Handling Strategy |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** an evaluation harness that runs 1,680+ corpus samples across seven adapter implementations, where each sample evaluation involves Docker container lifecycle management, external tool execution, output normalization, finding matching, and metrics computation -- any of which can fail due to transient infrastructure issues, adapter bugs, corpus defects, or resource exhaustion,

**facing** the challenge of ensuring that a single failing sample or adapter does not invalidate an entire multi-hour evaluation run, while maintaining result integrity so that consumers of scorecards and leaderboard entries can trust the reported metrics, and providing operators with clear, actionable error context to diagnose and resolve failures without re-running the full corpus,

**we decided for** a structured error handling strategy with three-tier error classification (transient/permanent/fatal), configurable fail-fast versus fail-soft execution modes, a circuit breaker pattern for repeatedly failing adapters, exponential backoff retry policies for transient failures, checkpoint/resume capability for long-running evaluations, partial result reporting with explicit completeness indicators, and minimum sample completion thresholds that determine whether a run produces a valid scorecard,

**and neglected** (a) a fail-fast-on-any-error approach because it wastes hours of completed work when a single sample fails late in a run; (b) a silent error swallowing approach with best-effort results because it produces scorecards that appear complete but silently omit failed samples, undermining benchmark integrity and making tool comparisons unreliable,

**to achieve** resilient evaluation runs that maximize useful output from each execution, transparent result quality through explicit partial-result marking, fast feedback on systemic failures through circuit breakers, recoverability of long-running evaluations through checkpointing, and trustworthy scorecards where consumers always know the completeness and reliability of reported metrics,

**accepting that** the error handling infrastructure adds implementation complexity across multiple bounded contexts, checkpoint files consume disk space and require cleanup, the circuit breaker thresholds require tuning based on real-world failure patterns, and partial scorecards introduce ambiguity in leaderboard rankings that must be handled by downstream consumers.

---

## Problem Statement

AQB evaluation runs are long-running operations (potentially hours for the full 1,680+ sample corpus) that traverse multiple bounded contexts and external dependencies. Failures are inevitable:

| Failure Source | Example | Frequency | Current Handling |
|----------------|---------|-----------|------------------|
| Docker daemon | Container start fails, daemon crash | Rare | None -- run aborts |
| Adapter timeout | Tool hangs on complex sample | Occasional | TE-001/TE-002 codes defined in ADR-012, no retry policy |
| Adapter crash | Segfault in native tool, OOM kill | Occasional | AE-003 code defined in ADR-012, no recovery |
| Network failure | LLM API timeout, SonarQube unreachable | Occasional | No retry, no circuit breaker |
| Corpus defect | Malformed sample file, invalid schema | Rare | CE-001 code defined in ADR-012, run aborts |
| Resource exhaustion | Disk full, memory pressure on host | Rare | None -- undefined behavior |
| Matching error | Invalid ground truth reference | Rare | ME-001 code defined in ADR-012, no graceful skip |

ADR-012 defines the error taxonomy (4 categories, 14 error codes, structured `AQBError` type) but does not specify:

- How errors propagate across bounded context boundaries
- Whether and how transient failures are retried
- When the system should stop retrying and skip a sample
- When systemic failures should abort the entire run
- How partial results are reported and marked
- How long-running evaluations recover from interruptions
- What minimum completion percentage constitutes a valid result

Without these policies, each bounded context will implement ad-hoc error handling, leading to inconsistent behavior, lost work on partial runs, and untrustworthy scorecards.

### Error Propagation Across Bounded Contexts

The evaluation pipeline spans five bounded contexts in sequence:

```
Corpus Management --> Evaluation Engine --> Adapter Layer --> Matching Engine --> Metrics & Scoring
       |                    |                    |                  |                   |
       CE-*                TE-*               AE-*               ME-*            (aggregation)
       errors              errors             errors             errors             errors
```

Without a defined propagation model:

| Scenario | Without Strategy | Risk |
|----------|-----------------|------|
| Adapter crashes on sample 847 of 1,680 | Run aborts, 846 completed samples discarded | Hours of work lost |
| LLM API rate-limited for 30 seconds | Immediate failure, sample skipped permanently | Recoverable failure treated as permanent |
| Docker daemon restarts mid-run | All in-flight containers lost, run aborts | No checkpoint to resume from |
| 15% of security samples fail matching | Scorecard reports security metrics from 85% of samples with no indication | Misleading leaderboard entry |

---

## Opportunity

A comprehensive error handling strategy transforms AQB from a fragile single-shot tool into a resilient evaluation platform.

| Dimension | Before | After |
|-----------|--------|-------|
| Single sample failure | Entire run aborts or silently skips | Classified, retried if transient, skipped with record if permanent |
| Adapter instability | Run produces inconsistent results | Circuit breaker trips after threshold, adapter marked as degraded |
| Long-running interruption | Full restart required | Resume from last checkpoint |
| Result trustworthiness | No indication of completeness | Explicit partial flags with completion percentages |
| Error diagnosis | Generic error messages | Structured errors with context, classification, and recovery suggestions |
| Operator experience | Re-run entire corpus after any failure | Fix issue and resume, or accept partial results |

### Error Handling Architecture

```
+------------------------------------------------------------------+
|                    ERROR HANDLING STRATEGY                         |
|                                                                   |
|  +-------------------+  +-------------------+  +---------------+  |
|  | Error             |  | Retry Engine      |  | Circuit       |  |
|  | Classification    |  |                   |  | Breaker       |  |
|  |                   |  | Exponential       |  |               |  |
|  | Transient         |  | backoff with      |  | Per-adapter   |  |
|  | Permanent         |  | jitter            |  | failure       |  |
|  | Fatal             |  | Max 3 attempts    |  | tracking      |  |
|  +-------------------+  +-------------------+  +---------------+  |
|                                                                   |
|  +-------------------+  +-------------------+  +---------------+  |
|  | Execution Mode    |  | Checkpoint /      |  | Partial       |  |
|  | Controller        |  | Resume            |  | Result        |  |
|  |                   |  |                   |  | Reporter      |  |
|  | fail-fast         |  | Per-sample state  |  |               |  |
|  | fail-soft         |  | Resumable runs    |  | Completeness  |  |
|  | (configurable)    |  | Idempotent replay |  | indicators    |  |
|  +-------------------+  +-------------------+  +---------------+  |
+------------------------------------------------------------------+
        |              |              |              |
        v              v              v              v
   [Evaluation]   [Adapter]     [Matching]     [Metrics &
    Engine         Layer         Engine         Scoring]
```

### Error Flow Per Sample

```
Sample Execution
       |
       v
   [Execute Adapter]
       |
   +---+---+
   |       |
Success  Error
   |       |
   v       v
 [Match] [Classify Error]
   |       |
   v    +--+--+--------+
 [Done] |     |        |
     Transient Permanent Fatal
        |       |        |
        v       v        v
     [Retry]  [Skip   [Abort
      with    sample,   run,
      backoff record   report
      max 3]  error]   context]
        |       |
     +--+--+    v
     |     | [Record in
  Success Fail checkpoint]
     |     |
     v     v
  [Match] [Classify as
           permanent
           after max
           retries]
```

---

## Summary

| Capability | Description |
|------------|-------------|
| Three-tier error classification | Transient (retryable), permanent (skip), fatal (abort) with mapping from ADR-012 error codes |
| Retry engine | Exponential backoff with jitter for transient failures, configurable max attempts (default: 3) |
| Circuit breaker | Per-adapter failure tracking; trips after 5 consecutive failures or >30% failure rate in sliding window |
| Execution mode controller | Fail-fast (abort on first error) or fail-soft (continue, collect partial results) per run configuration |
| Checkpoint/resume | Per-sample execution state persisted to disk; interrupted runs resume from last checkpoint |
| Partial result reporter | Scorecards annotated with completion percentage, skipped sample list, and integrity flags |
| Minimum completion thresholds | Configurable minimum % of samples required for valid scorecard (default: 80%) |
| Error context propagation | Structured error context flows through bounded context boundaries via `AQBError` envelope |
| CLI error reporting | Color-coded error summaries with recovery suggestions in terminal output |
| Result file integrity | JSON result files include `integrity` object with completeness and error summary |

### 1. Error Classification

Every error from ADR-012's taxonomy is classified into one of three tiers that determine the system's response:

| Tier | Behavior | Criteria | Recovery Action |
|------|----------|----------|-----------------|
| **Transient** | Retry with backoff | Likely to succeed on retry; caused by temporary infrastructure issues | Exponential backoff retry up to max attempts |
| **Permanent** | Skip sample, record error | Will not succeed on retry; caused by sample defect or incompatible adapter | Log error, record in checkpoint, continue to next sample |
| **Fatal** | Abort entire run | Systemic failure that affects all samples; continued execution is pointless | Save checkpoint, report partial results, exit with error |

Mapping from ADR-012 error codes to tiers:

| Error Code | ADR-012 Category | Classification | Rationale |
|------------|-----------------|----------------|-----------|
| AE-001 | Adapter not found | Fatal | Cannot evaluate any sample without adapter |
| AE-002 | Adapter setup failed | Fatal | Adapter is non-functional for entire run |
| AE-003 | Adapter analyze() threw | Transient (1st-2nd), Permanent (3rd) | May be sample-specific or transient; permanent after retries exhausted |
| AE-004 | Invalid Finding[] output | Permanent | Adapter produced structurally invalid output for this sample |
| AE-005 | Docker image unavailable | Fatal | Cannot start containers for any sample |
| TE-001 | Sample timeout | Transient (1st), Permanent (2nd) | First timeout may be transient load; second timeout confirms sample is too complex |
| TE-002 | Container stop timeout | Transient | Container cleanup issue; does not affect next sample |
| TE-003 | Total run timeout | Fatal | Time budget exhausted; save checkpoint for resume |
| ME-001 | Ground truth invalid ref | Permanent | Corpus defect for this specific sample |
| ME-002 | Category alias failure | Permanent | Missing mapping for this specific category |
| CE-001 | Schema validation failed | Permanent | Corpus sample is malformed |
| CE-002 | Duplicate sample ID | Permanent | Skip duplicate, evaluate first occurrence only |
| CE-003 | Empty ground truth (non-adversarial) | Permanent | Corpus labeling defect |
| CE-004 | Insufficient reviewers | Permanent | Corpus quality gate failure for this sample |
| CE-005 | Low adversarial % | Fatal (pre-flight) | Corpus-level quality gate; checked before run starts |

Additional runtime classifications not in ADR-012:

| Condition | Classification | Rationale |
|-----------|----------------|-----------|
| Docker daemon unreachable | Fatal | No container execution possible |
| Network timeout (LLM API) | Transient | Network issues are typically temporary |
| Out of memory (host) | Fatal | System cannot allocate resources for any sample |
| Disk full | Fatal | Cannot write checkpoint or results |
| Container OOM killed | Transient (1st), Permanent (2nd) | May succeed with different scheduling; permanent if sample inherently too large |
| Rate limit (API) | Transient | Back off and retry after rate limit window |

### 2. Retry Engine

The retry engine handles transient failures with exponential backoff and jitter to prevent thundering herd effects on shared resources (LLM APIs, Docker daemon).

| Parameter | Default | Configurable | Description |
|-----------|---------|--------------|-------------|
| `maxAttempts` | 3 | Yes | Maximum retry attempts per sample (including initial attempt) |
| `baseDelayMs` | 1000 | Yes | Initial delay before first retry |
| `maxDelayMs` | 30000 | Yes | Maximum delay cap |
| `backoffMultiplier` | 2.0 | No | Exponential multiplier per attempt |
| `jitterFactor` | 0.25 | No | Random jitter as fraction of computed delay |

Backoff schedule for default configuration:

| Attempt | Base Delay | With Jitter (range) | Cumulative Wait |
|---------|-----------|---------------------|-----------------|
| 1 (initial) | 0ms | 0ms | 0ms |
| 2 (1st retry) | 1000ms | 750-1250ms | ~1s |
| 3 (2nd retry) | 2000ms | 1500-2500ms | ~3s |

Retry decision flow:

```
Error occurs
    |
    v
[Is error classified as transient?]
    |            |
   Yes           No --> [Permanent or Fatal handling]
    |
    v
[Attempts < maxAttempts?]
    |            |
   Yes           No --> [Reclassify as permanent, skip sample]
    |
    v
[Compute delay: baseDelay * (multiplier ^ attempt) + jitter]
    |
    v
[Wait computed delay]
    |
    v
[Re-execute sample]
```

### 3. Circuit Breaker

The circuit breaker pattern prevents the system from repeatedly attempting to use a failing adapter, which would waste time and resources on samples that are certain to fail.

States:

```
+--------+     failure threshold     +---------+
| CLOSED | -----------------------> |  OPEN   |
| (normal|                          | (reject |
|  flow) | <----------------------- |  all)   |
+--------+     reset after cooldown +---------+
     ^                                   |
     |          +-------------+          |
     +--------- | HALF-OPEN  | <--------+
    success     | (probe one  | cooldown
                |  sample)    | expires
                +-------------+
```

| Parameter | Default | Configurable | Description |
|-----------|---------|--------------|-------------|
| `failureThreshold` | 5 | Yes | Consecutive failures before circuit opens |
| `failureRateThreshold` | 0.30 | Yes | Failure rate in sliding window before circuit opens |
| `slidingWindowSize` | 20 | Yes | Number of recent samples in failure rate window |
| `cooldownMs` | 60000 | Yes | Time before half-open probe attempt |
| `probeCount` | 1 | No | Samples attempted in half-open state |

Circuit breaker is tracked per adapter. When a circuit opens:

| Action | Description |
|--------|-------------|
| Skip remaining samples | All queued samples for that adapter are marked as skipped with reason `circuit_breaker_open` |
| Log warning | Structured log entry with adapter name, failure count, and last error |
| Emit event | `AdapterCircuitOpen` event with adapter context |
| Probe after cooldown | After `cooldownMs`, attempt one sample; if it succeeds, close circuit and resume |
| Record in results | Scorecard includes circuit breaker trip in error summary |

### 4. Execution Mode Controller

Two configurable modes govern overall run behavior:

| Mode | Flag | Behavior | Use Case |
|------|------|----------|----------|
| **Fail-soft** (default) | `--fail-mode=soft` | Continue on permanent errors; skip failed samples; produce partial scorecard | Production evaluation runs against full corpus |
| **Fail-fast** | `--fail-mode=fast` | Abort run on first permanent error (after retry exhaustion) | Development, debugging, CI gate checks |

Both modes:
- Always retry transient errors (up to `maxAttempts`)
- Always abort on fatal errors
- Always save checkpoint on abort

Fail-soft mode additionally:
- Continues after permanent errors
- Tracks skipped samples per domain
- Applies minimum completion thresholds before producing scorecard
- Marks scorecard as partial when samples are skipped

Fail-fast mode additionally:
- Treats any permanent error as a run-aborting event
- Saves checkpoint so the run can be resumed in fail-soft mode after fixing the issue
- Useful during adapter development to catch problems immediately

### 5. Checkpoint and Resume

Long-running evaluations (hours for full corpus) need protection against interruptions. The checkpoint system persists per-sample execution state to enable resumption.

Checkpoint file format:

```
.aqb-checkpoint/
  <run_id>/
    checkpoint.json      -- Run state and configuration
    samples/
      <sample_id>.json   -- Per-sample result or error record
```

Checkpoint state:

```typescript
interface RunCheckpoint {
  run_id: string;
  adapter: string;
  corpus_version: string;
  started_at: string;
  last_updated_at: string;
  config: RunConfiguration;
  progress: {
    total_samples: number;
    completed: number;
    failed: number;
    skipped: number;
    remaining: number;
  };
  circuit_breaker_state: Record<string, CircuitState>;
  completed_sample_ids: string[];
  failed_sample_ids: string[];
  skipped_sample_ids: string[];
}

interface SampleCheckpoint {
  sample_id: string;
  status: 'completed' | 'failed' | 'skipped';
  findings?: Finding[];
  error?: AQBError;
  attempts: number;
  latency_ms: number;
  completed_at: string;
}
```

Resume behavior:

| Scenario | Action |
|----------|--------|
| `aqb run --resume <run_id>` | Load checkpoint, skip completed samples, re-execute failed/remaining |
| Checkpoint exists, no `--resume` | Warn user, offer to resume or start fresh |
| Checkpoint corrupted | Warn user, start fresh, archive corrupted checkpoint |
| Corpus version changed since checkpoint | Abort resume, require fresh run (corpus mismatch) |
| Adapter version changed since checkpoint | Warn user, offer to continue (results may be mixed) or start fresh |

Checkpoint write frequency:

| Event | Checkpoint Action |
|-------|-------------------|
| Sample completed | Write sample result to `samples/<id>.json`, update `checkpoint.json` progress |
| Sample failed (after retries) | Write sample error to `samples/<id>.json`, update progress |
| Circuit breaker state change | Update `checkpoint.json` circuit breaker state |
| Run interrupted (SIGINT/SIGTERM) | Flush all in-flight sample states, write final checkpoint |
| Run completed | Write final checkpoint, mark as `completed` |

### 6. Partial Result Reporting

When samples are skipped due to errors, the scorecard must clearly indicate its completeness.

Result integrity structure:

```typescript
interface ResultIntegrity {
  status: 'complete' | 'partial' | 'insufficient';
  completion_percentage: number;
  total_samples: number;
  completed_samples: number;
  failed_samples: number;
  skipped_samples: number;
  per_domain_completion: Record<Domain, {
    total: number;
    completed: number;
    completion_percentage: number;
  }>;
  errors: ErrorSummary[];
  circuit_breaker_trips: string[];
  checkpoint_id?: string;
}

interface ErrorSummary {
  code: string;
  category: string;
  count: number;
  affected_samples: string[];
  first_occurrence: string;
  last_occurrence: string;
}
```

Integrity status determination:

| Status | Condition | Scorecard Validity |
|--------|-----------|-------------------|
| `complete` | 100% of applicable samples completed successfully | Full validity; suitable for leaderboard |
| `partial` | >= minimum threshold (default 80%) completed | Valid with caveat; leaderboard entry marked as partial |
| `insufficient` | < minimum threshold completed | Invalid; not eligible for leaderboard submission |

Per-domain minimum threshold: each domain must have >= 50% of its samples completed for that domain's metrics to be reported. Domains below 50% completion are reported as `N/A` in the scorecard.

### 7. Minimum Completion Thresholds

| Threshold | Default | Configurable | Scope | Effect |
|-----------|---------|--------------|-------|--------|
| `minOverallCompletion` | 80% | Yes | Entire run | Below this: scorecard marked `insufficient`, no leaderboard submission |
| `minDomainCompletion` | 50% | Yes | Per domain | Below this: domain metrics reported as `N/A` |
| `maxFabricationSkip` | 10% | No | Fabrication stress test | If >10% of fabrication samples fail, fabrication rate is unreliable |

Threshold enforcement:

```
All samples processed (or skipped/failed)
    |
    v
[Compute overall completion %]
    |
    +-- >= minOverallCompletion --> integrity.status = "partial" or "complete"
    |                                   |
    |                                   v
    |                              [Compute per-domain completion]
    |                                   |
    |                                   +-- domain >= minDomainCompletion --> report domain metrics
    |                                   +-- domain < minDomainCompletion --> domain metrics = N/A
    |
    +-- < minOverallCompletion --> integrity.status = "insufficient"
                                       |
                                       v
                                  [Scorecard generated with warning]
                                  [Leaderboard submission blocked]
```

### 8. Exception Propagation Model

Errors propagate across bounded context boundaries through a structured envelope that preserves origin context while translating to the consuming context's error handling expectations.

| Boundary | Upstream | Downstream | Propagation Rule |
|----------|----------|------------|------------------|
| Corpus -> Engine | `CE-*` errors | `SampleFailed` event | Corpus errors become permanent sample failures; engine logs and skips |
| Engine -> Adapter | Run configuration | `AE-*`, `TE-*` errors | Adapter errors bubble up to engine; engine classifies and applies retry/circuit breaker |
| Adapter -> Engine | `Finding[]` or error | Engine receives result or error | Adapter errors wrapped in `AQBError` envelope with adapter context |
| Engine -> Matcher | `Finding[]` + `CorpusSample` | `ME-*` errors | Matching errors are permanent for that sample; engine records and continues |
| Matcher -> Metrics | `MatchResult` or error | Metrics skips sample | Matching errors for a sample cause metrics to exclude that sample from computation |
| Metrics -> Scorecard | Computed metrics | Integrity flags | Metrics reports completion percentage; scorecard includes integrity object |

Propagation principles:

- Errors never silently disappear at context boundaries
- Each context translates upstream errors into its own vocabulary (using ADR-012 error codes)
- The originating context and error code are preserved in the `AQBError.context` field
- Fatal errors propagate immediately up to the run controller without retry
- Transient errors are handled (retried) at the Evaluation Engine level, not at individual context boundaries
- Permanent errors are recorded and forwarded to the checkpoint system

### 9. User Notification and CLI Output

Error reporting in CLI output follows a structured format that provides immediate actionability.

During run (streaming output):

```
[14:30:22] WARN  security-sql-injection-047: Adapter timeout (attempt 2/3), retrying in 2.1s...
[14:30:25] ERROR security-sql-injection-047: Permanent failure after 3 attempts [TE-001]
           Suggestion: Increase timeout with --timeout=120000 or check sample complexity
[14:31:02] WARN  Circuit breaker OPEN for adapter "sonarqube" (5 consecutive failures)
           Remaining 23 sonarqube samples will be skipped
           Circuit will probe again in 60s
```

Run summary (after completion):

```
=== Evaluation Run Summary ===
Adapter:    semgrep v1.60.0
Corpus:     v0.1 (1,680 samples)
Duration:   2h 14m 33s
Status:     PARTIAL (94.2% complete)

Completion: 1,583 / 1,680 samples
  Completed:  1,583 (94.2%)
  Failed:        47 (2.8%)
  Skipped:       50 (3.0%)

Errors by Category:
  TE-001 (sample timeout):     32 samples
  AE-003 (adapter exception):  15 samples
  Circuit breaker trips:        0

Per-Domain Completion:
  security:           118/120 (98.3%)
  defects:            135/140 (96.4%)
  test-generation:    112/120 (93.3%)
  ...
  performance:         89/120 (74.2%)  ** Below 80% threshold

Result Integrity: PARTIAL
  Scorecard valid for leaderboard: Yes (with partial flag)
  Domain "performance" metrics: Reported with caveat (74.2% completion)
  Checkpoint saved: .aqb-checkpoint/run-2026-03-09-143022/

Recovery: To retry failed samples, run:
  aqb run --resume run-2026-03-09-143022
```

Result file error section (JSON):

```json
{
  "integrity": {
    "status": "partial",
    "completion_percentage": 94.2,
    "total_samples": 1680,
    "completed_samples": 1583,
    "failed_samples": 47,
    "skipped_samples": 50,
    "per_domain_completion": {
      "security": { "total": 120, "completed": 118, "completion_percentage": 98.3 },
      "performance": { "total": 120, "completed": 89, "completion_percentage": 74.2 }
    },
    "errors": [
      {
        "code": "TE-001",
        "category": "timeout",
        "count": 32,
        "affected_samples": ["performance-latency-012", "performance-latency-015", "..."],
        "first_occurrence": "2026-03-09T14:45:12Z",
        "last_occurrence": "2026-03-09T16:32:47Z"
      }
    ],
    "circuit_breaker_trips": [],
    "checkpoint_id": "run-2026-03-09-143022"
  }
}
```

### 10. Scorecard Integrity Flags

The `Scorecard` type (defined in `harness/src/types.ts`) must be extended with an integrity field:

```typescript
interface Scorecard {
  // ... existing fields from types.ts ...
  integrity: ResultIntegrity;
}
```

Leaderboard implications:

| Integrity Status | Leaderboard Action |
|-----------------|-------------------|
| `complete` | Full entry, no caveats |
| `partial` (>= 80%) | Entry accepted with `partial` badge; ranked normally but flagged |
| `partial` (< 80%) | Entry marked `insufficient`; not ranked; visible but greyed out |
| Domain-level `N/A` | Domain column shows `N/A`; domain excluded from that tool's domain ranking |

---

## Options Considered

### Option 1: [Selected] -- Structured Error Handling with Circuit Breakers and Partial Result Reporting

**Description:** A comprehensive error handling strategy that classifies errors into three tiers (transient/permanent/fatal), applies retry policies with exponential backoff for transient failures, uses circuit breakers to detect systemic adapter failures, supports configurable fail-fast versus fail-soft execution modes, persists checkpoints for long-running run resumption, and annotates all results with explicit completeness indicators.

**Pros:**
- Maximizes useful output from every evaluation run by continuing past recoverable failures
- Transparent result quality through explicit integrity flags on every scorecard
- Circuit breakers prevent wasting time on systemically failing adapters
- Checkpoint/resume eliminates the need to restart multi-hour runs from scratch
- Fail-fast mode provides rapid feedback during development and CI
- Error classification leverages ADR-012's existing taxonomy, adding behavior to existing codes
- Configurable thresholds allow operators to tune sensitivity to their environment
- Clear CLI output with recovery suggestions reduces mean time to resolution

**Cons:**
- Significant implementation complexity across Evaluation Engine, Adapter Layer, and Metrics contexts
- Checkpoint files require disk space and cleanup lifecycle management
- Circuit breaker thresholds require empirical tuning based on real-world failure patterns
- Partial scorecards add ambiguity to leaderboard rankings
- Retry logic increases total evaluation time when transient failures occur
- Two execution modes (fail-fast, fail-soft) double the behavioral surface to test

### Option 2: [Rejected] -- Fail-Fast on Any Error

**Description:** Abort the entire evaluation run immediately when any sample fails, after a single retry attempt. No partial results. No checkpoints.

**Pros:**
- Simple implementation: one error path, one behavior
- No ambiguity in results: every scorecard represents 100% completion
- No checkpoint management overhead
- Fast feedback during development

**Cons:**
- A single transient failure 90% through a multi-hour run discards all completed work
- Penalizes evaluation of complex adapters (SonarQube, CodeQL) that are more prone to timeouts
- No way to evaluate tools against the full corpus if any sample causes an error
- Operators must manually identify and exclude problematic samples before re-running
- Not viable for production benchmark evaluation of real tools against 1,680+ samples

**Rejection rationale:** The AQB corpus contains 1,680+ samples evaluated through external tool adapters running in Docker containers. The probability of zero failures across all samples is negligibly low for any non-trivial tool. A fail-fast strategy would mean that full-corpus evaluation runs almost never produce results, defeating the purpose of the benchmark.

### Option 3: [Rejected] -- Silent Error Swallowing with Best-Effort Results

**Description:** Catch all errors silently, skip failed samples without recording them, and produce scorecards computed from whatever samples succeeded. No error reporting in results. No completion indicators.

**Pros:**
- Always produces a scorecard, regardless of how many samples fail
- Simple implementation: catch-all error handler around each sample
- No operator intervention needed
- No partial-result complexity in leaderboard

**Cons:**
- Scorecards appear complete but may be computed from a fraction of the corpus
- Tool A evaluated on 95% of samples cannot be fairly compared to Tool B evaluated on 60%
- Operators have no way to know that failures occurred or diagnose root causes
- Systemic adapter failures (wrong Docker image, missing API key) silently produce empty scorecards
- Undermines the fundamental integrity of the benchmark: results must be trustworthy
- Leaderboard rankings become meaningless when different tools are evaluated on different sample subsets

**Rejection rationale:** Benchmark integrity is a non-negotiable requirement. Silent error swallowing produces results that appear authoritative but are computed from an unknown subset of the corpus. This makes cross-tool comparison unreliable and erodes trust in the leaderboard. The AQB benchmark's value proposition depends on consumers being able to trust that reported metrics represent consistent, comparable evaluations.

---

## Consequences

### Positive
- Evaluation runs against the full 1,680+ sample corpus are practical because transient failures do not abort the run
- Result consumers (leaderboard, reports, comparisons) always know the completeness of reported metrics
- Circuit breakers provide early detection of systemic adapter problems, saving hours of fruitless retries
- Checkpoint/resume transforms multi-hour evaluations from fragile single-shot operations into resumable workflows
- Error classification builds on ADR-012's taxonomy, adding behavioral semantics to existing error codes
- Configurable execution modes serve both development (fail-fast) and production (fail-soft) use cases
- Clear CLI error reporting with recovery suggestions reduces the expertise required to operate AQB
- Partial scorecard flags enable the leaderboard to make informed ranking decisions

### Negative
- Error handling infrastructure adds code to every bounded context that participates in the evaluation pipeline
- Checkpoint persistence adds I/O overhead (one file write per completed sample)
- Circuit breaker state management adds complexity to the Evaluation Engine
- Partial results create a new category of leaderboard entry that downstream consumers must handle
- Retry delays increase total evaluation time when transient failures occur (worst case: 3 retries * 30s = 90s per failing sample)
- Two execution modes require testing both code paths

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Circuit breaker thresholds too aggressive | Medium | Medium | Start with conservative defaults (5 consecutive / 30% rate); make configurable; log threshold decisions |
| Checkpoint files accumulate on disk | Medium | Low | Automatic cleanup of checkpoints older than 7 days; `aqb checkpoint clean` CLI command |
| Partial scorecards gamed by selectively failing hard samples | Low | High | Minimum completion thresholds (80% overall, 50% per domain); leaderboard rejects insufficient runs |
| Retry delays mask systemic issues | Low | Medium | Circuit breaker detects patterns; structured logging makes retry patterns visible |
| Checkpoint resume produces mixed results (different conditions) | Medium | Medium | Record environment fingerprint in checkpoint; warn on resume if environment changed |
| Error classification incorrect for edge cases | Medium | Low | Classification table is configuration, not code; updated as new failure modes are discovered |
| Fail-soft mode hides real problems | Medium | Medium | Error summary always displayed; `--strict` alias for fail-fast in CI environments |

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
| Depends on | ADR-003 | Evaluation Engine Runner Architecture | Error handling wraps the runner lifecycle; retry and circuit breaker operate within the runner's event model |
| Depends on | ADR-004 | Adapter Layer Anti-Corruption Pattern | Adapter error isolation boundaries are the primary source of retryable errors |
| Extends | ADR-012 | Cross-Cutting Concerns | Builds behavioral semantics (classification, retry, circuit breaker) on top of ADR-012's error taxonomy and error codes |
| Affects | ADR-001 | Bounded Context Map | Defines error propagation rules across bounded context boundaries |
| Affects | ADR-006 | Metrics and Scoring | Metrics must handle partial sample sets and report integrity indicators |
| Affects | ADR-008 | CLI and API Gateway | CLI must display structured error output and support `--fail-mode`, `--resume` flags |
| Affects | ADR-011 | Leaderboard and Results | Leaderboard must handle partial scorecard entries and integrity flags |
| Related | ADR-010 | Docker Isolation and Reproducibility | Docker failures (daemon, image pull, OOM) are classified in the error taxonomy |
| Related | ADR-013 | Testing Strategy | Error handling paths require dedicated test coverage (chaos testing of retry, circuit breaker) |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | ADR-012 Error Taxonomy | Architecture Decision | `docs/adr/ADR-012-cross-cutting-concerns.md` (Section 8: Error Taxonomy) |
| REF-002 | AQBError interface | Source Code | `docs/adr/ADR-012-cross-cutting-concerns.md` (error structure definition) |
| REF-003 | Runner Event Model | Architecture Decision | `docs/adr/ADR-003-evaluation-engine-runner-architecture.md` (Event Model section) |
| REF-004 | Adapter Error Isolation | Architecture Decision | `docs/adr/ADR-004-adapter-layer-anti-corruption-pattern.md` (error isolation boundaries) |
| REF-005 | Scorecard type | Source Code | `harness/src/types.ts` (lines 236-246) |
| REF-006 | Circuit Breaker pattern | Pattern | Michael Nygard, "Release It!" (2007), Chapter 5 |
| REF-007 | Exponential Backoff and Jitter | Pattern | AWS Architecture Blog, "Exponential Backoff And Jitter" |
| REF-008 | Bulkhead pattern | Pattern | Microsoft Azure Architecture Center, "Bulkhead pattern" |
