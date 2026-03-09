# ADR-011: Leaderboard and Results Management

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-011 |
| **Initiative** | Leaderboard and Results |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** collecting, validating, storing, and ranking QE tool evaluation results from multiple tools, versions, and corpus versions, where the community needs a trustworthy public leaderboard while preventing gaming through held-out data, temporal versioning, and multi-domain minimum coverage,

**facing** the challenge of defining a fair ranking system that balances multiple metrics (F1, severity-weighted recall, cost efficiency), ensuring result integrity through schema validation and reproducibility verification, supporting versioned results keyed by corpus version and tool version, and maintaining a held-out evaluation pathway that only maintainers can execute,

**we decided for** a Git-based result submission workflow (fork -> run -> generate results -> PR), validated result schemas (AQBResult + Scorecard JSON), dual-track scoring (public corpus for anyone, held-out corpus for official ranking by maintainers only), a three-tier ranking system (primary=F1, secondary=severity_weighted_recall, tertiary=cost_efficiency), versioned results keyed by `{corpus_version}/{tool}/{tool_version}`, auto-generated leaderboard data in `leaderboard/rankings.json`, and anti-gaming measures including held-out set isolation, temporal versioning, and multi-domain minimum coverage requirements,

**and neglected** (a) a database-backed leaderboard service because it adds hosting and operational complexity for a GitHub-hosted benchmark; (b) self-reported results without validation because they cannot be trusted for ranking; (c) a single-metric ranking because it obscures important performance dimensions,

**to achieve** a trustworthy, transparent leaderboard where rankings reflect genuine tool capability, reproducible results through Git-tracked JSON files with full provenance, fair ranking that considers multiple quality dimensions, anti-gaming protection through held-out data and coverage requirements, and low-friction participation through the standard GitHub PR workflow,

**accepting that** Git-based results create many JSON files in the repository, the fork-run-PR workflow requires contributors to run evaluations locally (non-trivial setup), the held-out evaluation pathway creates a privileged maintainer role, and the three-tier ranking system may not capture all dimensions stakeholders care about.

---

## Problem Statement

Without a structured results management system, benchmark results are unreliable and unverifiable:

| Problem | Impact | Example |
|---------|--------|---------|
| No result validation | Invalid or incomplete results submitted | Missing domain metrics, incorrect schema |
| No provenance tracking | Cannot determine how results were produced | Which corpus version? Which adapter config? |
| No reproducibility | Results cannot be independently verified | Different environments produce different results |
| No ranking fairness | Single metric masks tool weaknesses | Tool with 95% security recall but 10% accessibility recall ranked #1 |
| Gaming risk | Tools trained on public corpus answers | LLM tool memorizes corpus, achieves 100% recall |
| Version confusion | Results from different corpus versions compared | v0.1 results vs v0.2 results mixed |
| No minimum coverage | Tools evaluated on only 1 domain ranked alongside full-coverage tools | Unfair comparison |

### Current State

| Component | Status | Gap |
|-----------|--------|-----|
| Result format | `AQBResult` and `Scorecard` types defined in `types.ts` | No storage, validation, or submission pipeline |
| Results directory | `results/` in project structure | Empty; no directory structure defined |
| Leaderboard directory | `leaderboard/` in project structure | Empty; no rankings file or generation script |
| Held-out evaluation | `corpus/held-out/` directory exists | No maintainer-only evaluation workflow |
| Anti-gaming measures | Held-out set concept defined | No enforcement mechanisms |

---

## Opportunity

A structured leaderboard transforms AQB from an evaluation tool into a credible benchmark platform.

| Dimension | Before | After |
|-----------|--------|-------|
| Result integrity | Unvalidated self-reports | Schema-validated, reproducibility-verified |
| Ranking fairness | N/A | Three-tier ranking with multi-domain coverage requirement |
| Gaming resistance | N/A | Held-out set, temporal versioning, coverage minimums |
| Provenance | Unknown | Full: corpus version, tool version, adapter config, run timestamp |
| Community participation | No workflow | Standard fork-run-PR GitHub workflow |
| Historical tracking | No history | Versioned results with full Git history |

### Result Submission Workflow

```
Contributor                          AQB Repository
    |                                      |
    |  1. Fork repository                  |
    |------------------------------------->|
    |                                      |
    |  2. Run evaluation locally           |
    |  npx aqb run --adapter mytool \      |
    |    --corpus ./corpus/v0.1/ \         |
    |    --output json \                   |
    |    --results-dir ./results/mytool/   |
    |                                      |
    |  3. Commit results JSON              |
    |  results/v0.1/mytool/1.0.0/          |
    |    result.json                       |
    |    scorecard.json                    |
    |                                      |
    |  4. Open PR                          |
    |------------------------------------->|
    |                                      |
    |  5. CI validates results             |
    |  - Schema validation (Zod)           |
    |  - Minimum coverage check            |
    |  - Scorecard regeneration verify     |
    |<-------------------------------------|
    |                                      |
    |  6. Maintainer review + merge        |
    |  - Spot-check plausibility           |
    |  - Run held-out evaluation (optional)|
    |------------------------------------->|
    |                                      |
    |  7. Leaderboard auto-update          |
    |  leaderboard/rankings.json updated   |
    |                                      |
```

### Held-Out Evaluation Pathway

```
Maintainer Only
    |
    |  1. Contributor submits adapter (source code or Docker image)
    |
    |  2. Maintainer runs held-out evaluation
    |  npx aqb run --adapter submitted-adapter \
    |    --corpus ./corpus/held-out/ \
    |    --output json \
    |    --results-dir ./results/held-out/
    |
    |  3. Results added to held-out rankings
    |  leaderboard/held-out-rankings.json (not published in detail)
    |
    |  4. Summary metrics published (F1, SWR, cost -- no per-sample details)
    |
    |  Held-out samples NEVER exposed to contributors
```

---

## Summary

| Capability | Description |
|------------|-------------|
| Result submission | Fork -> run -> commit results -> PR workflow |
| Schema validation | AQBResult + Scorecard validated against Zod schemas in CI |
| Dual-track scoring | Public corpus (anyone can run) + held-out corpus (maintainers only) |
| Three-tier ranking | Primary=F1, secondary=severity_weighted_recall, tertiary=cost_efficiency |
| Versioned results | Keyed by `{corpus_version}/{tool}/{tool_version}` |
| Auto-generated leaderboard | `leaderboard/rankings.json` generated from `results/` directory |
| Anti-gaming | Held-out set, multi-domain coverage minimum, temporal versioning |
| Provenance tracking | Full run metadata: corpus version, tool version, timestamp, adapter config hash |

### Ranking System

| Rank Tier | Metric | Direction | Weight | Tiebreaker |
|-----------|--------|-----------|--------|------------|
| Primary | F1 (aggregate) | Higher is better | 1.0 | N/A |
| Secondary | Severity-weighted recall | Higher is better | 0.8 | Used when F1 within 0.01 |
| Tertiary | Cost efficiency (findings per dollar) | Higher is better | 0.5 | Used when SWR within 0.01 |

For agentic tools, additional ranking dimensions:

| Rank Tier | Metric | Direction | Weight |
|-----------|--------|-----------|--------|
| Agentic bonus | Learning transfer (delta_recall) | Higher is better | 0.3 |
| Agentic bonus | Fix success rate | Higher is better | 0.2 |
| Agentic bonus | Explanation quality (LLM judge score) | Higher is better | 0.2 |

### Minimum Coverage Requirements

| Requirement | Threshold | Rationale |
|-------------|-----------|-----------|
| Domains evaluated | >= 5 of 14 | Prevents single-domain gaming |
| Samples per domain | >= 50% of domain samples | Prevents cherry-picking easy samples |
| Languages evaluated | >= 2 of 5 | Prevents language-specific gaming |
| Difficulty range | At least 1 sample at difficulty 4+ | Prevents easy-only evaluation |
| Adversarial negatives | Must include all adversarial samples in evaluated domains | Fabrication rate must be measurable |

Tools that do not meet minimum coverage are listed separately as "partial evaluations" and do not appear in the main leaderboard.

### Results Directory Structure

```
results/
  v0.1/                                -- Corpus version
    semgrep/                            -- Tool name
      1.60.0/                           -- Tool version
        result.json                     -- Full AQBResult
        scorecard.json                  -- Scorecard summary
        metadata.json                   -- Run metadata (timestamp, config hash, environment)
      1.65.0/                           -- Newer version
        result.json
        scorecard.json
        metadata.json
    eslint/
      9.5.0/
        result.json
        scorecard.json
        metadata.json
    aqe/
      3.0.0/
        result.json
        scorecard.json
        agentic-result.json             -- AgenticMetrics (four-phase protocol results)
        metadata.json
  held-out/                             -- Maintainer-only results (not in Git)
    v0.1/
      semgrep/
        1.60.0/
          result.json                   -- Full results (never published in detail)
          summary.json                  -- Only summary metrics published

leaderboard/
  rankings.json                         -- Auto-generated from results/
  historical/                           -- Snapshot per update
    rankings-2026-03-09.json
```

### Leaderboard JSON Schema

```json
{
  "generated": "2026-03-09T14:30:22Z",
  "corpus_version": "0.1.0",
  "rankings": [
    {
      "rank": 1,
      "tool": "aqe",
      "version": "3.0.0",
      "f1": 0.823,
      "precision": 0.891,
      "recall": 0.765,
      "severity_weighted_recall": 0.812,
      "fabrication_rate": 0.012,
      "cost_efficiency": 45.2,
      "domains_evaluated": 14,
      "samples_evaluated": 1680,
      "agentic": {
        "learning_transfer": 0.045,
        "fix_success_rate": 0.67,
        "explanation_quality": 4.2
      },
      "submitted": "2026-03-08",
      "evaluation_type": "public"
    },
    {
      "rank": 2,
      "tool": "semgrep",
      "version": "1.60.0",
      "f1": 0.780,
      "precision": 0.847,
      "recall": 0.723,
      "severity_weighted_recall": 0.691,
      "fabrication_rate": 0.023,
      "cost_efficiency": "Infinity",
      "domains_evaluated": 8,
      "samples_evaluated": 1200,
      "agentic": null,
      "submitted": "2026-03-07",
      "evaluation_type": "public"
    }
  ],
  "partial_evaluations": [
    {
      "tool": "eslint",
      "version": "9.5.0",
      "domains_evaluated": 3,
      "reason": "Below 5-domain minimum for main leaderboard",
      "f1": 0.650
    }
  ]
}
```

### Anti-Gaming Measures

| Measure | How It Works | What It Prevents |
|---------|-------------|-----------------|
| Held-out set (30%) | Official rankings use held-out corpus that contributors never see | Tools trained on public corpus answers |
| Temporal versioning | Results tagged with corpus version; re-evaluation required on corpus updates | Gaming by memorizing specific corpus version |
| Multi-domain minimum | Must evaluate >= 5 domains to appear on main leaderboard | Cherry-picking the easiest domain |
| Coverage minimum | Must evaluate >= 50% of samples per domain | Skipping hard samples |
| Adversarial inclusion | Must include all adversarial negatives in evaluated domains | Avoiding fabrication detection |
| Reproducibility spot-check | Maintainers can re-run submitted results on random sample subset | Fabricated result submissions |
| Result regeneration | CI regenerates scorecard from result.json; must match submitted scorecard | Manually edited scorecard |
| Config hash logging | Adapter configuration hash logged; configuration changes require new submission | Silent configuration tuning |

---

## Options Considered

### Option 1: [Selected] -- Git-based Results with Auto-generated Leaderboard

**Description:** Results stored as JSON files in the Git repository, submitted via PR workflow, validated in CI, with auto-generated leaderboard rankings.

**Pros:**
- Full provenance: Git history tracks every result submission
- Transparent: anyone can inspect results and leaderboard generation logic
- Low infrastructure: no database or hosting required beyond GitHub
- Standard workflow: fork-run-PR is familiar to OSS contributors
- Versioned: results tagged by corpus and tool version
- Reproducible: anyone can regenerate leaderboard from results directory

**Cons:**
- Many JSON files in repository (one per tool per version per corpus version)
- PR workflow has overhead for result submission
- No real-time leaderboard updates (requires PR merge)
- Git repository size grows with each result submission

### Option 2: [Rejected] -- Database-backed Leaderboard Service

**Description:** Deploy a web service with a database for result submission, storage, and leaderboard display.

**Pros:**
- Real-time leaderboard updates
- Rich querying and filtering
- Web-based visualization
- API for programmatic result submission

**Cons:**
- Hosting and operational costs
- Single point of failure
- Results not transparent (database is not publicly inspectable)
- Authentication and authorization complexity
- Database migrations for schema changes
- Additional infrastructure to maintain

**Rejection rationale:** AQB is a GitHub-hosted open-source project. A database service adds operational burden without justifying it, since the PR-based workflow provides transparency and auditability that a database cannot.

### Option 3: [Rejected] -- Self-reported Results Without Validation

**Description:** Allow tools to submit result JSON directly without CI validation or reproducibility verification.

**Pros:**
- Lowest friction for result submission
- No CI setup required
- Fast turnaround

**Cons:**
- Results cannot be trusted (could be fabricated or cherry-picked)
- No schema validation
- No reproducibility guarantee
- No provenance tracking
- Leaderboard becomes meaningless

**Rejection rationale:** A benchmark is only as credible as its results. Unvalidated self-reports undermine the entire purpose of having a benchmark.

---

## Consequences

### Positive
- Every result submission is validated against schema, regenerated scorecard verified, and coverage minimums enforced
- Full provenance: corpus version, tool version, adapter config hash, run timestamp, environment info
- Three-tier ranking provides nuanced comparison that goes beyond a single number
- Held-out evaluation pathway prevents gaming by tools that memorize public corpus
- Multi-domain minimum coverage prevents cherry-picking of favorable domains
- Auto-generated leaderboard ensures rankings reflect actual results
- Historical snapshots enable trend analysis over time

### Negative
- Git repository grows with each result submission (mitigated by JSON compression)
- Fork-run-PR workflow has higher friction than self-reporting
- Held-out evaluation creates privileged maintainer role (potential bottleneck)
- Three-tier ranking is more complex to explain than single-number ranking
- Minimum coverage requirements may exclude tools focused on specific domains

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Held-out set accidentally leaked | Low | Critical | Separate branch/repo; access logging; canary samples; revoke and regenerate if leaked |
| Maintainer bottleneck for held-out evaluation | Medium | Medium | Multiple maintainers; scheduled evaluation batches; self-service for public results |
| Results repository becomes too large | Low | Low | Per-version directories; prune old results; Git LFS for large files |
| Tool vendors dispute ranking criteria | Medium | Medium | Publish ranking methodology transparently; allow community input on weights |
| Coverage minimums exclude legitimate single-domain tools | Medium | Low | "Partial evaluations" section acknowledges single-domain tools without penalizing |
| Gaming through multiple submissions with different configs | Medium | Medium | One leaderboard entry per tool+version; best result shown; config hash tracked |

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
| Parent | ADR-001 | Bounded Context Map | Leaderboard and Results is a bounded context defined in ADR-001 |
| Consumes | ADR-006 | Metrics and Scoring | Leaderboard ranks tools by Scorecard metrics |
| Includes | ADR-007 | Agentic Evaluation Protocol | Agentic metrics included in leaderboard rankings |
| Triggered by | ADR-008 | CLI and API Gateway | `aqb run --results-dir` generates result files |
| Anti-gaming | ADR-009 | Corpus Data Sourcing Strategy | Held-out set isolation prevents gaming |
| Validated by | ADR-013 | Testing Strategy | Result schema validation tests |
| Cross-cutting | ADR-012 | Cross-Cutting Concerns | Temporal evaluation and corpus refresh affect result versioning |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | AQBResult interface | Source Code | `harness/src/types.ts` (lines 147-167) |
| REF-002 | Scorecard interface | Source Code | `harness/src/types.ts` (lines 235-245) |
| REF-003 | AQBMetrics interface | Source Code | `harness/src/types.ts` (lines 169-180) |
| REF-004 | HuggingFace Open LLM Leaderboard | Example | https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard |
| REF-005 | SWE-bench Leaderboard | Example | https://www.swebench.com/ |
| REF-006 | GitHub PR-based contribution workflow | Standard | https://docs.github.com/en/get-started/quickstart/contributing-to-projects |
