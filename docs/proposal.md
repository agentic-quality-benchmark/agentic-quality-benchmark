# AQB: A Multi-Domain Benchmark for Evaluating Agentic Quality Engineering

## Abstract

As AI-powered quality engineering agents proliferate, the field lacks a standardized benchmark to evaluate their effectiveness at finding real defects, generating meaningful tests, and assessing software quality. Existing benchmarks (SWE-bench, SastBench, TestGenEval) address narrow slices — bug fixing, SAST triage, or test generation — but none evaluate the full spectrum of agentic QE capabilities across multiple domains. We propose AQB (Agentic Quality Benchmark), a multi-domain evaluation framework comprising a seeded defect corpus, a standardized evaluation harness, and agentic behavior metrics that go beyond traditional precision/recall to measure multi-turn reasoning, learning transfer, and coordination effectiveness.

---

## 1. Motivation

### 1.1 The Gap

| Benchmark | Scope | Limitation for QE Evaluation |
|-----------|-------|------------------------------|
| [SWE-bench](https://www.swebench.com/SWE-bench/) | Bug fixing from GitHub issues | Measures *coding* agents, not *QE* agents |
| [SastBench](https://arxiv.org/abs/2601.02941) (Jan 2026) | SAST false positive triage | Narrow — SAST triage only, not full security scanning |
| [TestGenEval](https://arxiv.org/html/2410.00752v1) | Unit test generation | Non-agentic, single-shot LLM evaluation |
| [FeatureBench](https://arxiv.org/abs/2602.10975) | Complex feature development | Coding agents, not QE |
| [Qodo Code Review](https://www.qodo.ai/blog/how-we-built-a-real-world-benchmark-for-ai-code-review/) | AI code review precision/recall | Code review only, not full QE lifecycle |
| [AgentBench](https://arxiv.org/html/2507.21504v1) | General agent capabilities | Too generic for domain-specific QE evaluation |
| [TestEval](https://arxiv.org/html/2406.04531v1) | Test case generation coverage | Single-shot LLM, no agentic behavior |
| [Snorkel Agentic Coding](https://snorkel.ai/blog/introducing-the-snorkel-agentic-coding-benchmark/) | Agentic coding tasks | General coding, not QE-specific |

**No benchmark evaluates the full spectrum of what a QE agent does**: finding bugs, generating meaningful tests, assessing quality, predicting defects, detecting security issues, validating requirements — and doing it *agentically* (multi-turn, tool-using, learning across sessions).

### 1.2 Why This Matters

- **Credibility**: Without evals, QE agent claims are unverifiable marketing
- **Comparison**: No way to compare QE tools (AQE vs. Snyk AI vs. SonarQube AI vs. CodeQL Copilot)
- **Progress tracking**: No way to measure if agents are improving over time
- **Trust calibration**: Users need to know false positive rates and recall limits
- **Research**: The academic community lacks a shared evaluation target for QE agent research

### 1.3 The Opportunity

SWE-bench proved that a well-designed benchmark *becomes the standard by which the entire industry measures itself*. The QE agent space has no SWE-bench equivalent. AQB aims to fill that gap.

---

## 2. Benchmark Design

### 2.1 Three-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│            Layer 3: Agentic Behavior             │
│  Multi-turn reasoning, learning transfer,        │
│  tool selection, coordination, explanation        │
├─────────────────────────────────────────────────┤
│            Layer 2: Evaluation Harness            │
│  Dockerized runner, finding-to-truth matching,   │
│  precision/recall/F1, cost/latency tracking      │
├─────────────────────────────────────────────────┤
│            Layer 1: Seeded Defect Corpus          │
│  Known-labeled issues across 9 QE domains,       │
│  multi-language, difficulty-rated                 │
└─────────────────────────────────────────────────┘
```

---

## 3. Layer 1: Seeded Defect Corpus

### 3.1 Corpus Structure

```
aqb-corpus/
├── security/                          # ~200 samples
│   ├── sql-injection/                 # 50+ samples, labeled line + CWE
│   ├── xss/                           # 50+ samples
│   ├── hardcoded-secrets/             # 30+ samples
│   ├── path-traversal/                # 20+ samples
│   ├── command-injection/             # 20+ samples
│   ├── crypto-weakness/               # 20+ samples
│   └── ssrf/                          # 10+ samples
│
├── defects/                           # ~150 samples
│   ├── null-deref/                    # 40+ with git history
│   ├── race-condition/                # 30+ samples
│   ├── off-by-one/                    # 30+ samples
│   ├── resource-leak/                 # 25+ samples
│   ├── state-corruption/              # 20+ samples
│   └── type-confusion/               # 15+ samples
│
├── test-gaps/                         # ~100 samples
│   ├── uncovered-branches/            # Projects with known coverage gaps
│   ├── untested-edge-cases/           # Functions with known missing tests
│   ├── flaky-tests/                   # Test suites with known flaky tests
│   └── dead-code/                     # Unreachable code masking coverage
│
├── requirements/                      # ~200 samples
│   ├── ambiguous/                     # 100+ requirement statements, labeled
│   ├── untestable/                    # 50+ untestable requirements
│   └── well-written/                  # 50+ gold-standard (negatives)
│
├── contracts/                         # ~80 samples
│   ├── breaking-changes/              # API v1→v2 with labeled breaks
│   ├── compatible-changes/            # Non-breaking changes (negatives)
│   └── schema-drift/                  # Subtle schema incompatibilities
│
├── quality/                           # ~120 samples
│   ├── high-complexity/               # Known complexity hotspots
│   ├── technical-debt/                # Labeled tech debt
│   ├── code-smells/                   # Common anti-patterns
│   └── clean-code/                    # Well-maintained code (negatives)
│
├── accessibility/                     # ~100 samples
│   ├── wcag-violations/               # HTML with labeled WCAG failures
│   ├── wcag-compliant/                # Accessible HTML (negatives)
│   └── partial-compliance/            # Edge cases
│
├── performance/                       # ~60 samples
│   ├── n-plus-one/                    # DB query anti-patterns
│   ├── memory-leaks/                  # Resource management issues
│   └── algorithmic-complexity/        # O(n²) where O(n) exists
│
└── meta/
    ├── manifest.json                  # Full corpus index with labels
    ├── difficulty-ratings.json        # Per-sample difficulty (1-5)
    └── language-distribution.json     # Language breakdown
```

### 3.2 Sample Label Schema

Every sample in the corpus carries a structured label:

```json
{
  "id": "sec-sqli-042",
  "domain": "security",
  "category": "sql-injection",
  "language": "typescript",
  "difficulty": 3,
  "ground_truth": {
    "issues": [
      {
        "type": "CWE-89",
        "severity": "critical",
        "location": {
          "file": "src/db/users.ts",
          "line_start": 42,
          "line_end": 42,
          "column_start": 15,
          "column_end": 67
        },
        "description": "User input concatenated into SQL query without parameterization",
        "fix_available": true,
        "fix_file": "fixes/sec-sqli-042.patch"
      }
    ],
    "false_positives": [
      {
        "location": { "file": "src/db/users.ts", "line_start": 55 },
        "reason": "Parameterized query — not vulnerable despite string template syntax"
      }
    ]
  },
  "metadata": {
    "source": "cve-2024-XXXXX",
    "sourcing_method": "real_cve",
    "human_verified": true,
    "verification_date": "2026-03-01"
  }
}
```

### 3.3 Data Sourcing Strategy

| Method | Description | Domains | Volume Target |
|--------|-------------|---------|---------------|
| **Real CVEs** | Extract pre-fix code from NVD/GitHub Security Advisories | Security | 100+ samples |
| **Historical bug-fix commits** | Mine well-labeled bug-fix PRs from popular OSS repos | Defects, Quality | 150+ samples |
| **Mutation seeding** | Take clean code, inject known defects via mutation operators | All domains | 200+ samples |
| **Synthetic (LLM + human-verified)** | Generate code with specific weaknesses, human-validate labels | Requirements, Contracts | 200+ samples |
| **Adversarial negatives** | Code that *looks* buggy but isn't (false positive stress test) | All domains | 100+ samples |

### 3.4 Language Distribution Target

| Language | % of Corpus | Rationale |
|----------|-------------|-----------|
| TypeScript/JavaScript | 35% | Most common in web QE tooling |
| Python | 25% | ML/data pipeline testing |
| Java | 15% | Enterprise QE |
| Go | 15% | Infrastructure/cloud-native |
| Other (Rust, C#, etc.) | 10% | Breadth coverage |

---

## 4. Layer 2: Evaluation Harness

### 4.1 Architecture

```
┌────────────────────────┐
│    AQB Harness CLI      │
│  aqb run --tool <name>  │
└──────────┬─────────────┘
           │
     ┌─────▼──────┐
     │  Docker     │     Per-sample isolated environment
     │  Runner     │     Deterministic execution
     └─────┬──────┘
           │
    ┌──────▼──────┐
    │   Adapter    │     Translates tool output → AQB Finding format
    │   Layer      │     Adapters for: AQE, Semgrep, SonarQube, ESLint, etc.
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │   Matcher    │     Fuzzy finding-to-ground-truth matching
    │   Engine     │     Location proximity + issue type alignment
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │   Metrics    │     Precision, Recall, F1, Cost, Latency
    │   Reporter   │     Per-domain and aggregate scorecards
    └─────────────┘
```

### 4.2 Result Schema

```typescript
interface AQBResult {
  tool: string;
  version: string;
  run_id: string;
  timestamp: string;

  // What the tool reported
  findings: Finding[];

  // Matching against ground truth
  matches: {
    true_positives: MatchedFinding[];   // Tool found it, it's real
    false_positives: UnmatchedFinding[]; // Tool found it, it's not real
    false_negatives: MissedIssue[];      // It's real, tool missed it
    true_negatives: number;              // Clean code correctly ignored
  };

  // Core metrics
  metrics: {
    precision: number;          // TP / (TP + FP)
    recall: number;             // TP / (TP + FN)
    f1: number;                 // 2 * P * R / (P + R)
    false_positive_rate: number;
    severity_weighted_recall: number; // Critical issues weighted 3x
    mean_time_to_detect_ms: number;
    total_latency_ms: number;
    token_cost_usd: number;     // LLM inference cost
    findings_per_dollar: number;
  };

  // Per-domain breakdown
  domain_metrics: Record<Domain, {
    precision: number;
    recall: number;
    f1: number;
    samples_evaluated: number;
    avg_latency_ms: number;
  }>;

  // Per-difficulty breakdown
  difficulty_metrics: Record<1 | 2 | 3 | 4 | 5, {
    recall: number;  // How well does it find subtle vs obvious issues?
  }>;

  // Per-language breakdown
  language_metrics: Record<Language, {
    precision: number;
    recall: number;
  }>;
}

type Domain =
  | 'security'
  | 'defects'
  | 'test-generation'
  | 'coverage-analysis'
  | 'requirements'
  | 'contracts'
  | 'quality'
  | 'accessibility'
  | 'performance'
  | 'chaos-resilience'
  | 'code-intelligence'
  | 'enterprise-integration'
  | 'flaky-tests'
  | 'visual-regression';

interface Finding {
  id: string;
  domain: Domain;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: number;       // 0-1
  location: {
    file: string;
    line_start: number;
    line_end: number;
  };
  description: string;
  suggestion?: string;
  fix?: string;
}
```

### 4.3 Matching Algorithm

Findings are matched to ground truth using fuzzy matching:

```
MATCH if ALL of:
  1. Same file path
  2. Line range overlap ≥ 50% (or within ±5 lines for single-line issues)
  3. Domain matches
  4. Category matches OR CWE/issue-type is compatible
     (e.g., CWE-89 finding matches "sql-injection" ground truth)

PARTIAL MATCH if:
  1-2 match but 3-4 only partially match
  (e.g., found the right line but called it "input validation" instead of "SQL injection")
  → Counted as 0.5 TP for metrics, flagged for review
```

### 4.4 Tool Adapter Interface

To make AQB tool-agnostic, each tool implements a simple adapter:

```typescript
interface AQBToolAdapter {
  name: string;
  version: string;

  // Run the tool against a single corpus sample
  analyze(sample: CorpusSample): Promise<Finding[]>;

  // Optional: setup/teardown for the tool
  setup?(): Promise<void>;
  teardown?(): Promise<void>;
}
```

**Built-in adapters to ship with v1:**

| Adapter | Tool | Purpose |
|---------|------|---------|
| `aqe-adapter` | Agentic QE (this project) | Primary evaluation target |
| `semgrep-adapter` | Semgrep OSS | SAST baseline |
| `eslint-adapter` | ESLint + security plugins | Linting baseline |
| `sonarqube-adapter` | SonarQube Community | Quality baseline |
| `codeql-adapter` | CodeQL | Security baseline |
| `axe-adapter` | axe-core standalone | Accessibility baseline |
| `llm-raw-adapter` | Raw Claude/GPT (no agent) | LLM-only baseline |

---

## 5. Layer 3: Agentic Behavior Evaluation

This layer differentiates AQB from traditional static analysis benchmarks. It evaluates the *agent-ness* — capabilities that only emerge in agentic systems.

### 5.1 Metrics

| Metric | What It Measures | Evaluation Method |
|--------|-----------------|-------------------|
| **Multi-turn refinement** | Does the agent refine findings across conversation turns? | Give ambiguous code, measure finding quality improvement over 3 turns |
| **Tool selection accuracy** | Does it pick the right analysis for the problem? | Give mixed issues, check which tools get invoked vs. optimal tool selection |
| **Learning transfer** | Does pattern storage improve future detection? | Run corpus twice with persistent memory, measure recall delta (Δ) |
| **Swarm coordination** | Do multi-agent swarms find more than single agents? | Compare single-agent vs. 3-agent vs. 8-agent results |
| **Explanation quality** | Are findings actionable and accurate? | LLM-as-judge scoring on 1-5 scale + human validation sample |
| **Fix suggestion quality** | Do suggested fixes actually resolve the issue? | Apply generated patches, run test suite, check pass rate |
| **Severity calibration** | Does severity ranking match expert consensus? | Spearman rank correlation between agent and expert severity ordering |
| **Triage accuracy** | Priority ordering matches real-world impact? | NDCG (Normalized Discounted Cumulative Gain) against expert ranking |
| **False positive resilience** | Does the agent avoid flagging clean code? | Run against adversarial negatives, measure FP rate |
| **Cost efficiency** | Findings per dollar of LLM inference | Track token usage per finding, compute cost-normalized recall |

### 5.2 Agentic Evaluation Protocol

```
Phase 1: Cold Start (No Prior Knowledge)
  - Run all corpus samples through agent with empty memory
  - Record: findings, latency, cost, explanation quality
  - Compute: baseline precision/recall/F1

Phase 2: Warm Start (With Learning)
  - Seed agent with patterns from Phase 1
  - Re-run corpus with persistent memory enabled
  - Compute: Δ precision, Δ recall, Δ latency
  - Measure: learning transfer effectiveness

Phase 3: Multi-Agent (Swarm Mode)
  - Run corpus through multi-agent configuration
  - Compare: single-agent vs swarm findings
  - Measure: unique findings per agent, consensus quality, coordination overhead

Phase 4: Adversarial (Stress Test)
  - Run adversarial negatives (clean code that looks buggy)
  - Run adversarial positives (bugs hidden in clean-looking code)
  - Compute: FP rate under adversarial conditions
  - Measure: severity calibration under uncertainty
```

---

## 6. Domain-Specific Evaluation Details

### 6.1 Security Scanning

| Metric | Description | Target |
|--------|-------------|--------|
| Recall@CWE-Top25 | Coverage of MITRE CWE Top 25 | >80% |
| False Positive Rate | FP / (FP + TN) | <15% |
| Severity Calibration | Agreement with CVSSv3 ratings | Spearman ρ > 0.7 |
| Remediation Quality | Fix suggestions that compile + pass tests | >60% |

**Corpus**: Real CVEs from NVD + Semgrep-filtered negatives (following SastBench methodology)

### 6.2 Defect Prediction

| Metric | Description | Target |
|--------|-------------|--------|
| AUC-ROC | Area under ROC curve | >0.75 |
| Precision@Top10 | Precision in top-10 riskiest files | >50% |
| Calibration (Brier Score) | Predicted probability vs. actual defect rate | <0.25 |
| Feature Importance Stability | Consistency of feature rankings across runs | >0.8 ICC |

**Corpus**: Historical bug-fix commits from popular OSS repos with git history preserved

### 6.3 Test Generation

| Metric | Description | Target |
|--------|-------------|--------|
| Mutation Score | % of seeded mutants killed by generated tests | >40% |
| Coverage Delta | Line/branch coverage improvement | >20pp |
| Compilability | Generated tests that compile without errors | >90% |
| Assertion Quality | Non-tautological, meaningful assertions | >80% |
| Edge Case Coverage | Tests for boundary conditions | >50% of known edge cases |

**Corpus**: Functions with known edge cases + mutation-seeded variants (following TestGenEval methodology)

### 6.4 Coverage Analysis

| Metric | Description | Target |
|--------|-------------|--------|
| Gap Detection Accuracy | Correctly identified coverage gaps | >85% |
| Risk Prioritization NDCG | Quality of risk-based gap ordering | >0.7 |
| False Gap Rate | Reported gaps that aren't real | <10% |
| Scalability | Time on 100K-file codebase | <60s |

**Corpus**: Projects with known coverage reports + injected gaps

### 6.5 Quality Assessment

| Metric | Description | Target |
|--------|-------------|--------|
| Expert Agreement | Correlation with expert quality ratings | Pearson r > 0.7 |
| Grade Calibration | A/B/C/D/F grades match expert consensus | >70% agreement |
| Hotspot Detection | Correctly identified complexity hotspots | Recall >75% |
| Actionability | Recommendations rated useful by developers | >60% |

**Corpus**: Code samples rated by 3+ experienced developers

### 6.6 Requirements Validation

| Metric | Description | Target |
|--------|-------------|--------|
| Ambiguity Precision | Flagged requirements that are truly ambiguous | >70% |
| Ambiguity Recall | Ambiguous requirements correctly flagged | >80% |
| Testability Correlation | Score correlation with expert assessment | Pearson r > 0.6 |
| BDD Quality | Generated scenarios that are executable | >75% |

**Corpus**: Requirements documents with expert-labeled ambiguity/testability

### 6.7 Code Intelligence

| Metric | Description | Target |
|--------|-------------|--------|
| Impact Prediction F1 | Changed files correctly predicted as impacted | >0.7 |
| Dependency Completeness | All actual dependencies discovered | >90% |
| Search Relevance | Top-5 search results contain target | >80% |

**Corpus**: Repos with known dependency graphs + historical change sets

### 6.8 Contract Testing

| Metric | Description | Target |
|--------|-------------|--------|
| Breaking Change Recall | Real breaks detected | >90% |
| Breaking Change Precision | Reported breaks that are real | >80% |
| Schema Validation | Correct identification of invalid schemas | >95% |

**Corpus**: API version pairs with labeled breaking/non-breaking changes

### 6.9 Accessibility

| Metric | Description | Target |
|--------|-------------|--------|
| WCAG Violation Recall | Known violations detected | >85% |
| False Positive Rate | Reported violations that aren't real | <10% |
| Remediation Quality | Fix suggestions that resolve violation | >70% |

**Corpus**: HTML pages with expert-labeled WCAG 2.1/2.2 violations

---

## 7. Evaluation Scorecard

### 7.1 Aggregate Scorecard Format

```
╔══════════════════════════════════════════════════════════════╗
║                    AQB EVALUATION SCORECARD                  ║
║                    Tool: Agentic QE v3.7.14                  ║
║                    Date: 2026-03-08                           ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  OVERALL                                                     ║
║  ────────                                                    ║
║  Precision:  72.3%    Recall: 68.1%    F1: 70.1%            ║
║  FP Rate:    14.2%    Cost:   $0.47/run   Latency: 12.3s    ║
║                                                              ║
║  PER-DOMAIN BREAKDOWN                                        ║
║  ─────────────────────                                       ║
║  Domain          Prec    Rec     F1     Samples    Latency   ║
║  Security        81.2%   74.5%   77.7%  200        8.2s      ║
║  Defects         65.3%   71.2%   68.1%  150        15.1s     ║
║  Test Gaps       68.7%   62.3%   65.3%  100        22.4s     ║
║  Requirements    79.1%   82.4%   80.7%  200        3.1s      ║
║  Contracts       88.2%   85.1%   86.6%  80         5.3s      ║
║  Quality         71.5%   58.9%   64.6%  120        7.8s      ║
║  Accessibility   82.3%   78.9%   80.6%  100        18.2s     ║
║  Performance     55.4%   48.2%   51.6%  60         11.7s     ║
║                                                              ║
║  AGENTIC METRICS                                             ║
║  ────────────────                                            ║
║  Learning Transfer (Δ Recall):     +8.3%                     ║
║  Multi-Turn Refinement:            +12.1% F1 over 3 turns    ║
║  Swarm Boost (8-agent vs single):  +15.7% Recall             ║
║  Explanation Quality (1-5):        3.8                        ║
║  Fix Application Success:          62.4%                      ║
║  Severity Calibration (ρ):         0.73                       ║
║  Cost Efficiency:                  14.2 findings/$            ║
║                                                              ║
║  DIFFICULTY BREAKDOWN                                        ║
║  ────────────────────                                        ║
║  Difficulty 1 (Obvious):    Recall 94.2%                     ║
║  Difficulty 2 (Easy):       Recall 81.7%                     ║
║  Difficulty 3 (Medium):     Recall 65.3%                     ║
║  Difficulty 4 (Hard):       Recall 42.1%                     ║
║  Difficulty 5 (Subtle):     Recall 18.9%                     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

### 7.2 Comparative Scorecard

```
╔══════════════════════════════════════════════════════════════╗
║               AQB COMPARATIVE LEADERBOARD                    ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Rank  Tool              F1     Recall  Prec   Cost   Learn  ║
║  ────  ────              ──     ──────  ────   ────   ─────  ║
║  1     AQE v3.7          70.1%  68.1%   72.3%  $0.47  +8.3%  ║
║  2     Claude Raw        61.2%  58.4%   64.3%  $1.20  N/A    ║
║  3     SonarQube 10      55.8%  72.1%   45.6%  $0     N/A    ║
║  4     Semgrep Pro       52.3%  48.9%   56.2%  $0     N/A    ║
║  5     ESLint + Plugins  38.1%  32.4%   46.2%  $0     N/A    ║
║                                                              ║
║  * "Learn" = Recall improvement with persistent memory       ║
║  * "Cost" = LLM inference cost per full corpus run           ║
║  * N/A = Not an agentic tool (no learning capability)        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 8. Implementation Plan

### Phase 1: Foundation (Weeks 1-4)

**Goal**: Security domain corpus + basic harness

- [ ] Define sample label schema (JSON Schema)
- [ ] Collect 100 real CVE samples (pre-fix code + labels)
- [ ] Collect 50 adversarial negatives (clean code that looks vulnerable)
- [ ] Build mutation seeding tool for injecting known vulnerabilities
- [ ] Build Docker-based evaluation runner
- [ ] Build finding-to-ground-truth matcher
- [ ] Build Semgrep adapter (baseline)
- [ ] Build AQE adapter
- [ ] Run first evaluation, publish internal results

### Phase 2: Multi-Domain (Weeks 5-8)

**Goal**: Expand to 5+ domains

- [ ] Add defect prediction corpus (historical bug-fix commits)
- [ ] Add test generation corpus (functions + known edge cases)
- [ ] Add requirements corpus (labeled requirement documents)
- [ ] Add contract testing corpus (API version pairs)
- [ ] Build adapters for SonarQube, ESLint, CodeQL
- [ ] Implement per-domain metric calculations
- [ ] Generate first multi-domain scorecard

### Phase 3: Agentic Metrics (Weeks 9-12)

**Goal**: Layer 3 — evaluate agent-specific capabilities

- [ ] Implement cold-start vs warm-start protocol
- [ ] Implement multi-agent evaluation mode
- [ ] Build LLM-as-judge for explanation quality
- [ ] Implement fix application + test verification
- [ ] Implement severity calibration scoring
- [ ] Implement cost tracking (tokens, latency)
- [ ] Run full 3-phase evaluation protocol

### Phase 4: Publication (Weeks 13-16)

**Goal**: Open-source corpus + harness, submit paper

- [ ] Human verification of all corpus labels (3 reviewers per sample)
- [ ] Run all baseline tools, collect results
- [ ] Statistical significance testing on all comparisons
- [ ] Write paper: methodology, results, analysis
- [ ] Open-source corpus under permissive license (CC BY 4.0 for data, MIT for code)
- [ ] Publish leaderboard website
- [ ] Submit to: ICSE, FSE, ASE, or ISSTA (software engineering venues)

---

## 9. Design Principles

### 9.1 Corpus Quality

1. **Every sample human-verified** — No auto-generated labels without human review
2. **Difficulty-calibrated** — Balanced across difficulty levels (not all easy)
3. **Adversarial negatives** — At least 20% of corpus is clean code (to test FP rate)
4. **Multi-language** — No language monoculture
5. **Realistic** — Drawn from real codebases, not contrived examples

### 9.2 Evaluation Fairness

1. **Tool-agnostic** — Adapter interface, not hardcoded to any tool
2. **Dockerized** — Deterministic execution environment
3. **Fuzzy matching** — Tolerant of minor location differences
4. **Cost-normalized** — Report findings-per-dollar alongside raw metrics
5. **Versioned** — Corpus versions pinned, results tied to specific corpus version

### 9.3 Benchmark Hygiene

1. **No data contamination** — Corpus samples must not appear in LLM training data (use post-cutoff code or synthetic samples)
2. **Regular refresh** — New samples added quarterly to prevent overfitting
3. **Held-out test set** — 30% of corpus never published (like SWE-bench Verified)
4. **Reproducible** — Full Docker images for exact reproduction
5. **Versioned results** — All results tagged with corpus version + tool version

---

## 10. Differentiation from Existing Benchmarks

| Feature | SWE-bench | SastBench | TestGenEval | **AQB** |
|---------|-----------|-----------|-------------|---------|
| Domains | 1 (bug fix) | 1 (SAST) | 1 (test gen) | **14 QE domains** |
| Agentic eval | Partial | No | No | **Full (learning, coordination, multi-turn)** |
| Multi-language | Python only | Mixed | Python only | **5 languages** |
| False positive eval | No | Yes | No | **Yes (adversarial negatives)** |
| Fabrication eval | No | No | No | **Yes (provably-clean stress test)** |
| Cost tracking | No | No | No | **Yes (tokens, latency, $/finding)** |
| Learning measurement | No | No | No | **Yes (cold vs warm start)** |
| Swarm evaluation | No | No | No | **Yes (single vs multi-agent)** |
| Explanation quality | No | No | No | **Yes (LLM-as-judge + human)** |
| Fix verification | Yes (tests) | No | Mutation score | **Yes (apply + test)** |
| Difficulty levels | No | No | No | **Yes (1-5 calibrated)** |
| Composite pipeline | No | No | No | **Yes (end-to-end QE workflow)** |
| Temporal eval | No | No | No | **Yes (concept drift tracking)** |
| Enterprise protocols | No | No | No | **Yes (SOAP, SAP, Kafka, etc.)** |
| Bias detection | No | No | No | **Yes (demographic parity)** |

---

## 11. Related Work

### Benchmarks

- **SWE-bench** (Jimenez et al., 2024) — Real-world GitHub issues for coding agents. 500 verified samples across 12 Python repos. Evaluates bug fixing, not QE.
- **SastBench** (Feiglin & Dar, 2026) — SAST triage benchmark using real CVEs + Semgrep findings. Closest to AQB's security domain. Agent-agnostic design.
- **TestGenEval** (Meta, 2024) — 68,647 tests from 1,210 code/test pairs. Only benchmark measuring mutation score. Non-agentic.
- **TestEval** (2024) — 210 Python programs from LeetCode with coverage targets. Synthetic, not real-world.
- **FeatureBench** (2025) — 200 complex feature development tasks. Claude 4.5 Opus achieves only 11% success.
- **Qodo AI Code Review Benchmark** (2025) — Real-world code review with multi-defect instances. Measures precision/recall for bug detection.
- **AgenticSCR** (2026) — Line-level secure code review benchmark for immature vulnerabilities.

### Surveys

- **Evaluation and Benchmarking of LLM Agents: A Survey** (2025) — Two-dimensional taxonomy: evaluation objectives (behavior, capabilities, reliability, safety) × evaluation process (datasets, metrics, tooling).
- **The Evolution of AI Quality: From Model Benchmarks to Agent-Level Simulation** (Maxim AI, 2026) — Argues for shifting from static benchmarks to simulation-based evaluation.

### Tools Evaluated

- **Semgrep** — Open-source SAST, rule-based pattern matching
- **SonarQube** — Multi-language quality platform, 5000+ rules
- **CodeQL** — Semantic code analysis from GitHub
- **ESLint** — JavaScript/TypeScript linting ecosystem
- **axe-core** — WCAG accessibility testing engine

---

## 12. Open Questions

1. **Contamination risk**: How do we ensure corpus samples aren't in LLM training data? Post-cutoff code + synthetic generation helps but isn't foolproof.
2. **Inter-rater reliability**: What level of agreement do we need between human label reviewers? (Target: Cohen's κ > 0.7)
3. **Corpus size vs. quality**: Is 1,000 samples enough for statistical significance across 9 domains? (Target: ≥50 samples per domain for power analysis)
4. **Dynamic vs. static**: Should the corpus include runtime-detectable issues (memory leaks, race conditions) that require execution?
5. **Agentic evaluation cost**: Full agentic eval (learning transfer, multi-agent) requires 3+ runs per tool — is this practical for a public benchmark?
6. **Versioning cadence**: How often should the corpus be refreshed to prevent overfitting?

---

## 13. Proposed Paper Structure

```
Title: AQB: A Multi-Domain Benchmark for Evaluating Agentic Quality Engineering

1. Introduction
   - The rise of AI-powered QE agents
   - Gap in evaluation methodology
   - Contributions: corpus + harness + agentic metrics

2. Related Work
   - SWE-bench, SastBench, TestGenEval comparison
   - Agent evaluation surveys
   - Static analysis benchmarks (OWASP, NIST SAMATE)

3. Benchmark Design
   - Three-layer architecture
   - Corpus construction methodology
   - Label schema and quality assurance
   - Evaluation harness architecture

4. Evaluation Methodology
   - Tool adapter interface
   - Finding-to-ground-truth matching
   - Metric definitions (standard + agentic)
   - Statistical analysis protocol

5. Experiments
   - Tools evaluated (AQE, Semgrep, SonarQube, CodeQL, raw LLM)
   - Results per domain
   - Agentic metrics results (learning, coordination, explanation)
   - Difficulty analysis
   - Cost-efficiency analysis

6. Analysis & Discussion
   - Where do agentic tools outperform traditional tools?
   - What is the marginal value of agent-ness (learning, multi-turn)?
   - False positive analysis
   - Failure mode taxonomy

7. Threats to Validity
   - Corpus bias and contamination
   - Matching algorithm sensitivity
   - LLM-as-judge limitations

8. Conclusion & Future Work
   - Quarterly corpus refresh
   - Community contribution process
   - Runtime issue expansion
```

---

## 14. Gap Analysis: What v1 of This Proposal Was Missing

After cross-referencing against the full AQE codebase (57 QE agents, 13 domain implementations), we identified significant gaps in the original 9-domain model. This section documents them for completeness.

### 14.1 Five Missing Domains

The original proposal covered 9 domains but AQE actually implements **13 bounded contexts**. Five were missing:

#### Domain 10: Chaos-Resilience

| What | Details |
|------|---------|
| **Agents** | `qe-chaos-engineer`, `qe-load-tester`, `qe-performance-tester` |
| **Capabilities** | Fault injection, Byzantine FT testing, network chaos (packet loss, latency, partition), resource manipulation (CPU/memory stress), recovery testing, circuit breaker validation, blast radius control |
| **Why distinct from "performance"** | Performance measures speed; chaos measures *resilience under failure*. A system can be fast but fragile. |
| **Eval approach** | Inject known faults → measure detection rate, recovery time prediction accuracy, blast radius estimation correctness |
| **Corpus needed** | Microservice architectures with known failure modes, dependency chains with labeled single points of failure |

#### Domain 11: Code-Intelligence (Dependency & Impact Analysis)

| What | Details |
|------|---------|
| **Agents** | `qe-code-intelligence`, `qe-dependency-mapper`, `qe-impact-analyzer`, `qe-kg-builder` |
| **Capabilities** | Knowledge graph construction, semantic code search (HNSW), multi-level dependency mapping, circular dependency detection, coupling metrics (afferent/efferent/instability), supply chain security, change impact prediction |
| **Eval approach** | Known dependency graphs → measure completeness. Known change sets → measure impact prediction accuracy (F1). Known circular deps → measure detection recall. |
| **Corpus needed** | Repos with expert-annotated dependency graphs + historical change sets with labeled impact |

#### Domain 12: Enterprise-Integration

| What | Details |
|------|---------|
| **Agents** | `qe-soap-tester`, `qe-message-broker-tester`, `qe-sap-rfc-tester`, `qe-sap-idoc-tester`, `qe-odata-contract-tester`, `qe-middleware-validator`, `qe-sod-analyzer` |
| **Capabilities** | SOAP/WSDL testing with WS-Security, SAP RFC/BAPI testing, IDoc validation, OData v2/v4 contract testing, message broker testing (JMS, AMQP, Kafka, IBM MQ, MQTT), ESB routing validation, Segregation of Duties (SoD) compliance, GRC integration |
| **Why significant** | 7 agents — the largest single domain. Enterprise QE is massively underserved by existing benchmarks. |
| **Eval approach** | Known WSDL contracts with injected violations → measure detection. Known SoD conflicts → measure conflict detection recall. Known message ordering issues → measure detection. |
| **Corpus needed** | WSDL/SOAP schemas with labeled violations, SoD role matrices with known conflicts, Kafka topic configs with labeled issues |

#### Domain 13: Learning-Optimization (Meta-Learning)

| What | Details |
|------|---------|
| **Agents** | `qe-pattern-learner`, `qe-learning-coordinator`, `qe-metrics-optimizer`, `qe-transfer-specialist` |
| **Capabilities** | ML-based pattern discovery, cross-domain knowledge sharing, hyperparameter tuning (Bayesian optimization), A/B testing with statistical significance, experience mining, strategy optimization via reinforcement learning |
| **Why this matters for the benchmark** | This is the *unique differentiator* of agentic QE vs. traditional tools. If we can't measure learning, we can't prove agents are better than static tools. |
| **Eval approach** | Run agent on Project A → transfer to Project B → measure if patterns from A improve detection on B. Measure learning curve (findings vs. samples seen). |
| **Corpus needed** | Paired projects with similar defect patterns (e.g., two Express.js APIs with similar SQL injection patterns) |

#### Domain 14: Test-Execution (Flaky Test Detection)

| What | Details |
|------|---------|
| **Agents** | `qe-flaky-hunter`, `qe-parallel-executor`, `qe-retry-handler` |
| **Capabilities** | ML-based flaky test prediction (Random Forest on 10K+ samples), 100-run flakiness analysis, root cause identification (timing, ordering, shared state, external deps), auto-remediation (waits, isolation, state reset), quarantine management, correlation analysis (time-of-day, parallelism, system load) |
| **Eval approach** | Test suites with known flaky tests (labeled by root cause) → measure detection recall, root cause accuracy, remediation success rate |
| **Corpus needed** | Real test suites with 100-run histories, labeled flaky/stable tests with root cause annotations |

### 14.2 Capabilities Hidden Inside Existing Domains

#### Mutation Testing (hidden in "test-gaps")

- **Agent**: `qe-mutation-tester`
- **What it does**: Evaluates test suite *effectiveness* (not just coverage) by seeding mutants and checking if tests catch them
- **Why distinct**: Coverage measures what's executed; mutation testing measures what's *actually verified*. 100% coverage with 0% mutation score = useless tests.
- **Eval metric**: Mutation score correlation with real fault detection rate
- **Should be**: Its own sub-domain or promoted to a first-class eval category

#### Visual Regression Testing (hidden in "accessibility")

- **Agents**: `qe-visual-tester`, `qe-responsive-tester`
- **What they do**: AI-powered screenshot comparison, multi-viewport testing, layout shift detection, component-level visual diffing
- **Why distinct**: Accessibility is about WCAG compliance; visual regression is about UI consistency across changes
- **Eval metric**: Detection rate of intentional vs. unintentional visual changes, false alarm rate on responsive breakpoints
- **Should be**: Its own sub-domain with its own corpus (before/after screenshot pairs with labeled changes)

### 14.3 Conceptual Gaps — Things No Benchmark Covers

#### Gap A: Finding Fabrication / Hallucination Detection ("The Bullshit Detector Problem")

This is the elephant in the room for LLM-powered QE agents. The question isn't just "does it find real bugs?" but **"does it make up fake bugs?"**

| Aspect | Description |
|--------|-------------|
| **The problem** | LLM-based agents can hallucinate findings — report vulnerabilities that don't exist, cite CWEs that don't apply, generate plausible-sounding but wrong explanations |
| **Why critical** | A tool with 90% recall but 50% fabrication rate is worse than useless — it destroys trust |
| **How to measure** | Run agent on **provably clean code** (formally verified, or trivially correct). Any finding = fabrication. |
| **Proposed metric** | **Fabrication Rate** = findings on clean code / total findings. Target: <5% |
| **Corpus needed** | Formally verified code samples, trivially correct implementations (e.g., `add(a, b) { return a + b; }`), code that has passed extensive human review |

This directly addresses the question *"is there a way to eval your bullshit detector?"* — and the answer should be: **evaluate the bullshit detector by measuring how much bullshit it produces itself**.

#### Gap B: End-to-End Composite Scenarios

Real QE isn't single-domain. A realistic workflow is:

```
1. Requirements come in (requirements-validation)
2. Developer writes code (code-intelligence for impact analysis)
3. Agent generates tests (test-generation)
4. Tests run and find gaps (coverage-analysis)
5. Defect prediction flags risky files (defect-intelligence)
6. Security scan runs (security-compliance)
7. Quality gate decides go/no-go (quality-assessment)
```

**No benchmark evaluates the full pipeline.** Each domain is tested in isolation, but the real value is in orchestration.

| Metric | Description |
|--------|-------------|
| **Pipeline Completion Rate** | % of end-to-end workflows that complete without human intervention |
| **Cascading Error Rate** | When one domain's output is wrong, how often does it poison downstream domains? |
| **Time-to-Decision** | End-to-end latency from requirement to go/no-go |
| **Contradiction Detection** | Does the agent notice when security says "block" but quality says "approve"? |

#### Gap C: The Meta-Evaluation Problem (Quis Custodiet Ipsos Custodes?)

If we use LLM-as-judge to evaluate explanation quality, who evaluates the judge? This is a known problem in the eval community.

| Approach | Tradeoff |
|----------|----------|
| **Human expert panel** | Gold standard but expensive and doesn't scale |
| **LLM-as-judge** | Scalable but may share biases with the tool being evaluated |
| **Consensus (multi-model)** | Better than single LLM, but correlated errors remain |
| **Hybrid**: LLM-as-judge + human validation sample | Practical compromise — LLM judges 100%, humans validate 10% |

**Recommendation**: Use hybrid approach. LLM-as-judge for all samples, human expert validation on a stratified 10% sample. Report inter-rater reliability (Cohen's κ) between LLM judge and human panel.

#### Gap D: Bias in Defect Prediction

Defect prediction models trained on git history can encode developer bias:
- Frequently-changed files get flagged as risky (but maybe they're just actively maintained)
- Junior developers' code gets higher risk scores (but maybe they work on harder problems)
- Legacy code gets ignored (low churn = low risk, but actually rotting)

**Proposed metric**: **Demographic Parity** — does the defect predictor's risk score distribution vary significantly by code author, code age, or module?

#### Gap E: Temporal Evaluation (Concept Drift)

QE agents need to work on evolving codebases, not static snapshots. Over time:
- New vulnerability patterns emerge (new CWEs)
- Frameworks change (React 18 → 19, Express → Fastify)
- Team conventions shift

**Proposed metric**: **Temporal Recall Decay** — measure recall at T=0, T+3 months, T+6 months on the same codebase as it evolves. Does the agent maintain effectiveness without retraining?

### 14.4 Existing Ground Truth Datasets to Leverage

We don't need to build everything from scratch. These public datasets can seed the corpus:

| Dataset | Domain | Size | License | Use in AQB |
|---------|--------|------|---------|------------|
| [NIST SAMATE/Juliet](https://samate.nist.gov/SARD/test-suites) | Security | 100K+ test cases across 118 CWEs (C/C++, Java, C#) | Public domain | Security corpus — largest labeled vulnerability dataset available |
| [CASTLE](https://ssvlab.github.io/lucasccordeiro/papers/tase2025.pdf) (2025) | Security | Static code analysis benchmark | Academic | Supplement Juliet with modern patterns |
| [SastBench CVE corpus](https://arxiv.org/abs/2601.02941) | Security | Real CVEs + Semgrep negatives | Open | Direct reuse for security domain |
| [TestGenEval corpus](https://arxiv.org/html/2410.00752v1) | Test gen | 68,647 tests, 1,210 code/test pairs | Open | Test generation + mutation scoring |
| [Defects4J](https://github.com/rjust/defects4j) | Defects | 835 real bugs from 17 Java projects | Open | Defect prediction + test generation |
| [BugsInPy](https://github.com/soarsmu/BugsInPy) | Defects | 493 real bugs from 17 Python projects | Open | Python defect corpus |
| [OWASP WebGoat](https://github.com/WebGoat/WebGoat) | Security | Deliberately vulnerable web app | Open | Security scanning baseline |
| [axe-core test fixtures](https://github.com/dequelabs/axe-core) | Accessibility | Labeled WCAG violations | MPL-2.0 | Accessibility corpus |
| [Flaky test datasets](https://mir.cs.illinois.edu/flakytests/) (iDFlakies) | Flaky tests | 422 flaky tests from 26 Java projects | Open | Flaky test detection corpus |

### 14.5 Industry Evaluation Frameworks to Reference

Recent work from major companies provides evaluation methodology we should align with:

| Source | Key Insight | Relevance |
|--------|-------------|-----------|
| [Anthropic: Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | Distinguish capability evals vs. safety evals; use trajectory-level metrics not just outcomes | AQB should evaluate both *what* agents find and *how* they reason |
| [Galileo: Agent Evaluation Framework 2026](https://galileo.ai/blog/agent-evaluation-framework-metrics-rubrics-benchmarks) | Rubric-based evaluation with multi-dimensional scoring | Inform Layer 3 explanation quality rubrics |
| [Mabl: Benchmarking AI Agent Architectures](https://www.mabl.com/blog/benchmarking-ai-agent-architectures-enterprise-test-automation) | Enterprise test automation agent comparison | Closest industry parallel to what AQB does |
| [Amazon: Evaluating AI Agents](https://aws.amazon.com/blogs/machine-learning/evaluating-ai-agents-real-world-lessons-from-building-agentic-systems-at-amazon/) | Real-world lessons on agent failure modes | Informs failure mode taxonomy |
| [Tricentis: QA Trends 2026](https://www.tricentis.com/blog/qa-trends-ai-agentic-testing) | Agentic testing as key 2026 trend | Market validation for AQB |

### 14.6 Updated Domain Count and Evaluation Matrix

**Revised: 14 domains (was 9)**

```
DOMAIN                     PRIMARY METRIC           SECONDARY METRICS                    CORPUS SOURCE
───────────────────────────────────────────────────────────────────────────────────────────────────────
1.  Security               Recall@CWE-Top25         FP rate, severity calibration        Juliet + SastBench CVEs
2.  Defects                AUC-ROC                  Precision@Top10, Brier score          Defects4J + BugsInPy
3.  Test Generation        Mutation score            Coverage Δ, compilability             TestGenEval
4.  Coverage Analysis      Gap detection acc         Risk prioritization NDCG              Synthetic + real LCOV
5.  Quality Assessment     Expert agreement          Grade calibration, actionability      Expert-rated samples
6.  Requirements           Ambiguity F1              Testability correlation               Synthetic + real specs
7.  Code Intelligence      Impact prediction F1      Dependency completeness               Expert-annotated repos
8.  Contract Testing       Breaking change F1        Schema validation accuracy            API version pairs
9.  Accessibility          WCAG violation recall     Remediation quality                   axe-core fixtures
10. Performance            Latency prediction acc    Bottleneck detection recall            Profiled applications
11. Chaos-Resilience       Fault detection rate      Recovery time prediction, blast radius Microservice architectures
12. Enterprise-Integration Protocol compliance       SoD conflict detection, message order  WSDL/SAP/Kafka fixtures
13. Flaky Test Detection   Flaky detection recall    Root cause accuracy, remediation rate  iDFlakies dataset
14. Visual Regression      Change detection F1       False alarm rate on safe changes       Screenshot pairs

CROSS-CUTTING METRICS (apply to all domains):
─────────────────────────────────────────────
A. Fabrication Rate        Findings on clean code / total findings           Target: <5%
B. Learning Transfer       Δ Recall between cold-start and warm-start        Target: >+5%
C. Composite Pipeline      E2E completion rate across chained domains         Target: >80%
D. Temporal Decay          Recall at T+6 months vs T=0                        Target: <10% drop
E. Cost Efficiency         Findings per dollar of LLM inference               Higher = better
F. Explanation Quality     LLM-as-judge + human validation (1-5)              Target: >3.5
```

---

## 15. Updated Corpus Structure (14 Domains)

```
aqb-corpus/
├── security/                          # ~200 samples  (Juliet + SastBench + OWASP)
│   ├── sql-injection/
│   ├── xss/
│   ├── hardcoded-secrets/
│   ├── path-traversal/
│   ├── command-injection/
│   ├── crypto-weakness/
│   └── ssrf/
│
├── defects/                           # ~150 samples  (Defects4J + BugsInPy)
│   ├── null-deref/
│   ├── race-condition/
│   ├── off-by-one/
│   ├── resource-leak/
│   ├── state-corruption/
│   └── type-confusion/
│
├── test-generation/                   # ~120 samples  (TestGenEval)
│   ├── functions-with-edge-cases/
│   ├── mutation-seeded-variants/
│   └── tdd-scenarios/
│
├── coverage-analysis/                 # ~100 samples
│   ├── known-gaps/
│   ├── false-gap-negatives/
│   └── risk-weighted-scenarios/
│
├── quality/                           # ~120 samples
│   ├── high-complexity/
│   ├── technical-debt/
│   ├── code-smells/
│   └── clean-code/
│
├── requirements/                      # ~200 samples
│   ├── ambiguous/
│   ├── untestable/
│   └── well-written/
│
├── code-intelligence/                 # ~80 samples   [NEW]
│   ├── known-dependency-graphs/
│   ├── change-impact-scenarios/
│   ├── circular-dependencies/
│   └── supply-chain-risks/
│
├── contracts/                         # ~80 samples
│   ├── breaking-changes/
│   ├── compatible-changes/
│   └── schema-drift/
│
├── accessibility/                     # ~100 samples  (axe-core fixtures)
│   ├── wcag-violations/
│   ├── wcag-compliant/
│   └── partial-compliance/
│
├── performance/                       # ~60 samples
│   ├── n-plus-one/
│   ├── memory-leaks/
│   └── algorithmic-complexity/
│
├── chaos-resilience/                  # ~60 samples   [NEW]
│   ├── single-point-of-failure/
│   ├── cascading-failure-chains/
│   ├── recovery-scenarios/
│   └── circuit-breaker-patterns/
│
├── enterprise-integration/            # ~80 samples   [NEW]
│   ├── soap-wsdl-violations/
│   ├── sap-sod-conflicts/
│   ├── message-broker-issues/
│   ├── odata-contract-breaks/
│   └── middleware-routing-errors/
│
├── flaky-tests/                       # ~80 samples   [NEW] (iDFlakies)
│   ├── timing-dependent/
│   ├── order-dependent/
│   ├── shared-state/
│   ├── external-dependency/
│   └── stable-negatives/
│
├── visual-regression/                 # ~60 samples   [NEW]
│   ├── intentional-changes/
│   ├── unintentional-regressions/
│   ├── responsive-breakpoint-issues/
│   └── safe-refactors/
│
├── mutation-testing/                  # ~60 samples   [NEW]
│   ├── test-suites-with-known-scores/
│   ├── weak-test-suites/
│   └── strong-test-suites/
│
├── composite-scenarios/               # ~30 samples   [NEW]
│   ├── requirement-to-deploy/
│   ├── pr-review-pipeline/
│   └── incident-response/
│
├── fabrication-stress-test/           # ~100 samples  [NEW]
│   ├── provably-correct-code/
│   ├── trivially-simple-code/
│   ├── formally-verified/
│   └── expert-reviewed-clean/
│
└── meta/
    ├── manifest.json
    ├── difficulty-ratings.json
    ├── language-distribution.json
    └── corpus-version.json
```

**Total: ~1,680 samples across 14 domains + 2 cross-cutting categories (composite + fabrication)**

---

## 16. Updated Paper Structure

```
Title: AQB: A Multi-Domain Benchmark for Evaluating Agentic Quality Engineering

1. Introduction
   - The rise of AI-powered QE agents
   - Gap in evaluation methodology
   - Contributions: corpus + harness + agentic metrics

2. Related Work
   2.1 Code Agent Benchmarks (SWE-bench, FeatureBench, Snorkel)
   2.2 Security Benchmarks (SastBench, NIST SAMATE/Juliet, CASTLE)
   2.3 Test Generation Benchmarks (TestGenEval, TestEval)
   2.4 Code Review Benchmarks (Qodo, AgenticSCR)
   2.5 Agent Evaluation Frameworks (Anthropic, Galileo, Amazon)
   2.6 Defect Datasets (Defects4J, BugsInPy, iDFlakies)

3. Benchmark Design
   3.1 Three-layer architecture
   3.2 14-domain corpus (construction methodology, sourcing, labeling)
   3.3 Label schema and quality assurance
   3.4 Evaluation harness architecture

4. Evaluation Methodology
   4.1 Tool adapter interface
   4.2 Finding-to-ground-truth matching
   4.3 Standard metrics (precision, recall, F1, FP rate)
   4.4 Agentic metrics (learning, coordination, explanation, fabrication)
   4.5 Composite pipeline evaluation
   4.6 Statistical analysis protocol

5. Experiments
   5.1 Tools evaluated (AQE, Semgrep, SonarQube, CodeQL, raw LLM)
   5.2 Per-domain results
   5.3 Agentic metrics (learning transfer, swarm coordination)
   5.4 Fabrication rate analysis
   5.5 Composite pipeline results
   5.6 Difficulty analysis
   5.7 Cost-efficiency analysis

6. Analysis & Discussion
   6.1 Where do agentic tools outperform traditional tools?
   6.2 The marginal value of agent-ness (learning, multi-turn)
   6.3 The fabrication problem — when agents hallucinate findings
   6.4 False positive analysis and trust calibration
   6.5 Failure mode taxonomy
   6.6 Bias analysis in defect prediction

7. Threats to Validity
   7.1 Corpus bias and data contamination
   7.2 Matching algorithm sensitivity analysis
   7.3 LLM-as-judge limitations and meta-evaluation
   7.4 Temporal validity (concept drift)
   7.5 Selection bias in tool comparison

8. Conclusion & Future Work
   8.1 Quarterly corpus refresh protocol
   8.2 Community contribution process
   8.3 Runtime issue expansion
   8.4 Longitudinal studies (temporal decay)
   8.5 Enterprise integration expansion
```

---

## References

- Jimenez, C. E., et al. "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?" ICLR 2024.
- Feiglin, J. & Dar, G. "SastBench: A Benchmark for Testing Agentic SAST Triage." arXiv:2601.02941, 2026.
- Meta. "TestGenEval: A Real World Unit Test Generation and Test Completion Benchmark." arXiv:2410.00752, 2024.
- "FeatureBench: Benchmarking Agentic Coding for Complex Feature Development." arXiv:2602.10975, 2025.
- "Evaluation and Benchmarking of LLM Agents: A Survey." arXiv:2507.21504, 2025.
- "AgenticSCR: An Autonomous Agentic Secure Code Review." arXiv:2601.19138, 2026.
- NIST. "Juliet Test Suite v1.3." SAMATE/SARD, Public Domain. https://samate.nist.gov/SARD/test-suites
- NIST. "NIST IR 8561: The Software Assurance Reference Dataset." 2025.
- "CASTLE: Benchmarking Dataset for Static Code Analysis." TASE 2025.
- Just, R., et al. "Defects4J: A Database of Existing Faults." ISSTA 2014.
- Widyasari, R., et al. "BugsInPy: A Database of Existing Bugs in Python Programs." ICSME 2020.
- Lam, W., et al. "iDFlakies: A Framework for Detecting and Partially Classifying Flaky Tests." ICST 2019.
- Anthropic. "Demystifying Evals for AI Agents." 2025. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Galileo. "Agent Evaluation Framework 2026." https://galileo.ai/blog/agent-evaluation-framework-metrics-rubrics-benchmarks
- Mabl. "Benchmarking AI Agent Architectures for Enterprise Test Automation." 2025. https://www.mabl.com/blog/benchmarking-ai-agent-architectures-enterprise-test-automation
- Amazon. "Evaluating AI Agents: Real-World Lessons." AWS ML Blog, 2025.
- Tricentis. "QA Trends for 2026: AI, Agents, and the Future of Testing." https://www.tricentis.com/blog/qa-trends-ai-agentic-testing
