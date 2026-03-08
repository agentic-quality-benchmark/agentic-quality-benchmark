# Contributing to AQB

Thank you for your interest in improving the Agentic Quality Benchmark. This guide covers the main ways to contribute.

## Ways to Contribute

### 1. Add Corpus Samples

We need labeled samples across all 14 domains. Each sample requires:

```json
{
  "id": "domain-category-NNN",
  "domain": "security",
  "category": "sql-injection",
  "language": "typescript",
  "difficulty": 3,
  "ground_truth": {
    "issues": [
      {
        "type": "CWE-89",
        "severity": "critical",
        "location": { "file": "src/db.ts", "line_start": 42, "line_end": 42 },
        "description": "User input concatenated into SQL query",
        "fix_available": true
      }
    ],
    "false_positives": []
  },
  "metadata": {
    "source": "cve-2024-XXXXX or synthetic",
    "sourcing_method": "real_cve | historical_bugfix | mutation_seeded | synthetic | adversarial_negative",
    "human_verified": true,
    "verification_date": "2026-03-01",
    "verified_by": ["github-handle-1", "github-handle-2"]
  }
}
```

**Quality requirements:**
- Every sample must be verified by at least 2 reviewers
- Adversarial negatives (clean code) must comprise at least 20% of each domain
- Difficulty must be independently rated (not self-assessed by the creator)

### 2. Write Tool Adapters

Implement the `AQBToolAdapter` interface to evaluate a new tool:

```typescript
export interface AQBToolAdapter {
  name: string;
  version: string;
  analyze(sample: CorpusSample): Promise<Finding[]>;
  setup?(): Promise<void>;
  teardown?(): Promise<void>;
}
```

Place adapters in `harness/src/adapters/`. Include a Dockerfile in `docker/` if your tool needs a specific runtime.

### 3. Submit Evaluation Results

1. Fork this repo
2. Run: `npx aqb run --adapter your-adapter --corpus corpus/v0.1`
3. Results go in `results/your-tool-version/`
4. Submit a PR

### 4. Improve the Harness

Bug fixes, new metrics, matching algorithm improvements — all welcome via PR.

### 5. Report Issues

- Mislabeled samples
- Matching algorithm false matches
- Adapter bugs
- Documentation gaps

## Code of Conduct

Be respectful. Be constructive. Focus on the work.

## Development Setup

```bash
git clone https://github.com/agentic-quality-benchmark/aqb.git
cd aqb
npm install
npm run build
npm test
```

## PR Guidelines

- One logical change per PR
- Include tests for harness changes
- Include validation for corpus additions (run `npm run validate-corpus`)
- Reference the relevant issue number
