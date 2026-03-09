# ADR-007: Agentic Evaluation Protocol

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-007 |
| **Initiative** | Agentic Evaluation |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** evaluating AI agents that exhibit emergent behaviors beyond simple static analysis -- including learning from past evaluations, coordinating in multi-agent swarms, generating natural-language explanations, proposing code fixes, and calibrating severity assessments,

**facing** the challenge that traditional precision/recall metrics cannot capture agentic capabilities like learning transfer (does the agent get better over time?), swarm coordination (do multiple agents find more than one agent?), explanation quality (are the descriptions useful?), fix quality (do proposed patches actually work?), and severity calibration (does the agent agree with human experts on severity rankings?),

**we decided for** a four-phase evaluation protocol -- Phase 1 Cold Start (empty memory, baseline metrics), Phase 2 Warm Start (persistent memory from Phase 1, measure learning transfer via delta recall), Phase 3 Multi-Agent (swarm mode, compare single vs multi-agent recall and unique findings), Phase 4 Adversarial (fabrication stress test on clean code) -- with dedicated metrics for each phase captured in the `AgenticMetrics` type, including learning transfer (delta_recall), swarm effectiveness (unique_findings_per_agent, coordination_overhead_ms), explanation quality (LLM-as-judge 1-5 + human validation), fix verification (compile, test, success rate), severity calibration (Spearman rho, Kendall tau), and temporal decay (recall at T+3m and T+6m),

**and neglected** (a) treating agentic tools identically to static analyzers because it ignores the very capabilities that differentiate AI agents; (b) a single-phase evaluation with all features enabled because it cannot isolate the contribution of learning, swarm coordination, or memory; (c) a purely human evaluation of agentic capabilities because it is expensive, subjective, and does not scale,

**to achieve** rigorous, reproducible measurement of agentic capabilities that go beyond finding bugs, clear isolation of each capability's contribution through phase separation, automated evaluation of explanation and fix quality with human validation sampling, and temporal measurement of agent reliability over time,

**accepting that** four-phase evaluation takes approximately 4x longer than single-phase, LLM-as-judge scores introduce evaluator model bias, fix verification requires build toolchains for all target languages, and temporal decay measurement requires re-running the benchmark months after the initial evaluation.

---

## Problem Statement

AI agents bring capabilities that static analysis tools do not possess. Evaluating only precision/recall misses critical differentiators:

| Agentic Capability | Why It Matters | How P/R/F1 Fails |
|--------------------|----------------|-------------------|
| Learning from past findings | Agent improves with experience; future runs are better | P/R measures single-run performance; no temporal dimension |
| Multi-agent coordination | Swarm of agents may find issues no single agent finds | P/R measures aggregate; cannot attribute to coordination |
| Natural language explanations | Developers need to understand findings to act on them | P/R is binary (found/not-found); no quality dimension |
| Code fix proposals | Agent proposes patches, not just findings | P/R measures detection; fix quality is a separate dimension |
| Severity calibration | Agent must rank severity similarly to human experts | P/R is unweighted; severity accuracy untracked |
| Temporal reliability | Agent should maintain performance over time | P/R is point-in-time; no decay measurement |
| Fabrication resistance | Agent should not hallucinate findings on clean code | Fabrication rate partially captures this; stress testing needed |

### Current Type Definitions

The `AgenticMetrics` interface in `types.ts` (lines 192-231) already defines the data model:

```
AgenticMetrics
+-- learning_transfer: { cold_start_recall, warm_start_recall, delta_recall }
+-- multi_agent: { single_agent_recall, swarm_recall, unique_findings_per_agent, coordination_overhead_ms }
+-- explanation_quality: { llm_judge_score, human_validation_score?, inter_rater_kappa? }
+-- fix_quality: { fixes_attempted, fixes_compiled, fixes_passed_tests, fix_success_rate }
+-- severity_calibration: { spearman_rho, kendall_tau }
+-- cost_efficiency: { total_tokens, total_cost_usd, findings_per_dollar, cost_per_true_positive }
+-- temporal_decay?: { recall_t0, recall_t3m, recall_t6m, decay_rate }
```

The protocol to populate these metrics is not yet defined.

### Gap Analysis

| Metric Area | Type Defined | Protocol Defined | Implementation | Gap |
|-------------|-------------|-----------------|----------------|-----|
| Learning transfer | Yes | No | No | Need cold/warm start protocol |
| Multi-agent | Yes | No | No | Need swarm orchestration |
| Explanation quality | Yes | No | No | Need LLM-as-judge pipeline |
| Fix quality | Yes | No | No | Need fix verification pipeline |
| Severity calibration | Yes | No | No | Need rank comparison method |
| Cost efficiency | Yes | No | Partial (in metrics.ts) | Need token tracking |
| Temporal decay | Yes | No | No | Need scheduled re-evaluation |

---

## Opportunity

The four-phase protocol transforms agentic evaluation from ad-hoc capability testing into a rigorous, reproducible measurement framework.

| Dimension | Before | After |
|-----------|--------|-------|
| Learning measurement | No protocol; agent may or may not use memory | Controlled cold/warm comparison isolates learning effect |
| Swarm measurement | No protocol; single vs multi unknown | Direct comparison with controlled agent count |
| Explanation quality | Ignored in evaluation | LLM-as-judge + human sample provides scaled quality signal |
| Fix quality | Not measured | Automated compile + test verification with success rate |
| Severity calibration | Not measured | Statistical correlation with expert rankings |
| Temporal stability | Not measured | Scheduled re-evaluation at T+3m and T+6m |
| Cost tracking | Partial | Full token and dollar tracking per phase |

### Four-Phase Protocol

```
Phase 1: COLD START
+--------------------------------------------+
| Agent starts with empty memory             |
| Evaluate against full corpus               |
| Record: cold_start_recall, findings, cost  |
| Duration: ~1 hour (1680 samples at 2s avg) |
+--------------------------------------------+
         |
         | Agent memory persisted
         v
Phase 2: WARM START
+--------------------------------------------+
| Agent uses memory from Phase 1             |
| Evaluate against same corpus               |
| Record: warm_start_recall, findings, cost  |
| Compute: delta_recall = warm - cold        |
| Duration: ~1 hour                          |
+--------------------------------------------+
         |
         | Memory reset
         v
Phase 3: MULTI-AGENT
+--------------------------------------------+
| Phase 3a: Single agent (from Phase 1)      |
| Phase 3b: Swarm (N agents, coordinated)    |
| Record: single_recall, swarm_recall        |
| Compute: unique_findings_per_agent         |
| Compute: coordination_overhead_ms          |
| Duration: ~2 hours (single + swarm)        |
+--------------------------------------------+
         |
         v
Phase 4: ADVERSARIAL
+--------------------------------------------+
| Evaluate against fabrication stress test   |
| ~100 provably clean code samples           |
| Record: findings on clean code             |
| Compute: fabrication_rate (should be ~0)   |
| Duration: ~15 minutes                      |
+--------------------------------------------+
         |
         v
AGGREGATE: Combine all phase metrics into AgenticMetrics
```

### Phase Details

#### Phase 1: Cold Start

| Parameter | Value | Notes |
|-----------|-------|-------|
| Memory state | Empty (cleared) | Agent must not retain any prior knowledge |
| Corpus | Full public corpus (corpus/v0.1/) | All applicable domains for the adapter |
| Evaluation | Standard AQB pipeline (runner -> matcher -> metrics) | Using ADR-003/005/006 |
| Recorded metrics | cold_start_recall, all standard metrics, token count, cost | Baseline for learning comparison |
| Timeout | Standard per-sample timeouts (ADR-003) | No special treatment |

#### Phase 2: Warm Start

| Parameter | Value | Notes |
|-----------|-------|-------|
| Memory state | Persisted from Phase 1 | Agent retains findings, patterns, explanations from Phase 1 |
| Corpus | Same corpus as Phase 1 | Must be identical for valid comparison |
| Memory format | Agent-specific (not standardized by AQB) | Agents can use any internal memory format |
| Recorded metrics | warm_start_recall, delta_recall, token count, cost | Learning transfer measurement |
| Expected outcome | warm_start_recall >= cold_start_recall | If delta_recall < 0, agent degrades with memory |

#### Phase 3: Multi-Agent

| Parameter | Value | Notes |
|-----------|-------|-------|
| Phase 3a | Single agent evaluation (reuse Phase 1 results) | Baseline for swarm comparison |
| Phase 3b | N agents in swarm configuration (N configurable, default 3) | Agents can coordinate findings |
| Agent coordination | Agent-specific (not standardized by AQB) | AQB measures outcomes, not mechanism |
| Recorded metrics | single_agent_recall, swarm_recall, unique_findings_per_agent | Swarm value measurement |
| Overhead metric | coordination_overhead_ms | Time spent on agent coordination vs. analysis |

#### Phase 4: Adversarial

| Parameter | Value | Notes |
|-----------|-------|-------|
| Corpus | Fabrication stress test (~100 clean code samples) | Provably correct, trivially simple, formally verified, expert-reviewed |
| Expected findings | Zero (ideally) | Any finding on clean code is a fabrication |
| Recorded metrics | fabrication_rate = findings_on_clean / total_findings | Should approach 0 |
| Failure threshold | fabrication_rate > 0.10 = warning, > 0.25 = failure | Tools fabricating >25% are unreliable |

### Explanation Quality Assessment

| Method | Weight | Criteria |
|--------|--------|----------|
| LLM-as-judge (primary) | 0.7 | Score 1-5 based on: accuracy, clarity, actionability, specificity, correctness |
| Human validation (sampling) | 0.3 | Score 1-5 on random 10% sample; validates LLM judge accuracy |
| Inter-rater reliability | N/A | Cohen's kappa between LLM and human scores; target > 0.6 |

LLM-as-judge prompt structure:
```
Evaluate the following finding explanation:

Finding: {finding.description}
Suggestion: {finding.suggestion}
Ground Truth: {ground_truth.description}
Code Context: {sample.files[relevant]}

Rate 1-5:
1 = Incorrect or misleading
2 = Vague, not actionable
3 = Correct but generic
4 = Clear, specific, actionable
5 = Excellent: precise, well-explained, with correct fix
```

### Fix Verification Pipeline

```
For each finding with finding.fix:
  1. Extract original source from sample
  2. Apply proposed fix (patch)
  3. Check compilation
     - TypeScript: tsc --noEmit
     - Python: py_compile + mypy
     - Java: javac
     - Go: go build
  4. If compiles, run relevant tests (if available)
  5. Record: attempted, compiled, passed_tests
  6. Compute: fix_success_rate = passed_tests / attempted
```

| Fix Quality Level | Compiled | Tests Pass | Interpretation |
|-------------------|----------|------------|----------------|
| Excellent | Yes | Yes | Fix is correct and complete |
| Partial | Yes | No | Fix compiles but introduces regression |
| Broken | No | N/A | Fix does not compile |
| Not attempted | N/A | N/A | No fix proposed (not penalized) |

### Severity Calibration Measurement

| Method | Statistic | Target | Interpretation |
|--------|-----------|--------|----------------|
| Spearman rank correlation | rho | > 0.7 | Agent ranks severity similarly to expert |
| Kendall rank correlation | tau | > 0.5 | Alternative correlation; more robust to ties |

Procedure:
1. For each matched finding, pair agent severity with ground truth severity
2. Convert severities to numeric ranks: critical=5, high=4, medium=3, low=2, info=1
3. Compute Spearman rho and Kendall tau between agent and expert rankings
4. Report both statistics in AgenticMetrics

---

## Summary

| Capability | Description |
|------------|-------------|
| Four-phase protocol | Cold start, warm start, multi-agent, adversarial |
| Learning transfer | delta_recall = warm_start_recall - cold_start_recall |
| Swarm effectiveness | unique_findings_per_agent, coordination_overhead_ms |
| Explanation quality | LLM-as-judge 1-5 scale with human validation sampling |
| Fix verification | Compile + test pipeline for proposed patches |
| Severity calibration | Spearman rho and Kendall tau correlation |
| Cost tracking | Per-phase token and dollar accounting |
| Temporal decay | Recall at T+0, T+3m, T+6m with decay rate |
| Fabrication resistance | Stress test against ~100 provably clean code samples |

---

## Options Considered

### Option 1: [Selected] -- Four-Phase Protocol with Dedicated Agentic Metrics

**Description:** Structured four-phase evaluation isolating learning, swarm, and adversarial capabilities, with metrics for explanation quality, fix verification, and severity calibration.

**Pros:**
- Each phase isolates a specific agentic capability for measurement
- Cold/warm comparison is the standard method for measuring learning transfer
- Multi-agent comparison directly measures swarm value
- Adversarial phase specifically tests fabrication resistance
- Metrics capture dimensions invisible to traditional P/R/F1
- Protocol is reproducible and automatable

**Cons:**
- Four phases require approximately 4x evaluation time
- LLM-as-judge introduces evaluator model bias
- Fix verification requires build toolchains for all target languages
- Temporal decay requires months of elapsed time
- Protocol complexity may discourage adoption

### Option 2: [Rejected] -- Treat Agentic Tools Identically to Static Analyzers

**Description:** Evaluate all tools with the same single-phase protocol and P/R/F1 metrics.

**Pros:**
- Simple, uniform evaluation
- Fair comparison on basic metrics
- No additional protocol complexity

**Cons:**
- Ignores the distinguishing capabilities of AI agents
- Cannot measure learning, coordination, or explanation quality
- No fabrication stress testing
- Provides no guidance on agentic tool improvement

**Rejection rationale:** The entire purpose of AQB's Layer 3 (Agentic Behavior) is to measure capabilities unique to AI agents. Treating them identically to static analyzers defeats the benchmark's differentiation.

### Option 3: [Rejected] -- Single Phase with All Features Enabled

**Description:** Run a single evaluation phase where the agent can use memory, swarm, and all capabilities simultaneously.

**Pros:**
- Measures "best possible" performance
- Single evaluation run (less time)
- Simpler protocol

**Cons:**
- Cannot attribute performance to specific capabilities
- Cannot determine if learning helps or hurts
- Cannot determine if swarm adds value
- Conflates multiple effects; no scientific rigor
- Cannot identify which capabilities to invest in

**Rejection rationale:** Without phase separation, it is impossible to determine whether an agent's performance comes from learning, swarm coordination, or simply being a good single-agent tool. The four-phase protocol enables causal attribution.

---

## Consequences

### Positive
- Agentic capabilities are measured with scientific rigor through phase isolation
- Learning transfer measurement (delta_recall) directly answers "does the agent learn?"
- Swarm comparison directly answers "is multi-agent worth the cost?"
- Explanation quality assessment provides feedback beyond "found it / missed it"
- Fix verification closes the loop from detection to remediation
- Temporal decay measurement reveals long-term reliability
- Fabrication stress testing specifically targets the hallucination problem

### Negative
- Four-phase evaluation takes approximately 4 hours for full corpus (vs 1 hour for single-phase)
- LLM-as-judge scores depend on the evaluation model (GPT-4 may score differently than Claude)
- Fix verification requires Docker images with build toolchains (TypeScript, Python, Java, Go)
- Temporal decay requires scheduled re-evaluations at T+3m and T+6m (operational burden)
- Human validation sampling (10% of explanations) requires reviewer availability

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Agents game warm start by memorizing corpus | Medium | High | Version corpus; use held-out set for official ranking; detect suspiciously perfect warm recall |
| LLM-as-judge scores unreliable | Medium | Medium | Human validation sampling with inter-rater kappa; use multiple judge models |
| Fix verification infrastructure too complex | Medium | Medium | Start with TypeScript only; add languages incrementally |
| Temporal decay measurement impractical | High | Low | Make temporal decay optional; report T+0 always, T+3m/T+6m when available |
| Multi-agent swarm configuration varies by tool | Medium | Low | Standardize on 3 agents; allow tool to define coordination mechanism |

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
| Parent | ADR-001 | Bounded Context Map | Agentic Evaluation is a bounded context defined in ADR-001 |
| Wraps | ADR-003 | Evaluation Engine Runner Architecture | Each phase invokes the runner for a full evaluation pass |
| Uses | ADR-005 | Matching Engine Algorithm | Standard matching used within each phase |
| Extends | ADR-006 | Metrics and Scoring | AgenticMetrics extends the base metrics framework |
| Uses | ADR-010 | Docker Isolation and Reproducibility | Fix verification uses Docker build toolchains |
| Results stored by | ADR-011 | Leaderboard and Results | Agentic metrics included in leaderboard rankings |
| Cross-cutting with | ADR-012 | Cross-Cutting Concerns | Fabrication stress test and composite scenarios |
| Tested by | ADR-013 | Testing Strategy | Protocol phase tests |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | AgenticMetrics interface | Source Code | `harness/src/types.ts` (lines 192-231) |
| REF-002 | Fabrication stress test corpus | Data | `corpus/v0.1/manifest.json` (fabrication-stress-test category) |
| REF-003 | Spearman rank correlation | Statistical Method | https://en.wikipedia.org/wiki/Spearman%27s_rank_correlation_coefficient |
| REF-004 | Cohen's kappa | Statistical Method | https://en.wikipedia.org/wiki/Cohen%27s_kappa |
| REF-005 | LLM-as-judge methodology | Research | Zheng et al., "Judging LLM-as-a-Judge" (2023) |
| REF-006 | Multi-agent evaluation in AI | Research | Park et al., "Generative Agents" (2023) |
