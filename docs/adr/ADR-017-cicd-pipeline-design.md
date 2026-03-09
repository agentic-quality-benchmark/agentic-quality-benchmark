# ADR-017: CI/CD Pipeline Design

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-017 |
| **Initiative** | CI/CD Pipeline Design |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** automating the build, test, validation, release, and deployment lifecycle for the AQB benchmark -- a system comprising a TypeScript harness, a multi-domain corpus of 1,680+ labeled samples, Docker-based tool adapter images, and a public leaderboard -- where manual processes are error-prone, slow, and cannot enforce the quality gates required for a measurement instrument,

**facing** the challenge of orchestrating multiple pipeline concerns in a single CI/CD system: compiling and testing the harness on every commit, validating corpus samples on every PR that touches corpus files, building and publishing Docker images for seven tool adapters, automating semantic versioning and npm releases, regenerating the leaderboard when new evaluation results are submitted, protecting the held-out corpus from accidental exposure in CI logs or artifacts, enforcing branch protection and reviewer requirements, and keeping total CI execution time under 90 seconds as mandated by ADR-013,

**we decided for** GitHub Actions with a multi-stage pipeline architecture comprising five workflows: (1) a primary CI workflow (build, lint, test, corpus-validate) triggered on every push and PR, (2) a corpus validation workflow triggered specifically on PRs touching `corpus/`, (3) a Docker image build and publish workflow triggered on release tags, (4) a release automation workflow for semantic versioning, changelog generation, and npm publishing, and (5) a leaderboard regeneration workflow triggered when result files are added to `results/` -- all enforced by branch protection rules requiring passing CI checks and reviewer approval, with quality gates for 80% test coverage and zero corpus validation failures,

**and neglected** (a) self-hosted CI with Jenkins or GitLab CI because it requires infrastructure provisioning, maintenance, and security hardening that distracts from benchmark development; (b) a minimal CI configuration with only build and lint checks because it does not enforce the quality gates, corpus validation, Docker publishing, or release automation that AQB requires as a public benchmark with a leaderboard,

**to achieve** automated enforcement of all quality gates on every commit, zero-risk corpus validation that catches schema violations before merge, reproducible Docker image builds with pinned tags for all tool adapters, hands-off release automation with semantic versioning and changelog, leaderboard freshness through automated regeneration, protection of the held-out corpus in all CI contexts, and a fast feedback loop completing within 90 seconds for the primary CI pipeline,

**accepting that** GitHub Actions has per-repository minute limits on free tiers (2,000 minutes/month for free, 3,000 for Pro), matrix testing across Node.js versions and OS platforms increases total CI minutes, Docker image builds are slow (3-5 minutes per image) and must run outside the 90-second primary pipeline, secrets management in GitHub Actions requires careful scoping to prevent leakage, and vendor lock-in to GitHub Actions makes migration to another CI provider a non-trivial effort.

---

## Problem Statement

AQB lacks any CI/CD automation. All quality enforcement is manual, creating multiple failure modes:

| Process | Current State | Risk Without Automation |
|---------|---------------|------------------------|
| Build verification | Developer runs `npm run build` locally | Broken builds merge to main |
| Test execution | Developer runs `npm test -- --run` locally | Untested code merges; harness correctness degrades |
| Corpus validation | Manual `npm run validate-corpus` | Invalid samples enter corpus; benchmark integrity compromised |
| Docker image builds | None | Adapter images not available for evaluation |
| npm publishing | Manual `npm publish` | Version inconsistency, forgotten changelog, unpublished fixes |
| Leaderboard updates | Manual regeneration | Stale leaderboard after new result submissions |
| Held-out corpus protection | Convention only | CI job accidentally logs or caches held-out samples |
| Branch protection | None configured | Direct pushes to main bypass all checks |
| Code review | Informal | Changes merge without peer review |

### CI Duration Budget (per ADR-013)

ADR-013 mandates a total CI time target of less than 90 seconds:

| Stage | Duration Budget | Notes |
|-------|----------------|-------|
| Build (tsc) | ~10s | TypeScript compilation |
| Lint (eslint) | ~5s | Code style enforcement |
| Unit tests (vitest) | ~15s | Fast unit tests with mocks |
| Integration tests (vitest) | ~30s | Pipeline tests with mock adapters |
| Corpus validation | ~10s | Schema validation for all samples |
| Coverage computation | ~5s | Computed during unit test run |
| **Total** | **~75s** | **Under 90s budget** |

Workflows outside the primary pipeline (Docker builds, releases, leaderboard) are not subject to the 90-second constraint.

### Secrets Required

| Secret | Purpose | Scope |
|--------|---------|-------|
| `NPM_TOKEN` | Publishing `@aqb/harness` to npm registry | Release workflow only |
| `DOCKERHUB_USERNAME` | Pushing adapter images to Docker Hub | Docker build workflow only |
| `DOCKERHUB_TOKEN` | Authenticating with Docker Hub | Docker build workflow only |
| `LLM_API_KEY` | Optional: running LLM-based adapters in integration tests | CI workflow (optional) |
| `GITHUB_TOKEN` | Built-in: creating releases, commenting on PRs | All workflows (auto-provided) |

---

## Opportunity

A well-designed CI/CD pipeline transforms AQB from a manually managed project into an automated, quality-enforced benchmark platform.

| Dimension | Before (Manual) | After (Automated CI/CD) |
|-----------|-----------------|-------------------------|
| Build verification | Relies on developer discipline | Every commit verified automatically |
| Test execution | Skipped when developer is in a hurry | Mandatory gate; cannot merge without passing |
| Corpus validation | Forgotten on corpus PRs | Automatically triggered on any corpus change |
| Docker images | Not built | Built, tagged, and published on every release |
| Releases | Manual version bump, publish, changelog | Automated via semantic-release or similar |
| Leaderboard | Stale until someone regenerates | Auto-regenerated when results change |
| Held-out protection | Trust-based | Enforced: CI never mounts or accesses held-out directory |
| Review enforcement | Social convention | Branch protection requires approvals |
| Cross-platform testing | Developer's machine only | Matrix: Node 20 + Node 22, Ubuntu + macOS |

### Workflow Architecture

```
                          push / PR to main
                                |
                                v
                    +------------------------+
                    |   Primary CI Workflow   |
                    |   (.github/workflows/   |
                    |    ci.yml)              |
                    +------------------------+
                    | 1. Build (tsc)         |
                    | 2. Lint (eslint)       |
                    | 3. Unit Tests          |
                    | 4. Integration Tests   |
                    | 5. Coverage Check      |
                    | 6. Corpus Validation   |
                    +------------------------+
                         |          |
                    [pass]      [fail]
                         |          |
                         v          v
                    [Mergeable]  [Blocked]

          PR touches corpus/**
                    |
                    v
          +---------------------------+
          | Corpus Validation Workflow |
          | (.github/workflows/       |
          |  corpus-validate.yml)     |
          +---------------------------+
          | Deep schema validation    |
          | ID uniqueness check       |
          | Adversarial % check       |
          | Reviewer minimum check    |
          | File reference integrity  |
          +---------------------------+

          Tag: v*.*.*
                    |
                    v
          +---------------------------+       +---------------------------+
          | Release Workflow           |       | Docker Build Workflow      |
          | (.github/workflows/       |       | (.github/workflows/       |
          |  release.yml)             |       |  docker-publish.yml)      |
          +---------------------------+       +---------------------------+
          | Semantic version validate |       | Build 7 adapter images    |
          | Changelog generation      |       | Tag with release version  |
          | npm publish @aqb/harness  |       | Push to Docker Hub        |
          | GitHub Release creation   |       | Publish image manifest    |
          +---------------------------+       +---------------------------+

          Push to results/**
                    |
                    v
          +---------------------------+
          | Leaderboard Workflow       |
          | (.github/workflows/       |
          |  leaderboard.yml)         |
          +---------------------------+
          | Validate result format    |
          | Regenerate rankings       |
          | Commit updated leaderboard|
          +---------------------------+
```

### Matrix Testing Strategy

```
+-------------------+-------------------+-------------------+
| ubuntu-latest     | ubuntu-latest     | macos-latest      |
| Node.js 20        | Node.js 22        | Node.js 20        |
|                   |                   |                   |
| Primary target    | Forward compat    | macOS compat      |
| Full pipeline     | Full pipeline     | Build + Unit only |
+-------------------+-------------------+-------------------+
```

| Axis | Values | Rationale |
|------|--------|-----------|
| Node.js version | 20 (LTS), 22 (Current) | 20 is the minimum supported version; 22 tests forward compatibility |
| Operating system | ubuntu-latest, macos-latest | Linux is the primary CI target; macOS verifies cross-platform behavior |
| Full pipeline | Ubuntu only | Integration tests and corpus validation run only on Ubuntu to save CI minutes |
| Windows | Excluded | AQB Docker isolation requires Linux/macOS; Windows support is not a current goal |

---

## Summary

| Capability | Description |
|------------|-------------|
| Primary CI workflow | Build, lint, test, coverage, corpus-validate on every push and PR |
| Corpus validation workflow | Deep validation triggered on PRs modifying `corpus/` |
| Docker build workflow | Builds and publishes 7 adapter images on release tags |
| Release workflow | Semantic versioning, changelog, npm publish, GitHub Release |
| Leaderboard workflow | Auto-regenerates rankings when results change |
| Branch protection | Required CI checks, 1 reviewer approval, no direct pushes to main |
| Quality gates | 80% coverage minimum, zero corpus validation failures, passing lint |
| Matrix testing | Node.js 20 + 22, Ubuntu + macOS |
| Held-out protection | CI never accesses `corpus/held-out/`; path excluded in all workflows |
| Secrets management | Scoped to specific workflows; never exposed in logs or PR contexts |
| Performance target | Primary CI completes within 90 seconds (per ADR-013) |

### Workflow Inventory

#### 1. Primary CI Workflow (`ci.yml`)

| Attribute | Value |
|-----------|-------|
| Trigger | `push` to main, `pull_request` to main |
| Matrix | Node.js 20 + 22, Ubuntu + macOS |
| Timeout | 10 minutes (hard limit; expected < 90 seconds) |
| Concurrency | Cancel in-progress runs for same PR |

```yaml
# Pseudostructure (not executable; illustrates pipeline stages)
jobs:
  build:
    strategy:
      matrix:
        node-version: [20, 22]
        os: [ubuntu-latest, macos-latest]
    steps:
      - checkout
      - setup-node (with matrix.node-version)
      - npm ci (with dependency caching)
      - npm run build
      - npm run lint
      - npm test -- --run --coverage
      - coverage-check (fail if < 80% for harness/src/)
      - npm run validate-corpus (Ubuntu + Node 20 only)
```

**Held-out corpus protection:** The checkout step uses sparse checkout or the workflow explicitly excludes `corpus/held-out/` from all paths. The `validate-corpus` script operates only on `corpus/v0.1/`.

**Dependency caching:** `actions/cache` with `node_modules` keyed on `package-lock.json` hash to minimize install time.

#### 2. Corpus Validation Workflow (`corpus-validate.yml`)

| Attribute | Value |
|-----------|-------|
| Trigger | `pull_request` with paths `corpus/v0.1/**` |
| Matrix | None (single Ubuntu + Node 20 job) |
| Timeout | 5 minutes |

This workflow performs deep corpus validation beyond what the primary CI does:

| Check | Description | Failure Behavior |
|-------|-------------|-----------------|
| Schema conformance | Every modified or new sample passes `CorpusSampleSchema` (Zod) | Fail with sample IDs |
| ID uniqueness | No duplicate sample IDs across entire corpus | Fail with duplicate IDs |
| Domain consistency | `sample.domain` matches the domain prefix in `sample.id` | Fail with mismatched samples |
| File reference integrity | Every `ground_truth.issues[].location.file` exists in `sample.files` | Fail with broken references |
| Adversarial percentage | Each domain has >= 20% adversarial negatives | Warn (soft gate until corpus matures) |
| Reviewer minimum | All `metadata.human_verified === true` samples have >= 2 entries in `metadata.verified_by` | Fail with under-reviewed samples |
| Difficulty rating | `difficulty` is between 1 and 5 inclusive | Fail with out-of-range values |

**PR comment:** On failure, the workflow posts a structured comment listing all validation errors with sample IDs and line references.

#### 3. Docker Build and Publish Workflow (`docker-publish.yml`)

| Attribute | Value |
|-----------|-------|
| Trigger | `push` of tags matching `v*.*.*` |
| Matrix | 7 adapter images (eslint, semgrep, sonarqube, codeql, axe, aqe, llm-raw) |
| Timeout | 30 minutes |
| Registry | Docker Hub (organization: `aqb`) |

```
Build matrix (7 images):
  aqb/eslint:v1.2.3        -- FROM node:20.11.1-slim
  aqb/semgrep:v1.2.3       -- FROM python:3.12.2-slim
  aqb/sonarqube:v1.2.3     -- FROM eclipse-temurin:21.0.2_13-jdk
  aqb/codeql:v1.2.3        -- FROM ubuntu:22.04
  aqb/axe:v1.2.3           -- FROM node:20.11.1-slim
  aqb/aqe:v1.2.3           -- FROM node:20.11.1-slim
  aqb/llm-raw:v1.2.3       -- FROM node:20.11.1-slim
```

Each image is tagged with:
- The release version (e.g., `v1.2.3`)
- The `latest` tag (for the most recent stable release)
- The short Git SHA (e.g., `sha-538cca7`)

**Build caching:** Uses `docker/build-push-action` with GitHub Actions cache backend to avoid rebuilding unchanged layers.

**Image signing:** Images are signed with cosign (Sigstore) for supply chain security. Verification keys are published in the repository.

#### 4. Release Workflow (`release.yml`)

| Attribute | Value |
|-----------|-------|
| Trigger | Manual (`workflow_dispatch`) with version bump type input |
| Inputs | `bump_type`: `patch`, `minor`, `major` |
| Timeout | 10 minutes |

Release process:

| Step | Action | Output |
|------|--------|--------|
| 1. Version bump | Update `harness/package.json` version field | New version string |
| 2. Changelog generation | Generate changelog from conventional commits since last tag | `CHANGELOG.md` update |
| 3. Commit | Commit version bump + changelog | Release commit SHA |
| 4. Tag | Create annotated Git tag (`v1.2.3`) | Tag triggers Docker workflow |
| 5. GitHub Release | Create GitHub Release with changelog body | Release URL |
| 6. npm publish | `cd harness && npm publish --access public` | Package on npm registry |

**Commit message convention:** The project follows Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`) to enable automated changelog generation.

**Pre-release validation:** Before publishing, the workflow runs the full CI pipeline (build, lint, test, validate-corpus) to ensure the release is valid.

#### 5. Leaderboard Regeneration Workflow (`leaderboard.yml`)

| Attribute | Value |
|-----------|-------|
| Trigger | `push` to main with paths `results/**` |
| Matrix | None (single job) |
| Timeout | 5 minutes |

| Step | Action |
|------|--------|
| 1. Validate result format | Ensure submitted results conform to `AQBResult` schema |
| 2. Regenerate rankings | Run ranking algorithm across all results in `results/` |
| 3. Update leaderboard | Write updated rankings to `leaderboard/` |
| 4. Commit and push | Auto-commit regenerated leaderboard files |

**Anti-gaming:** The leaderboard workflow only accepts results for the public corpus (`corpus/v0.1/`). Results claiming held-out corpus evaluation are rejected unless submitted through the official held-out evaluation process (separate, controlled pipeline).

### Branch Protection Rules

| Rule | Configuration | Rationale |
|------|---------------|-----------|
| Required status checks | `ci` workflow must pass (all matrix entries) | No broken code merges |
| Required reviews | Minimum 1 approving review | Peer review for all changes |
| Dismiss stale reviews | Enabled | New pushes invalidate old approvals |
| Require up-to-date branches | Enabled | PR must be rebased on latest main |
| Restrict pushes to main | Enabled (only via PR) | No direct pushes bypass CI |
| Require signed commits | Recommended (not enforced initially) | Supply chain integrity |
| Branch deletion after merge | Enabled | Clean up merged feature branches |

### Quality Gates

| Gate | Threshold | Enforcement | Failure Behavior |
|------|-----------|-------------|-----------------|
| Build | Must compile | Required status check | PR blocked |
| Lint | Zero errors | Required status check | PR blocked |
| Unit tests | All pass | Required status check | PR blocked |
| Integration tests | All pass | Required status check | PR blocked |
| Test coverage | >= 80% for `harness/src/` | Required status check | PR blocked |
| Test coverage (hard floor) | >= 60% for `harness/src/` | Required status check | PR blocked (absolute minimum) |
| Corpus validation | Zero errors | Required status check (on corpus PRs) | PR blocked |
| Corpus adversarial % | >= 20% per domain | Warning annotation | PR not blocked (soft gate) |

### Held-Out Corpus Protection in CI

The held-out corpus (`corpus/held-out/`) requires strict protection in all CI workflows:

| Protection Layer | Mechanism |
|------------------|-----------|
| Sparse checkout | CI workflows check out only `corpus/v0.1/`, never `corpus/held-out/` |
| `.gitignore` guard | `corpus/held-out/` is listed in `.gitignore` for the public repository |
| Path filter | `validate-corpus` script hardcodes `corpus/v0.1/` as the only valid input path |
| No artifacts | CI workflows never upload `corpus/` directory as a build artifact |
| Log sanitization | CI scripts do not log file contents from corpus directories |
| Workflow path restriction | No workflow triggers on `corpus/held-out/**` changes |
| Separate repository | The held-out corpus is stored in a separate private repository for leaderboard evaluation |

### Secrets Management

| Principle | Implementation |
|-----------|---------------|
| Least privilege | Each secret scoped to the specific workflow that needs it |
| No PR exposure | Secrets not available in `pull_request` events from forks |
| Rotation schedule | `NPM_TOKEN` and `DOCKERHUB_TOKEN` rotated every 90 days |
| No log leakage | All secrets masked in GitHub Actions logs automatically |
| Environment protection | Release and Docker workflows use GitHub Environments with required reviewers |
| No hardcoding | Zero secrets in source code; all injected via `${{ secrets.* }}` |

**Environment configuration:**

| Environment | Workflows | Required Reviewers | Secrets Available |
|-------------|-----------|-------------------|-------------------|
| `ci` | Primary CI | None | `GITHUB_TOKEN` only |
| `release` | Release workflow | 1 maintainer | `NPM_TOKEN`, `GITHUB_TOKEN` |
| `docker` | Docker build workflow | 1 maintainer | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` |

### Performance Budget

| Workflow | Target Duration | Constraint Source |
|----------|----------------|-------------------|
| Primary CI (per matrix entry) | < 90 seconds | ADR-013 |
| Corpus validation | < 60 seconds | Proportional to corpus size |
| Docker build (per image) | < 5 minutes | Cached builds; cold builds may exceed |
| Release | < 3 minutes | Pre-validated by CI |
| Leaderboard regeneration | < 60 seconds | Simple ranking computation |

**CI time optimization techniques:**

| Technique | Savings | Implementation |
|-----------|---------|---------------|
| Dependency caching | ~30s per run | `actions/cache` keyed on `package-lock.json` |
| Parallel matrix jobs | N/A (wall clock) | Jobs run concurrently across matrix |
| Build artifact reuse | ~10s | Build once, share `dist/` to test jobs via artifacts |
| Concurrency cancellation | Avoids waste | Cancel in-progress runs when new commits are pushed |
| Conditional corpus validation | Saves ~10s | Only run on Ubuntu + Node 20 (not full matrix) |
| Sparse checkout | ~2s | Skip large directories not needed for build/test |

---

## Options Considered

### Option 1: [Selected] -- GitHub Actions with Multi-Stage Pipeline and Quality Gates

**Description:** Five GitHub Actions workflows covering CI, corpus validation, Docker builds, releases, and leaderboard regeneration, with branch protection rules, quality gates (80% coverage, zero corpus errors), matrix testing (Node.js 20 + 22, Ubuntu + macOS), held-out corpus protection, and scoped secrets management.

**Pros:**
- Native GitHub integration: no external CI service to configure or maintain
- Free tier provides 2,000+ minutes/month; sufficient for AQB's volume
- Matrix testing verifies cross-platform and cross-version compatibility
- Branch protection rules enforce quality gates at the platform level
- GitHub Environments provide secrets scoping and deployment protection
- Reusable actions ecosystem (`actions/cache`, `docker/build-push-action`, etc.)
- YAML-based configuration lives in the repository alongside the code
- Built-in secrets masking prevents accidental log leakage
- Concurrency controls prevent redundant runs on rapid push sequences
- Marketplace actions for changelog generation, semantic versioning, cosign

**Cons:**
- Vendor lock-in to GitHub Actions; migration requires rewriting workflows
- Free tier minute limits may be reached with heavy matrix testing
- YAML syntax can be verbose and error-prone for complex workflows
- Debugging failed workflows requires re-running the full pipeline
- Fork PRs have limited secrets access (by design, but complicates testing)
- Docker-in-Docker can be complex in GitHub Actions runners

### Option 2: [Rejected] -- Self-Hosted CI with Jenkins or GitLab CI

**Description:** Deploy a self-hosted Jenkins or GitLab CI instance for full control over the CI/CD pipeline, including custom executors, persistent Docker caches, and unlimited build minutes.

**Pros:**
- No minute limits; unlimited builds
- Full control over executor environment (Docker, GPU, etc.)
- Persistent Docker layer cache across builds (faster Docker image builds)
- Custom plugins for specialized validation (Jenkins) or built-in registry (GitLab)
- No vendor lock-in to GitHub-specific features

**Cons:**
- Infrastructure provisioning: must deploy, secure, and maintain CI server
- Ongoing maintenance: OS patching, plugin updates, executor scaling
- Security responsibility: self-hosted runners are attack surface
- Cost: server hosting costs exceed GitHub Actions free tier for AQB's volume
- Setup time: weeks of configuration vs hours for GitHub Actions
- Team expertise: requires DevOps knowledge to maintain
- Divergence from GitHub ecosystem: PRs, checks, and branch protection require additional integration

**Rejection rationale:** AQB is an open-source benchmark hosted on GitHub. Self-hosted CI introduces infrastructure maintenance overhead that distracts from benchmark development. The project's CI volume fits within GitHub Actions free tier, and the native GitHub integration (status checks, branch protection, PR comments) is a significant advantage. Self-hosted CI solves a scaling problem AQB does not have.

### Option 3: [Rejected] -- Minimal CI with Only Build and Lint Checks

**Description:** A single GitHub Actions workflow that runs `npm run build` and `npm run lint` on every push, with no test execution, corpus validation, Docker builds, release automation, or quality gates.

**Pros:**
- Extremely fast CI (< 20 seconds)
- Minimal configuration (single workflow file, ~30 lines)
- No secrets management needed
- No matrix testing overhead
- Easy to understand and maintain

**Cons:**
- No test execution: untested code merges to main
- No coverage enforcement: harness correctness degrades over time
- No corpus validation: invalid samples enter the benchmark
- No Docker image automation: adapter images must be built manually
- No release automation: version bumps, changelogs, and npm publishing are manual
- No leaderboard automation: rankings become stale
- No held-out corpus protection: no CI-level guardrails
- Does not enforce quality gates: violates the principle that a measurement instrument must be verified

**Rejection rationale:** A benchmark that measures QE tool quality cannot itself lack quality enforcement. Minimal CI provides build verification but omits every quality gate that makes AQB trustworthy: test execution, coverage thresholds, corpus validation, and held-out protection. The marginal CI configuration effort for Option 1 is vastly outweighed by the quality guarantees it provides.

---

## Consequences

### Positive
- Every commit to main is verified by build, lint, test, and coverage checks
- Corpus integrity is enforced automatically on every PR touching `corpus/v0.1/`
- Docker adapter images are built and published consistently on every release
- Releases follow semantic versioning with generated changelogs, reducing manual error
- The leaderboard stays current without manual intervention
- The held-out corpus is protected by multiple CI-level safeguards (sparse checkout, path exclusion, separate repository)
- Branch protection prevents bypassing quality gates
- Matrix testing catches cross-platform and cross-version regressions
- Secrets are scoped to specific workflows and environments, minimizing blast radius
- The 90-second CI target (per ADR-013) keeps the developer feedback loop fast

### Negative
- Five workflow files add configuration surface area to the repository
- Matrix testing (2 Node versions x 2 OS platforms) consumes 4x CI minutes per PR
- Docker image builds on releases add 20-30 minutes of CI time (outside the 90-second primary pipeline)
- GitHub Actions vendor lock-in makes future migration non-trivial
- Fork PRs cannot access secrets, limiting integration test coverage for external contributors
- YAML workflow definitions are verbose and lack type checking

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| CI minute limit exceeded on free tier | Low | Medium | Monitor usage monthly; upgrade to Pro if needed; reduce matrix on non-main branches |
| Primary CI exceeds 90-second budget | Medium | Medium | Profile each stage; optimize slow steps; split into parallel jobs if needed |
| Secrets leaked in CI logs | Low | High | GitHub auto-masks secrets; never echo secrets; use environment protection rules |
| Held-out corpus accidentally accessed in CI | Low | Critical | Sparse checkout; separate repository; path filters; no workflow triggers on `corpus/held-out/` |
| Docker build cache invalidation causes slow releases | Medium | Low | Use GitHub Actions cache backend; accept cold builds take longer |
| Stale GitHub Actions versions introduce vulnerabilities | Medium | Medium | Pin actions to SHA (not tag); Dependabot updates for actions |
| Release workflow publishes broken package | Low | High | Pre-release validation runs full CI; GitHub Environment requires reviewer approval |
| Leaderboard auto-commit creates merge conflicts | Low | Low | Leaderboard workflow runs only on main; uses `--no-ff` merge |
| Fork PRs skip quality gates | Low | Medium | Branch protection requires CI checks; fork PRs still run build + lint + test (without secrets) |

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
| Depends on | ADR-010 | Docker Isolation and Reproducibility | Docker image specifications (base images, pinned tags, Dockerfile structure) used by the Docker build workflow |
| Depends on | ADR-013 | Testing Strategy for the Harness | CI pipeline stages, test categories, coverage targets, and 90-second performance budget defined by ADR-013 |
| Depends on | ADR-015 | Held-Out Corpus Security | Held-out corpus protection requirements enforced by CI pipeline safeguards |
| Related | ADR-001 | Bounded Context Map | Pipeline stages align with bounded context test boundaries |
| Related | ADR-002 | Corpus Aggregate Design | Corpus validation workflow validates against the CorpusSample schema |
| Related | ADR-004 | Adapter Layer Anti-Corruption Pattern | Docker build workflow builds images for each adapter defined in ADR-004 |
| Related | ADR-008 | CLI and API Gateway Design | Release workflow publishes the `@aqb/harness` npm package |
| Related | ADR-011 | Leaderboard and Results Management | Leaderboard regeneration workflow implements the ranking update process |
| Related | ADR-012 | Cross-Cutting Concerns | Logging and error handling patterns apply within CI scripts |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | GitHub Actions Documentation | Documentation | https://docs.github.com/en/actions |
| REF-002 | GitHub Branch Protection Rules | Documentation | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-a-branch-protection-rule |
| REF-003 | GitHub Environments | Documentation | https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment |
| REF-004 | docker/build-push-action | GitHub Action | https://github.com/docker/build-push-action |
| REF-005 | actions/cache | GitHub Action | https://github.com/actions/cache |
| REF-006 | Conventional Commits | Specification | https://www.conventionalcommits.org/ |
| REF-007 | Semantic Versioning | Specification | https://semver.org/ |
| REF-008 | Sigstore cosign | Tool | https://github.com/sigstore/cosign |
| REF-009 | ADR-010 Docker Image Inventory | Internal | `docs/adr/ADR-010-docker-isolation-reproducibility.md` |
| REF-010 | ADR-013 CI Pipeline and Coverage Requirements | Internal | `docs/adr/ADR-013-testing-strategy-harness.md` |
| REF-011 | AQB Harness Package | Source Code | `harness/package.json` |
