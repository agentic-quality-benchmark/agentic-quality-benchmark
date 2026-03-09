# ADR-015: Held-Out Corpus Security Model

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-015 |
| **Initiative** | Held-Out Corpus Security |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** maintaining a 30% held-out corpus (~504 samples) that serves as the sole anti-gaming mechanism for the AQB leaderboard, where leakage of held-out samples would permanently compromise the benchmark's ability to distinguish genuine tool capability from memorization,

**facing** the threat of held-out data leaking through contributor repository access, CI pipeline logs, Docker build artifacts, repository misconfiguration (branch protection gaps, accidental merges), insider access by named maintainers, supply chain compromise of evaluation tooling, and inference attacks where tools reconstruct held-out samples from published summary metrics or partial evaluation feedback,

**we decided for** an encrypted archive approach using age (modern, auditable alternative to GPG) with multi-key access control, where the held-out corpus is stored as an age-encrypted archive (`corpus/held-out.tar.age`) committed to the repository, decryptable only by named maintainers who each hold an individual age identity, requiring a 2-person rule for evaluation runs (two maintainer keys required to initiate decryption and execution), with mandatory audit logging of every decryption and evaluation event, canary sample detection to identify leakage, a documented breach response protocol, CI pipeline hardening to prevent accidental exposure, and a 12-month key rotation schedule,

**and neglected** (a) a separate private repository because it fragments the project, complicates CI, creates synchronization issues between public and held-out corpus versions, and still requires the same access control and encryption mechanisms; (b) branch-level access control with Git hooks because Git hooks are client-side and trivially bypassed, GitHub branch protection rules do not encrypt content at rest, any contributor with clone access can read all branches, and it provides no audit trail for data access,

**to achieve** cryptographic confidentiality of held-out samples at rest and in transit, accountable access through individual maintainer keys and audit logs, detection of leakage through canary samples, a clear and rehearsed breach response protocol, CI pipeline isolation that prevents held-out data from appearing in logs or artifacts, and a key management lifecycle that limits the blast radius of key compromise,

**accepting that** the 2-person rule creates operational overhead for held-out evaluations, age encryption adds a build dependency for maintainers, key rotation requires coordinated re-encryption by all maintainers, the encrypted archive model means the held-out corpus cannot be browsed in Git (by design), and a sufficiently motivated adversary with prolonged maintainer access could exfiltrate data despite these controls.

---

## Problem Statement

The held-out corpus is the foundation of leaderboard integrity. ADR-002 defines it as a "separate repository instance with restricted access," ADR-009 specifies "30% random assignment to held-out set during sourcing" with "separate repository/branch; restricted access; access logging; canary samples," and ADR-011 builds the entire official ranking pathway on held-out evaluation that "only maintainers can execute." Despite these references, no ADR owns the security model that makes these guarantees enforceable.

### Current State

| Aspect | Status | Gap |
|--------|--------|-----|
| Held-out directory | `corpus/held-out/` exists, empty | No samples, no protection mechanism |
| Encryption | None | Plaintext directory readable by any clone |
| Access control | None | Any contributor with repo access can read held-out |
| Audit logging | None | No record of who accessed held-out data |
| Canary detection | None | No mechanism to detect leakage |
| Breach response | None | No protocol for responding to leakage |
| Key management | None | No encryption keys provisioned |
| CI protection | None | No safeguards against log/artifact exposure |
| 2-person rule | None | Single maintainer could evaluate and leak |

### Threat Model

| Threat | Threat Actor | Attack Vector | Likelihood | Impact |
|--------|-------------|---------------|------------|--------|
| T1: Contributor reads held-out samples | External contributor | Clone repo, read `corpus/held-out/` directory | High (if unencrypted) | Critical -- tools trained on answers |
| T2: CI pipeline leaks held-out data | Automated systems | Held-out content in build logs, test output, or artifacts | Medium | Critical -- public logs are cached |
| T3: Maintainer exfiltrates samples | Insider (maintainer) | Authorized access used to share samples with tool vendor | Low | Critical -- undetectable without audit trail |
| T4: Repository misconfiguration | Maintainer error | Branch protection removed, accidental merge of held-out to main | Medium | Critical -- entire held-out set exposed |
| T5: Key compromise | External attacker | Stolen laptop, phished credentials, leaked key file | Low | High -- decryption possible offline |
| T6: Inference attack | Tool vendor | Reconstruct held-out samples from published summary metrics | Very Low | Medium -- partial reconstruction only |
| T7: Supply chain compromise | External attacker | Malicious dependency in evaluation tooling exfiltrates data | Low | Critical -- silent exfiltration |
| T8: Backup/copy leakage | Maintainer error | Decrypted samples left on disk, in cloud backup, in shell history | Medium | Critical -- uncontrolled copies |

### Why Existing Controls Are Insufficient

| Control | Limitation |
|---------|-----------|
| Directory separation (`corpus/held-out/`) | Anyone who clones the repository reads the directory; Git does not support per-directory access control |
| `.gitignore` on held-out | Prevents accidental commit but does not protect already-committed data; does not encrypt |
| GitHub branch protection | Prevents merges but does not encrypt content; all branches are readable by anyone with clone access |
| GitHub CODEOWNERS | Controls who can approve PRs, not who can read files |
| Private repository | Fragments the project; still does not encrypt at rest; access is all-or-nothing |

---

## Opportunity

A formal security model transforms the held-out corpus from a convention-based honor system into a cryptographically enforced isolation boundary.

| Dimension | Before | After |
|-----------|--------|-------|
| Confidentiality | Directory convention (readable by anyone) | age-encrypted archive (decryptable only by named maintainers) |
| Access control | Implicit (repo access = held-out access) | Explicit (individual age identities, 2-person rule) |
| Audit trail | None | Every decryption logged with timestamp, maintainer identity, purpose |
| Leakage detection | None | Canary samples with unique fingerprints |
| Breach response | None | Documented protocol: revoke, rotate, regenerate |
| CI safety | None | Pipeline hardening: no held-out in logs, artifacts, or environment |
| Key lifecycle | None | 12-month rotation, onboarding/offboarding procedures |

### Security Architecture

```
+------------------------------------------------------------------+
|                    PUBLIC REPOSITORY                               |
|                                                                    |
|  corpus/                                                          |
|    v0.1/           (public, plaintext, anyone can read)           |
|      manifest.json                                                |
|      security/                                                    |
|      defects/                                                     |
|      ...                                                          |
|                                                                    |
|    held-out.tar.age   (encrypted archive, committed to repo)      |
|      |                                                            |
|      +-- Encrypted with age, multi-recipient                     |
|      +-- Recipients: maintainer-1.pub, maintainer-2.pub, ...     |
|      +-- Decryption requires 2 maintainer keys (2-person rule)   |
|                                                                    |
|    held-out/           (.gitignore'd, never committed)            |
|      manifest.json     (only exists locally after decryption)     |
|      security/                                                    |
|      defects/                                                     |
|      ...                                                          |
|                                                                    |
|  .gitignore:                                                      |
|    corpus/held-out/    (directory is ignored)                     |
|    *.age.key           (private keys never committed)             |
|    /tmp-held-out/      (temporary decryption workspace)           |
|                                                                    |
|  scripts/                                                         |
|    held-out-decrypt.sh   (decryption + audit log script)          |
|    held-out-encrypt.sh   (re-encryption after updates)            |
|    held-out-evaluate.sh  (2-person evaluation workflow)           |
|    held-out-rotate.sh    (key rotation procedure)                 |
|    canary-check.sh       (canary sample detection)                |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|                    MAINTAINER WORKSTATION                          |
|                                                                    |
|  ~/.config/aqb/                                                   |
|    maintainer.age.key    (private key, never shared)              |
|    audit.log             (local audit log, synced to shared log)  |
|                                                                    |
|  Decryption Flow:                                                 |
|    1. maintainer-A runs held-out-decrypt.sh                       |
|    2. Script requests maintainer-B's co-signature (2-person rule) |
|    3. Both keys used to decrypt held-out.tar.age                  |
|    4. Decrypted to /tmp-held-out/ (tmpfs if available)            |
|    5. Evaluation runs against decrypted samples                   |
|    6. Audit log entry written (who, when, why, duration)          |
|    7. Decrypted files securely deleted (shred)                    |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|                    CI PIPELINE                                      |
|                                                                    |
|  Public corpus tests:     RUN (always)                            |
|  Held-out corpus tests:   NEVER (no keys in CI)                  |
|  Held-out references:     BLOCKED (CI lint checks)               |
|  Artifact upload:         FILTERED (no held-out paths)            |
|  Log output:              SANITIZED (no sample content)           |
+------------------------------------------------------------------+
```

### Encryption Scheme

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Algorithm | age (X25519 + ChaCha20-Poly1305) | Modern, audited, no legacy baggage; simpler than GPG |
| Archive format | tar.age (tar archive encrypted with age) | Single encrypted blob prevents partial file access |
| Recipient model | Multi-recipient with individual keys | Each maintainer has their own key; revocation is per-key |
| 2-person rule | Implemented via age identity-plugin or wrapper script | No single maintainer can decrypt alone |
| Key type | X25519 (age native) | Fast, secure, no configuration needed |

### 2-Person Rule Implementation

The 2-person rule ensures no single maintainer can access held-out data alone. Implementation uses a two-layer encryption scheme:

```
held-out.tar
  |
  +-- age encrypt (Layer 1: inner key, split via Shamir's Secret Sharing)
  |     |
  |     +-- Share 1 -> encrypted to maintainer-A's age key
  |     +-- Share 2 -> encrypted to maintainer-B's age key
  |     +-- Share 3 -> encrypted to maintainer-C's age key
  |     (2-of-N threshold: any 2 shares reconstruct the inner key)
  |
  +-- Result: held-out.tar.age
```

To decrypt:
1. Maintainer-A decrypts their share using their private key
2. Maintainer-B decrypts their share using their private key
3. Two shares are combined to reconstruct the inner decryption key
4. Inner key decrypts the archive

This means:
- Any 2 of N maintainers can decrypt (threshold scheme)
- No single maintainer can decrypt alone
- Adding or removing a maintainer requires re-splitting and re-encrypting shares
- The inner key itself is never stored persistently

---

## Summary

| Capability | Description |
|------------|-------------|
| Encrypted archive | Held-out corpus stored as `corpus/held-out.tar.age`, encrypted with age |
| Multi-key access | Each maintainer holds an individual age identity (X25519 key pair) |
| 2-person rule | Shamir's Secret Sharing (2-of-N threshold) ensures no single-maintainer decryption |
| Audit logging | Every decryption event logged: who, when, purpose, duration, samples accessed |
| Canary samples | 15-20 synthetic canary samples with unique fingerprints embedded in held-out set |
| Breach response | Documented protocol: detect, revoke, rotate, regenerate, notify |
| CI hardening | No held-out keys in CI; lint checks block held-out references in logs/artifacts |
| Key rotation | 12-month rotation cycle; immediate rotation on maintainer offboarding |
| Secure deletion | Decrypted samples written to tmpfs, shredded after evaluation completes |

### Access Control Matrix

| Role | Can read public corpus | Can read encrypted archive | Can decrypt held-out | Can run held-out evaluation | Can modify held-out samples |
|------|----------------------|---------------------------|---------------------|----------------------------|----------------------------|
| Public contributor | Yes | Yes (encrypted blob only) | No | No | No |
| Trusted contributor | Yes | Yes (encrypted blob only) | No | No | No |
| Single maintainer | Yes | Yes | No (2-person rule) | No (2-person rule) | No (2-person rule) |
| Two maintainers (quorum) | Yes | Yes | Yes | Yes | Yes (re-encrypt required) |
| CI pipeline | Yes | Yes (encrypted blob only) | No (no keys) | No | No |

### Named Maintainer Registry

Maintainers authorized for held-out access are tracked in a signed registry file:

| Field | Description |
|-------|-------------|
| `maintainer_id` | GitHub handle |
| `age_public_key` | age X25519 public key |
| `onboarded_date` | Date added to registry |
| `last_key_rotation` | Date of last key rotation |
| `status` | `active` or `revoked` |
| `vouched_by` | Two existing maintainers who approved onboarding |

The registry is stored at `config/held-out-maintainers.json` and is itself committed to the repository (contains only public keys, no secrets).

---

## Options Considered

### Option 1: [Selected] -- Encrypted Archive with Multi-Key Access Control

**Description:** Store the held-out corpus as an age-encrypted tar archive (`corpus/held-out.tar.age`) committed to the public repository. Use Shamir's Secret Sharing with a 2-of-N threshold so that any two authorized maintainers can decrypt the archive but no single maintainer can act alone. Individual maintainer keys are X25519 age identities. Every decryption is audit-logged. Canary samples detect leakage. Key rotation occurs every 12 months or immediately upon maintainer offboarding.

**Pros:**
- Cryptographic confidentiality: held-out data is unreadable without 2 maintainer keys, even for anyone who clones the repository
- Single repository: no need to fragment the project across multiple repos; the encrypted archive lives alongside the public corpus
- Audit trail: decryption script enforces logging before granting access
- 2-person rule: Shamir threshold prevents single-maintainer exfiltration
- Canary detection: embedded synthetic samples reveal leakage through public channels
- Key rotation: 12-month cycle limits blast radius of key compromise
- Industry-standard encryption: age is audited, simple, and has no legacy configuration pitfalls (unlike GPG)
- Portable: age works on Linux, macOS, and Windows; no keyserver infrastructure needed
- Git-friendly: encrypted archive is a single binary blob with clean diff semantics (changed = re-encrypted)

**Cons:**
- Operational overhead: 2-person rule requires coordination between maintainers for every evaluation
- Re-encryption required when maintainers are added, removed, or rotated
- Cannot browse individual held-out samples in Git (must decrypt entire archive)
- age + Shamir's Secret Sharing adds tooling complexity beyond plain age encryption
- Encrypted binary blob in Git increases repository size without benefiting from Git's delta compression
- If fewer than 2 maintainers are available (vacancy, emergency), held-out evaluation is blocked

### Option 2: [Rejected] -- Separate Private Repository

**Description:** Store the held-out corpus in a separate private GitHub repository (`agentic-quality-benchmark/aqb-held-out`) with access restricted to named maintainers. The public repository references the held-out repo via a Git submodule or script that clones it during evaluation.

**Pros:**
- Simple access control: GitHub's repository-level permissions handle who can read
- No encryption needed at the Git layer: the repository itself is private
- Familiar model: many benchmarks use private test sets in separate repos
- Individual sample browsing is possible for authorized maintainers
- GitHub audit log tracks who clones and pulls the private repo

**Cons:**
- Repository fragmentation: corpus version synchronization between two repos is error-prone
- CI complexity: evaluation pipeline must handle two-repo checkout with different credentials
- No encryption at rest: anyone with repo access reads plaintext (GitHub employees, compromised accounts)
- Access is all-or-nothing: cannot enforce 2-person rule through GitHub permissions
- GitHub organization permissions can inadvertently grant access to teams or bots
- Submodule or clone-based integration is fragile and confusing for contributors
- Private repo still needs its own access audit beyond GitHub's coarse-grained logs
- If the organization changes plans or the private repo is accidentally made public, all data is exposed instantly

**Rejection rationale:** A separate private repository introduces synchronization complexity and does not provide encryption at rest. GitHub's access controls are coarse-grained (repository-level, not file-level) and do not support a 2-person rule. The encrypted archive approach provides stronger confidentiality guarantees while keeping the project in a single repository.

### Option 3: [Rejected] -- Branch-Level Access Control with Git Hooks

**Description:** Store the held-out corpus on a dedicated branch (e.g., `held-out`) in the same repository. Use Git hooks (pre-receive, pre-push) to prevent unauthorized access. Use GitHub branch protection rules to restrict who can push to or merge into the branch.

**Pros:**
- Simple: no additional tooling beyond Git and GitHub
- Corpus browsable on the branch for authorized users
- Branch protection rules are a familiar GitHub feature
- No encryption dependency

**Cons:**
- Git hooks are client-side and trivially bypassed (delete the hook, use `--no-verify`)
- Anyone who clones the repository receives all branches, including `held-out` -- branch content is not access-controlled at the read level
- GitHub branch protection controls who can push, not who can read -- every clone includes the branch
- No encryption at rest: branch content is plaintext on every clone
- No audit trail for reads (only pushes are logged)
- A single `git checkout held-out` command by any contributor exposes the entire held-out set
- Server-side hooks (pre-receive) only apply to push operations on GitHub's servers, not to clone or fetch operations

**Rejection rationale:** Git's architecture fundamentally does not support branch-level read access control. Every `git clone` fetches all branches. Branch protection only governs writes (push, merge), not reads. This option provides zero confidentiality for the held-out corpus and relies entirely on an honor system, which is exactly the current state this ADR aims to replace.

---

## Consequences

### Positive

- The held-out corpus is cryptographically protected at rest, even in a public repository -- cloning the repo does not grant access to held-out samples
- The 2-person rule prevents single-maintainer exfiltration and creates accountability for every held-out access event
- Canary samples provide a detection mechanism for leakage through channels outside the repository (forums, tool vendor knowledge bases, LLM training data)
- The audit log creates a forensic trail for investigating suspected leakage events
- Key rotation limits the window of exposure if a maintainer's private key is compromised
- CI pipeline hardening prevents the most common accidental leakage vector (build logs and artifacts)
- The breach response protocol ensures the team can act quickly and decisively when leakage is detected, rather than improvising under pressure
- Storing the encrypted archive in the same repository as the public corpus ensures version synchronization (the archive is tagged with the same corpus version)
- The maintainer registry makes access governance transparent and auditable

### Negative

- The 2-person rule adds latency to held-out evaluations (must coordinate two maintainers' availability)
- Re-encryption on maintainer changes requires all remaining maintainers to re-generate their Shamir shares
- The encrypted archive cannot be incrementally updated (must decrypt, modify, re-encrypt the entire archive)
- age + Shamir tooling is an additional dependency that maintainers must install and understand
- Binary encrypted blob in the Git repository does not benefit from delta compression, increasing clone size
- If the maintainer pool drops below 2 active members, held-out evaluation is blocked until new maintainers are onboarded
- Canary detection is probabilistic, not deterministic -- a sophisticated adversary could strip canary signatures

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| All maintainer keys compromised simultaneously | Very Low | Critical | Geographic and organizational diversity of maintainers; hardware key storage recommended |
| Maintainer pool drops below 2 (bus factor) | Low | High | Maintain minimum 3 active maintainers; emergency onboarding procedure documented |
| Canary samples detected and stripped by adversary | Very Low | Medium | Multiple canary types (structural, semantic, statistical); some canaries undocumented |
| Age encryption vulnerability discovered | Very Low | High | Monitor age security advisories; migration plan to alternative tool documented |
| Shamir implementation has bugs | Low | High | Use well-audited implementation (e.g., `age-plugin-shamir` or equivalent); test threshold recovery in CI |
| Decrypted samples left on disk after evaluation | Medium | High | Evaluation script enforces tmpfs + shred; post-evaluation verification check |
| Audit log tampered with | Low | Medium | Append-only log design; log hash chain; copy to separate storage |
| Re-encryption after maintainer change introduces corruption | Low | High | Automated re-encryption script with integrity verification (decrypt-and-compare after re-encryption) |
| Encrypted archive accidentally excluded from Git (`.gitignore` error) | Low | Medium | CI check verifies `corpus/held-out.tar.age` exists and is non-empty |

---

## Detailed Security Controls

### Canary Sample Detection

Canary samples are synthetic held-out samples with unique, detectable fingerprints. If a tool's output on public evaluation suggests knowledge of canary content, leakage is indicated.

| Canary Type | Description | Detection Method |
|-------------|-------------|------------------|
| Structural canary | Unique variable names, function signatures, or code patterns not found in any public code | Search tool output, public forums, and LLM responses for canary identifiers |
| Semantic canary | Defects with unique bug patterns not representable by known CWE categories | Tool reports a finding matching the canary's bespoke category |
| Statistical canary | Samples calibrated so that the expected false-positive rate for a legitimate tool is near 1.0 | Tool achieves statistically improbable precision on canary samples |
| Watermarked canary | Steganographic markers in code comments or whitespace patterns | Automated scanner checks public channels for watermark presence |

**Canary budget:** 15-20 canary samples (approximately 3-4% of the held-out set). This is large enough for statistical detection but small enough not to distort held-out evaluation metrics.

**Canary rotation:** Canary samples are replaced on the same 12-month cycle as key rotation. Old canary identifiers remain in the detection database permanently (leakage of old canaries still indicates a breach).

### Audit Logging Specification

Every interaction with the held-out corpus is logged in a structured, append-only audit log.

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | ISO 8601 | When the event occurred |
| `event_type` | Enum | `decrypt`, `evaluate`, `encrypt`, `rotate`, `onboard`, `offboard`, `breach_response` |
| `maintainer_ids` | String[] | GitHub handles of maintainers involved (minimum 2 for decrypt/evaluate) |
| `purpose` | String | Reason for access (e.g., "Official evaluation of tool X v1.2.0") |
| `samples_accessed` | Number | Count of samples decrypted (always full archive, but logged for completeness) |
| `duration_seconds` | Number | Time between decryption and secure deletion |
| `environment` | String | Machine identifier (hostname hash) where decryption occurred |
| `integrity_hash` | String | SHA-256 of the encrypted archive at time of decryption |
| `outcome` | Enum | `success`, `failure`, `aborted` |
| `log_hash` | String | SHA-256 of all preceding log entries (hash chain for tamper detection) |

**Log storage:** Primary log at `config/held-out-audit.log` (committed to repository). Secondary copy maintained by each maintainer locally at `~/.config/aqb/audit.log`. Hash chain integrity verified by CI on every commit that modifies the audit log.

### Breach Response Protocol

If held-out corpus leakage is detected or suspected, the following protocol is executed:

| Phase | Actions | Responsible | SLA |
|-------|---------|-------------|-----|
| **1. Detect** | Canary alert triggered, community report received, or anomalous tool performance observed | Any maintainer | N/A (continuous monitoring) |
| **2. Confirm** | Verify leakage is genuine (not a false positive from canary detection); assess scope (partial or full) | 2 maintainers (quorum) | 48 hours |
| **3. Contain** | Revoke all current maintainer keys; halt held-out evaluations; publish leaderboard notice | All maintainers | 24 hours after confirmation |
| **4. Assess** | Determine leakage vector (insider, key compromise, CI, external); identify which samples were leaked | Architecture Team | 1 week |
| **5. Remediate** | Generate new maintainer keys; regenerate leaked samples with fresh content; re-encrypt archive; update canaries | Architecture Team | 2 weeks |
| **6. Recover** | Re-run held-out evaluations for all leaderboard entries with the refreshed held-out set; publish updated rankings | All maintainers | 4 weeks |
| **7. Post-mortem** | Document the breach in an ADR addendum; update security controls to prevent recurrence; publish transparency report | Architecture Team | 6 weeks |

**Partial breach (< 30% of held-out samples confirmed leaked):** Replace only leaked samples and their canaries. Re-evaluate tools that showed anomalous performance on leaked samples.

**Full breach (>= 30% or entire archive):** Treat as total compromise. Regenerate the entire held-out set from the sourcing pipeline (ADR-009). All previous held-out rankings are invalidated and must be re-run.

### CI Pipeline Protection

| Control | Implementation | What It Prevents |
|---------|---------------|-----------------|
| No held-out keys in CI | age private keys never stored in CI secrets, environment variables, or secret managers | CI-based decryption |
| Held-out path lint | CI step runs `grep -r "held-out" --include="*.ts" --include="*.js"` on non-ADR source files; fails if found | Accidental hardcoded references to held-out paths in source code |
| Artifact filtering | CI workflow includes explicit exclusion of `corpus/held-out*` from all artifact uploads | Held-out data in downloadable CI artifacts |
| Log sanitization | Evaluation runner configured to never log sample content (only sample IDs and metrics) | Sample content in CI build logs |
| Environment variable audit | CI step verifies no environment variable contains "held-out" or "held_out" in its value | Accidental injection of held-out paths |
| Docker layer inspection | Docker builds for adapters inspected to verify no held-out content in any layer | Held-out data baked into adapter Docker images |
| Scheduled canary scan | Weekly CI job runs `canary-check.sh` against public channels (configurable endpoint list) | Delayed detection of canary leakage |

### Key Management and Rotation

| Event | Procedure | Who |
|-------|-----------|-----|
| **Initial key generation** | Each maintainer runs `age-keygen` to create an X25519 key pair; public key added to `config/held-out-maintainers.json` | Individual maintainer |
| **Onboarding new maintainer** | Two existing maintainers vouch for the new maintainer; new maintainer generates key pair; shares are re-split with the new maintainer included; archive re-encrypted with new share set | 2 existing maintainers + new maintainer |
| **Offboarding maintainer** | Maintainer's status set to `revoked` in registry; shares re-split excluding the offboarded maintainer; archive re-encrypted; offboarded maintainer's key pair destroyed | 2 remaining maintainers |
| **Scheduled rotation (12 months)** | All maintainers generate new key pairs; shares re-split with new keys; archive re-encrypted; old keys destroyed; canary samples rotated | All maintainers (coordinated) |
| **Emergency rotation** | Triggered by suspected key compromise; same as scheduled rotation but with 48-hour SLA | All maintainers |
| **Key storage** | Private keys stored in maintainer's local keychain or hardware security key; never in cloud storage, email, or chat | Individual maintainer |

**Minimum maintainer pool:** 3 active maintainers at all times. If the pool drops to 2, onboarding a third maintainer becomes the highest priority. If the pool drops to 1, held-out evaluations are suspended until a second maintainer is onboarded.

### Encryption at Rest Details

| Property | Specification |
|----------|---------------|
| Outer encryption | age with X25519 key agreement, ChaCha20-Poly1305 symmetric encryption |
| Inner key splitting | Shamir's Secret Sharing over GF(256), 2-of-N threshold |
| Archive format | POSIX tar, then age-encrypted |
| Archive location | `corpus/held-out.tar.age` (committed to repository) |
| Archive size | Estimated 2-10 MB depending on sample count and content |
| Integrity verification | SHA-256 hash of the encrypted archive stored in `config/held-out-archive-checksum.sha256` |
| Compression | gzip applied before encryption (tar.gz then age) to reduce repository size |
| Plaintext location | Decrypted only to tmpfs (`/dev/shm/aqb-held-out/` on Linux) or RAM disk; never to persistent storage |
| Secure deletion | `shred -u` on Linux, `rm -P` on macOS for decrypted files after evaluation completes |

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
| Secures | ADR-002 | Corpus Aggregate Design | ADR-002 defines held-out as a "separate repository instance with restricted access"; this ADR specifies the security model |
| Secures | ADR-009 | Corpus Data Sourcing Strategy | ADR-009 defines the 70/30 public/held-out split and mentions "access logging; canary samples"; this ADR implements those controls |
| Secures | ADR-011 | Leaderboard and Results Management | ADR-011 builds official rankings on held-out evaluation; this ADR ensures held-out integrity |
| Related | ADR-010 | Docker Isolation and Reproducibility | Evaluation runner Docker isolation must not leak held-out data through container layers or volumes |
| Related | ADR-012 | Cross-Cutting Concerns | Fabrication stress test and composite scenarios may reference held-out samples |
| Related | ADR-013 | Testing Strategy | CI pipeline protection rules must be covered by integration tests |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | age encryption tool | Tool | https://age-encryption.org/ |
| REF-002 | age specification | Specification | https://age-encryption.org/v1 |
| REF-003 | Shamir's Secret Sharing | Algorithm | Adi Shamir, "How to Share a Secret" (1979), Communications of the ACM |
| REF-004 | Held-out directory | Source Code | `corpus/held-out/` |
| REF-005 | Corpus Aggregate (ADR-002) | Architecture Decision Record | `docs/adr/ADR-002-corpus-aggregate-design.md` |
| REF-006 | Corpus Sourcing (ADR-009) | Architecture Decision Record | `docs/adr/ADR-009-corpus-data-sourcing-strategy.md` |
| REF-007 | Leaderboard (ADR-011) | Architecture Decision Record | `docs/adr/ADR-011-leaderboard-results-management.md` |
| REF-008 | NIST SP 800-57 Key Management | Standard | https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final |
| REF-009 | SWE-bench held-out evaluation model | Example | https://www.swebench.com/ |
| REF-010 | HuggingFace Open LLM Leaderboard contamination checks | Example | https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard |
