# ADR-012: Cross-Cutting Concerns

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-012 |
| **Initiative** | Cross-Cutting Concerns |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** an evaluation benchmark that spans 14 QE domains, multiple bounded contexts, and a four-phase agentic protocol, where several concerns cut across context boundaries and cannot be cleanly assigned to a single bounded context,

**facing** the challenge of managing fabrication stress testing (which tests tool behavior against clean code), composite scenarios (which combine multiple domains in a single evaluation), temporal evaluation (which re-runs the benchmark over months), bias detection (which analyzes performance variance across languages and domains), LLM-as-judge meta-evaluation (which assesses explanation quality), corpus refresh cadence (which triggers leaderboard re-evaluation), structured logging and observability (which spans all contexts), and a unified error taxonomy (which classifies failures across contexts),

**we decided for** treating these as explicitly identified cross-cutting concerns with dedicated implementation strategies: fabrication stress test as a specialized corpus partition (~100 provably clean samples), composite scenarios as multi-domain evaluation sequences (~30 end-to-end pipelines), temporal evaluation as scheduled re-runs at T+3m and T+6m with decay rate measurement, bias detection as statistical analysis of per-language and per-domain performance variance, LLM-as-judge as a hybrid evaluation pipeline (LLM scoring + human validation sample), quarterly corpus refresh cadence with annual major versions, structured JSON logging with OpenTelemetry spans for the runner, and a four-category error taxonomy (adapter, timeout, matching, corpus errors),

**and neglected** (a) ignoring cross-cutting concerns and handling them ad-hoc because they would be implemented inconsistently across contexts; (b) creating a separate "cross-cutting" bounded context because cross-cutting concerns by definition span contexts and should not be isolated; (c) using aspect-oriented programming (AOP) because TypeScript does not have native AOP support and decorator-based alternatives add complexity without benefit,

**to achieve** consistent handling of concerns that span bounded context boundaries, reliable fabrication detection through a dedicated stress test corpus, realistic evaluation through multi-domain composite scenarios, temporal reliability measurement through scheduled re-runs, bias awareness through statistical variance analysis, and operational visibility through structured logging and observability,

**accepting that** cross-cutting concerns are inherently harder to maintain than context-specific logic, temporal evaluation requires operational commitment (scheduled re-runs over months), LLM-as-judge introduces evaluator model dependency, and the error taxonomy may need to evolve as new failure modes are discovered.

---

## Problem Statement

Several important evaluation concerns do not fit neatly into a single bounded context:

| Cross-Cutting Concern | Affected Contexts | Why Cross-Cutting |
|----------------------|-------------------|-------------------|
| Fabrication stress test | Corpus, Evaluation, Matching, Metrics | Special corpus partition with different ground truth semantics |
| Composite scenarios | All contexts | Multi-domain evaluation requires cross-domain orchestration |
| Temporal evaluation | Evaluation, Metrics, Leaderboard | Scheduled re-runs affect results and rankings over time |
| Bias detection | Metrics, Leaderboard | Statistical analysis across all dimensions |
| LLM-as-judge | Agentic, Metrics | Meta-evaluation that assesses evaluation quality |
| Corpus refresh | Corpus, Leaderboard, Results | Version transitions affect all downstream consumers |
| Logging/observability | All contexts | Every context needs structured logging |
| Error taxonomy | All contexts | Errors from any context need consistent classification |

### Without Explicit Cross-Cutting Strategy

| Risk | Impact |
|------|--------|
| Fabrication testing handled differently by each adapter | Inconsistent fabrication rate measurement |
| Composite scenarios not evaluated | Single-domain evaluation misses integration failures |
| No temporal evaluation | Cannot detect concept drift or reliability decay |
| Bias undetected | Tools that work well on TypeScript but poorly on Java go unnoticed |
| Logging inconsistent | Debugging production issues is difficult |
| Error handling ad-hoc | Users cannot distinguish between adapter failure and corpus error |

---

## Opportunity

Explicitly managing cross-cutting concerns ensures consistent behavior across all bounded contexts.

| Dimension | Before | After |
|-----------|--------|-------|
| Fabrication detection | Per-tool ad-hoc | Standardized stress test with 100 provably clean samples |
| Multi-domain evaluation | Single-domain only | 30 composite scenarios testing cross-domain pipelines |
| Temporal reliability | Point-in-time only | Scheduled re-runs at T+3m, T+6m with decay rate |
| Bias awareness | Unknown | Per-language, per-domain variance analysis with statistical tests |
| Evaluation quality | Unknown | LLM-as-judge with human validation baseline |
| Operational visibility | printf debugging | Structured JSON logs with OpenTelemetry spans |
| Error handling | Generic error messages | Four-category taxonomy with context and recovery guidance |

### Cross-Cutting Concern Map

```
+------------------------------------------------------------------+
|                    CROSS-CUTTING CONCERNS                         |
|                                                                  |
|  +-------------------+  +-------------------+  +--------------+  |
|  | Fabrication       |  | Composite         |  | Temporal     |  |
|  | Stress Test       |  | Scenarios         |  | Evaluation   |  |
|  | (~100 clean       |  | (~30 E2E multi-   |  | T+0, T+3m,  |  |
|  |  samples)         |  |  domain pipelines)|  | T+6m re-runs |  |
|  +-------------------+  +-------------------+  +--------------+  |
|                                                                  |
|  +-------------------+  +-------------------+  +--------------+  |
|  | Bias Detection    |  | LLM-as-Judge      |  | Corpus       |  |
|  | Per-language,     |  | Explanation quality|  | Refresh      |  |
|  | per-domain        |  | meta-evaluation   |  | Cadence      |  |
|  | variance analysis |  | hybrid approach   |  | Q/annual     |  |
|  +-------------------+  +-------------------+  +--------------+  |
|                                                                  |
|  +-------------------+  +-------------------+                    |
|  | Logging &         |  | Error             |                    |
|  | Observability     |  | Taxonomy          |                    |
|  | JSON logs,        |  | adapter, timeout, |                    |
|  | OTel spans        |  | matching, corpus  |                    |
|  +-------------------+  +-------------------+                    |
+------------------------------------------------------------------+
        |              |              |              |
        v              v              v              v
   [Corpus]    [Evaluation]    [Metrics]     [Leaderboard]
   [Adapter]   [Matching]     [Agentic]     [CLI/API]
```

---

## Summary

| Capability | Description |
|------------|-------------|
| Fabrication stress test | ~100 provably clean code samples measuring false finding rate |
| Composite scenarios | ~30 E2E tests combining security+defect+test-gen and other cross-domain pipelines |
| Temporal evaluation | Re-run at T+3m and T+6m to measure concept drift and recall degradation |
| Bias detection | Per-language and per-domain performance variance analysis |
| LLM-as-judge | Meta-evaluation with hybrid approach (LLM score + human validation) |
| Corpus refresh cadence | Quarterly review, annual major version |
| Logging and observability | Structured JSON logs, OpenTelemetry spans for runner |
| Error taxonomy | Four categories: adapter errors, timeout errors, matching errors, corpus errors |

### 1. Fabrication Stress Test

The fabrication stress test is a specialized corpus partition designed to measure a tool's tendency to report findings on code that has no defects.

| Parameter | Value | Notes |
|-----------|-------|-------|
| Sample count | ~100 samples | Spread across all 14 domains |
| Sample types | Provably correct, trivially simple, formally verified, expert-reviewed | Four categories in manifest |
| Ground truth | Empty issues array for all samples | Any finding is a fabrication |
| Expected findings | 0 (ideal) | Any finding is a false positive |
| Fabrication rate | `fabrications / total_findings` | Computed in `computeMetrics()` (implemented) |
| Failure thresholds | >10% warning, >25% failure | Tools fabricating >25% are flagged as unreliable |

Fabrication sample categories:

| Category | Count | Description | Why Tools Might Fabricate |
|----------|-------|-------------|--------------------------|
| Provably correct | 25 | Code with formal correctness proofs or exhaustive testing | Complex logic that appears buggy |
| Trivially simple | 25 | Hello world, basic arithmetic, simple CRUD | Should never trigger findings |
| Formally verified | 25 | Code verified by proof assistants or model checkers | Unusual patterns from verification |
| Expert-reviewed clean | 25 | Production code reviewed by 3+ experts as defect-free | Real-world code with safe patterns |

### 2. Composite Scenarios

Composite scenarios test tool capability across domain boundaries by presenting samples that contain issues from multiple domains simultaneously.

| Scenario Type | Count | Domains Combined | Example |
|---------------|-------|-----------------|---------|
| Security + Defect | 8 | security, defects | SQL injection caused by null-deref in sanitization |
| Test Gen + Coverage | 5 | test-generation, coverage-analysis | Generate tests for uncovered critical paths |
| Requirements + Contracts | 5 | requirements, contracts | Ambiguous requirement leading to breaking API change |
| Accessibility + Visual | 4 | accessibility, visual-regression | WCAG violation causing visual regression |
| Performance + Chaos | 4 | performance, chaos-resilience | Latency spike under fault injection |
| Full Pipeline | 4 | security, defects, test-generation, coverage | End-to-end: find bug, generate test, verify coverage |
| **Total** | **30** | | |

Composite scoring: tool must identify issues from ALL relevant domains to receive full credit. Partial domain coverage scored proportionally.

### 3. Temporal Evaluation

| Parameter | Value | Notes |
|-----------|-------|-------|
| T+0 | Initial evaluation | Baseline metrics |
| T+3m | Re-evaluation at 3 months | Same corpus version, same adapter version |
| T+6m | Re-evaluation at 6 months | Same corpus version, same adapter version |
| Decay rate | `(recall_t0 - recall_t6m) / recall_t0` | Higher = worse temporal stability |
| Expected behavior | Stable (decay rate < 5%) | For deterministic tools; LLM tools may show drift |
| Trigger | Scheduled; not triggered by corpus updates | Isolates model drift from corpus changes |

Temporal evaluation captures:

| Phenomenon | Measurement | Cause |
|------------|-------------|-------|
| LLM model drift | Recall changes despite same inputs | Model updates, weight changes |
| API deprecation | Adapter failures | Tool API changes |
| Configuration drift | Findings change | Environment changes |
| Memory decay (agentic) | Warm start recall degrades | Agent memory architecture issues |

### 4. Bias Detection

Statistical analysis of performance variance across demographic dimensions:

| Dimension | Analysis | Test | Threshold |
|-----------|----------|------|-----------|
| Language variance | Per-language precision and recall | ANOVA across languages | p < 0.05 = significant bias |
| Domain variance | Per-domain F1 | ANOVA across domains | p < 0.05 = significant bias |
| Difficulty variance | Per-difficulty recall | Trend test (Cochran-Armitage) | p < 0.05 = significant trend |
| Cross-language-domain | Language * domain interaction | Two-way ANOVA | p < 0.05 = interaction effect |

Bias report fields:

| Field | Type | Description |
|-------|------|-------------|
| `strongest_language` | `Language` | Language with highest recall |
| `weakest_language` | `Language` | Language with lowest recall |
| `language_recall_range` | `number` | max(recall) - min(recall) across languages |
| `strongest_domain` | `Domain` | Domain with highest F1 |
| `weakest_domain` | `Domain` | Domain with lowest F1 |
| `domain_f1_range` | `number` | max(F1) - min(F1) across domains |
| `difficulty_monotonic` | `boolean` | Whether recall decreases monotonically with difficulty |
| `bias_flags` | `string[]` | Human-readable bias warnings |

### 5. LLM-as-Judge Meta-Evaluation

| Parameter | Value | Notes |
|-----------|-------|-------|
| Judge model | Configurable (default: GPT-4 or Claude) | Must be different from evaluated agent |
| Scoring scale | 1-5 | 1=incorrect, 2=vague, 3=correct-generic, 4=clear-actionable, 5=excellent |
| Evaluation criteria | Accuracy, clarity, actionability, specificity, correctness | Five dimensions rated |
| Human validation | 10% random sample | Validates LLM judge reliability |
| Inter-rater reliability | Cohen's kappa > 0.6 | Between LLM judge and human reviewers |
| Hybrid score | 0.7 * LLM + 0.3 * human (when available) | Weighted combination |

### 6. Corpus Refresh Cadence

| Event | Frequency | Actions |
|-------|-----------|---------|
| Quarterly review | Every 3 months | Add new samples, fix reported labeling errors, update adversarial negatives |
| Annual major version | Every 12 months | Schema changes, new domains, difficulty recalibration, new corpus version (v0.2, v1.0) |
| Emergency fix | As needed | Critical labeling errors, security concerns in samples |
| Held-out refresh | Every 12 months | Rotate 10% of held-out samples to prevent accumulated leakage |

Corpus version transition:

```
v0.1 (current)
  |
  | Quarterly: add samples, fix labels
  |
v0.1.1, v0.1.2, v0.1.3
  |
  | Annual: schema changes, new domains, re-baseline
  |
v0.2 (next major)
  |
  | All tools must re-evaluate on v0.2
  | v0.1 leaderboard archived, not active
```

### 7. Logging and Observability

| Layer | Format | Content | Destination |
|-------|--------|---------|-------------|
| Structured logs | JSON | Timestamp, level, context, message, metadata | stdout/file |
| OpenTelemetry spans | OTLP | Runner lifecycle events, per-sample execution traces | Collector (optional) |
| Metrics export | Prometheus format | Evaluation counters, latency histograms, error rates | Metrics endpoint (optional) |

Log levels and contexts:

| Level | Context | Example |
|-------|---------|---------|
| `debug` | All | Detailed matching computation, score breakdown |
| `info` | Runner, Adapter | Sample started, findings collected, evaluation complete |
| `warn` | Corpus, Matching | Missing optional field, partial match below threshold |
| `error` | Adapter, Runner | Adapter crash, container timeout, invalid findings |
| `fatal` | Runner, CLI | Unrecoverable error, Docker daemon unavailable |

Structured log entry format:

```json
{
  "timestamp": "2026-03-09T14:30:22.123Z",
  "level": "info",
  "context": "runner",
  "message": "Sample evaluation completed",
  "metadata": {
    "sample_id": "security-sql-injection-001",
    "adapter": "semgrep",
    "latency_ms": 2340,
    "findings_count": 3,
    "container_id": "abc123"
  }
}
```

OpenTelemetry span structure:

```
Span: evaluation-run (root)
  |-- Span: corpus-load
  |-- Span: sample-evaluation (per sample)
  |     |-- Span: container-start
  |     |-- Span: adapter-execute
  |     |-- Span: findings-collect
  |     |-- Span: container-teardown
  |-- Span: matching
  |-- Span: metrics-computation
  |-- Span: scorecard-generation
```

### 8. Error Taxonomy

| Category | Code Range | Examples | Recovery |
|----------|-----------|----------|----------|
| Adapter errors | AE-001 to AE-099 | Adapter not found, adapter crash, invalid output | Check adapter installation; review adapter logs |
| Timeout errors | TE-001 to TE-099 | Sample timeout, container kill, grace period exceeded | Increase timeout; check sample complexity |
| Matching errors | ME-001 to ME-099 | Invalid ground truth reference, category mapping failure | Fix corpus sample; update category aliases |
| Corpus errors | CE-001 to CE-099 | Invalid schema, missing files, duplicate IDs | Run `aqb validate-corpus`; fix sample |

Error structure:

```typescript
interface AQBError {
  code: string;           // e.g., "AE-001"
  category: ErrorCategory; // "adapter" | "timeout" | "matching" | "corpus"
  message: string;
  context: {
    sample_id?: string;
    adapter?: string;
    domain?: string;
  };
  recoverable: boolean;
  suggestion: string;     // Human-readable recovery guidance
}
```

Specific error codes:

| Code | Category | Description |
|------|----------|-------------|
| AE-001 | Adapter | Adapter not found in registry |
| AE-002 | Adapter | Adapter setup() failed |
| AE-003 | Adapter | Adapter analyze() threw exception |
| AE-004 | Adapter | Adapter returned invalid Finding[] (Zod validation failed) |
| AE-005 | Adapter | Docker image not available |
| TE-001 | Timeout | Sample execution exceeded timeout |
| TE-002 | Timeout | Container did not stop within grace period |
| TE-003 | Timeout | Total run timeout exceeded |
| ME-001 | Matching | Ground truth references non-existent file |
| ME-002 | Matching | Category alias lookup failed |
| CE-001 | Corpus | Sample failed Zod schema validation |
| CE-002 | Corpus | Duplicate sample ID |
| CE-003 | Corpus | Ground truth empty for non-adversarial sample |
| CE-004 | Corpus | Insufficient reviewers (< 2) |
| CE-005 | Corpus | Adversarial negative percentage below 20% |

---

## Options Considered

### Option 1: [Selected] -- Explicit Cross-Cutting Concern Registry

**Description:** Identify and document all cross-cutting concerns with dedicated implementation strategies, shared infrastructure (logging, error taxonomy), and integration points into each bounded context.

**Pros:**
- Every cross-cutting concern has an explicit owner and strategy
- Shared logging and error infrastructure ensures consistency
- Fabrication stress test and composite scenarios are first-class evaluation features
- Temporal evaluation provides longitudinal reliability data
- Bias detection surfaces tool weaknesses across dimensions

**Cons:**
- Cross-cutting concerns are harder to test in isolation
- Some concerns (temporal evaluation) require operational commitment
- Shared infrastructure creates coupling between contexts

### Option 2: [Rejected] -- Handle Cross-Cutting Concerns Ad-Hoc

**Description:** Let each bounded context handle cross-cutting concerns independently as needed.

**Pros:**
- No upfront design effort
- Contexts remain fully independent
- Simpler initial implementation

**Cons:**
- Inconsistent logging formats across contexts
- Fabrication testing may be skipped or implemented differently per adapter
- Error messages have no consistent structure
- Bias detection never happens because no single context owns it
- Temporal evaluation never happens because no context triggers re-runs

**Rejection rationale:** Ad-hoc handling leads to inconsistency and omission. Cross-cutting concerns are, by definition, concerns that no single context will handle completely on its own.

### Option 3: [Rejected] -- Aspect-Oriented Programming (AOP)

**Description:** Use decorators or proxy-based AOP to inject cross-cutting behavior (logging, error handling) into context methods.

**Pros:**
- Clean separation of cross-cutting from business logic
- Centralized configuration of aspects
- No code duplication

**Cons:**
- TypeScript lacks native AOP support
- Decorator-based approaches are experimental and may change
- Debugging aspect-woven code is difficult
- Not suitable for domain-specific concerns (fabrication test, composite scenarios)
- Over-engineering for the current codebase size

**Rejection rationale:** AOP addresses code-level cross-cutting (logging, caching) but not domain-level cross-cutting (fabrication testing, temporal evaluation, bias detection). The domain-level concerns are the more important ones for AQB.

---

## Consequences

### Positive
- Fabrication stress test provides a standardized, reproducible measure of tool hallucination
- Composite scenarios test real-world multi-domain evaluation that single-domain testing misses
- Temporal evaluation reveals tool reliability over time (especially important for LLM-based tools)
- Bias detection surfaces systematic weaknesses that aggregate metrics hide
- Structured logging enables consistent debugging and operational monitoring
- Error taxonomy provides actionable error messages with recovery guidance
- Corpus refresh cadence prevents the benchmark from becoming stale

### Negative
- Cross-cutting concerns add implementation complexity across multiple contexts
- Temporal evaluation requires ongoing operational commitment (scheduled re-runs)
- LLM-as-judge dependency introduces evaluator model risk
- Error taxonomy may need updates as new failure modes emerge
- Logging infrastructure adds runtime overhead (small but measurable)

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Temporal evaluation not maintained | High | Medium | Automate re-runs via cron or CI scheduled jobs; document as optional |
| LLM-as-judge model changes affect scores | Medium | Medium | Pin judge model version; re-evaluate when model changes |
| Error taxonomy incomplete | Medium | Low | Extensible error code ranges; add codes as new failures discovered |
| Bias detection produces false alarms | Medium | Low | Bonferroni correction for multiple comparisons; require p < 0.01 |
| Fabrication stress test corpus too small | Low | Medium | Start with 100; expand based on tool vendor feedback |
| Composite scenario design biases evaluation | Medium | Medium | Community review of scenario design; rotate scenarios quarterly |

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
| Spans | ADR-001 | Bounded Context Map | Cross-cutting concerns span multiple bounded contexts |
| Uses | ADR-002 | Corpus Aggregate Design | Fabrication stress test is a corpus partition |
| Uses | ADR-003 | Evaluation Engine Runner Architecture | Logging and observability spans runner lifecycle |
| Uses | ADR-006 | Metrics and Scoring | Bias detection analyzes metrics output |
| Uses | ADR-007 | Agentic Evaluation Protocol | LLM-as-judge and temporal evaluation are agentic concerns |
| Uses | ADR-009 | Corpus Data Sourcing Strategy | Fabrication and composite samples sourced via ADR-009 |
| Affects | ADR-011 | Leaderboard and Results | Temporal versioning affects leaderboard |
| Tested by | ADR-013 | Testing Strategy | Cross-cutting concern tests |
| Domain-specific | ADR-014 | Domain-Specific Evaluation | Per-domain bias analysis |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | Fabrication stress test corpus category | Data | `corpus/v0.1/manifest.json` (fabrication-stress-test section) |
| REF-002 | Fabrication rate in metrics | Source Code | `harness/src/metrics.ts` (lines 43-45) |
| REF-003 | OpenTelemetry specification | Standard | https://opentelemetry.io/docs/ |
| REF-004 | ANOVA for bias detection | Statistical Method | Analysis of Variance for comparing means across groups |
| REF-005 | Bonferroni correction | Statistical Method | Multiple comparison correction for p-values |
| REF-006 | LLM-as-judge methodology | Research | Zheng et al., "Judging LLM-as-a-Judge" (2023) |
| REF-007 | Structured logging best practices | Guide | https://www.structlog.org/ |
