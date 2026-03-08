# AQB: Agentic Quality Benchmark

A multi-domain benchmark for evaluating AI-powered quality engineering agents.

**AQB measures how well QE agents actually find bugs, generate tests, and assess quality — not just whether the code runs.**

[![License: MIT](https://img.shields.io/badge/Code-MIT-blue.svg)](LICENSE-CODE)
[![License: CC BY 4.0](https://img.shields.io/badge/Data-CC%20BY%204.0-lightgrey.svg)](LICENSE-DATA)

## Why AQB?

Existing benchmarks evaluate narrow slices of software engineering:

| Benchmark | Scope | Limitation |
|-----------|-------|------------|
| SWE-bench | Bug fixing | Coding agents, not QE |
| SastBench | SAST triage | Security only |
| TestGenEval | Test generation | Non-agentic, single-shot |

**No benchmark evaluates the full QE lifecycle**: security scanning, defect prediction, test generation, coverage analysis, quality assessment, requirements validation, accessibility auditing, chaos engineering, and more.

AQB fills this gap with **1,680+ labeled samples across 14 QE domains**, a standardized evaluation harness, and metrics designed specifically for agentic systems (learning transfer, swarm coordination, fabrication detection).

## Quick Start

```bash
# Install the harness
npm install
npm run build

# Run evaluation with a built-in adapter
npx aqb run --adapter semgrep --corpus corpus/v0.1 --domain security

# Run with your own adapter
npx aqb run --adapter ./my-adapter.ts --corpus corpus/v0.1

# Generate scorecard
npx aqb scorecard --results results/my-tool/
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│            Layer 3: Agentic Behavior             │
│  Learning transfer, swarm coordination,          │
│  fabrication detection, explanation quality       │
├─────────────────────────────────────────────────┤
│            Layer 2: Evaluation Harness            │
│  Dockerized runner, finding-to-truth matching,   │
│  precision/recall/F1, cost/latency tracking      │
├─────────────────────────────────────────────────┤
│            Layer 1: Seeded Defect Corpus          │
│  1,680+ labeled samples across 14 QE domains,   │
│  5 languages, difficulty-rated, human-verified   │
└─────────────────────────────────────────────────┘
```

## Domains (14)

| # | Domain | Samples | Primary Metric | Corpus Source |
|---|--------|---------|----------------|---------------|
| 1 | Security | ~200 | Recall@CWE-Top25 | Juliet + SastBench |
| 2 | Defects | ~150 | AUC-ROC | Defects4J + BugsInPy |
| 3 | Test Generation | ~120 | Mutation Score | TestGenEval |
| 4 | Coverage Analysis | ~100 | Gap Detection Accuracy | Synthetic + LCOV |
| 5 | Quality | ~120 | Expert Agreement | Expert-rated |
| 6 | Requirements | ~200 | Ambiguity F1 | Synthetic + real specs |
| 7 | Code Intelligence | ~80 | Impact Prediction F1 | Annotated repos |
| 8 | Contracts | ~80 | Breaking Change F1 | API version pairs |
| 9 | Accessibility | ~100 | WCAG Violation Recall | axe-core fixtures |
| 10 | Performance | ~60 | Latency Prediction | Profiled apps |
| 11 | Chaos-Resilience | ~60 | Fault Detection Rate | Microservices |
| 12 | Enterprise Integration | ~80 | Protocol Compliance | WSDL/SAP/Kafka |
| 13 | Flaky Tests | ~80 | Detection Recall | iDFlakies |
| 14 | Visual Regression | ~60 | Change Detection F1 | Screenshot pairs |

Plus cross-cutting evaluations:
- **Fabrication Stress Test** (~100 samples of provably clean code)
- **Composite Scenarios** (~30 end-to-end QE pipeline tests)

## Agentic Metrics (What Makes AQB Different)

Beyond standard precision/recall, AQB measures capabilities unique to agentic systems:

| Metric | What It Measures |
|--------|-----------------|
| Fabrication Rate | Does the agent hallucinate findings on clean code? |
| Learning Transfer | Does recall improve when memory persists across runs? |
| Swarm Coordination | Do multi-agent setups find more than single agents? |
| Explanation Quality | Are findings actionable? (LLM-as-judge + human eval) |
| Fix Success Rate | Do suggested fixes actually resolve the issue? |
| Severity Calibration | Does priority ranking match expert consensus? |
| Cost Efficiency | Findings per dollar of LLM inference |
| Temporal Decay | Does effectiveness degrade as codebases evolve? |

## Writing an Adapter

To evaluate your tool against AQB, implement the adapter interface:

```typescript
import { AQBToolAdapter, CorpusSample, Finding } from '@aqb/harness';

export class MyToolAdapter implements AQBToolAdapter {
  name = 'my-tool';
  version = '1.0.0';

  async analyze(sample: CorpusSample): Promise<Finding[]> {
    // Run your tool against sample.files
    // Return findings in AQB format
  }
}
```

See [Adapter Guide](docs/adapter-guide.md) for details.

## Submitting Results

1. Fork this repo
2. Write your adapter in `harness/src/adapters/`
3. Run against the public corpus: `npx aqb run --adapter your-adapter`
4. Submit a PR with your adapter + `results/your-tool/scorecard.json`
5. Maintainers run against the held-out set for official leaderboard placement

## Leaderboard

See [leaderboard/](leaderboard/) or visit the [live leaderboard](#) (coming soon).

## Citation

```bibtex
@misc{aqb2026,
  title={AQB: A Multi-Domain Benchmark for Evaluating Agentic Quality Engineering},
  author={Dragan Spiridonov},
  year={2026},
  url={https://github.com/agentic-quality-benchmark/aqb}
}
```

## License

- **Code** (harness, adapters, scripts): [MIT](LICENSE-CODE)
- **Data** (corpus, labels): [CC BY 4.0](LICENSE-DATA)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to:
- Add samples to the corpus
- Write tool adapters
- Submit evaluation results
- Report issues with labels or matching
