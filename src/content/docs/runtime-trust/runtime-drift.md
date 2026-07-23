---
title: Runtime Drift
description: "Every control verifies a workload at a point in time — then it runs for weeks. Runtime drift is the gap between the artifact you verified and the process actually running now."
sidebar:
  label: 17. Runtime Drift
  order: 3
---

> **Chapter 17** · Runtime Trust

## Why this exists

Every control in this book verifies a workload **at a point in time** — review at merge, evidence at build, the dossier at admission, identity at issuance. Then the pod runs for three weeks. The entire verified state is a *birth certificate*; drift is the question of **what the thing has become since birth**. Runtime drift is the gap between the artifact you verified and the process actually executing right now — and it is precisely where attackers operate *after* your gates, because it's the only place left.

## Mental model

Admission verified a **sealed package**. Drift detection asks whether the seal is still intact — continuously. The physical-world intuition: a museum authenticates a painting on acquisition (provenance! literally the same word), then *keeps it under glass with sensors*, because authentication-once plus unattended-forever is how forgeries get swapped in. Immutability is the glass; detection is the sensor; response is the guard.

## Architecture

**How runtime diverges from verified state — the taxonomy:**

1. **Interactive access**: `kubectl exec` and ephemeral debug containers. Legitimate, invaluable at 3am, and *by definition* unverified change — commands executed inside a verified container leave no trace in Git, CI, or the registry. Every exec is a hole poked in the chain of custody.
2. **In-container mutation**: the app (or an attacker via the app) writes to the container filesystem — dropped binaries, modified scripts, cron entries, new packages installed at runtime.
3. **In-memory compromise**: fileless attacks — injected shellcode, a reverse shell living purely in process memory, library injection. The filesystem stays pristine; the *process tree and syscall behavior* diverge.
4. **Config/state drift at the K8s layer**: mostly handled by GitOps reconciliation (Chapter 12) — included here because "the reconciler reverted something" is a *runtime drift signal*, not just an ops event.

**Control 1 — Make drift structurally harder (immutability):**

```yaml
securityContext:
  readOnlyRootFilesystem: true        # filesystem drift → EROFS
  allowPrivilegeEscalation: false
  runAsNonRoot: true
  capabilities: { drop: ["ALL"] }
# writable scratch, explicitly and only where needed:
volumeMounts: [{ name: tmp, mountPath: /tmp }]
```

Plus **distroless/minimal images**: no shell, no package manager, no curl — the attacker's toolkit simply absent. An attacker landing in a read-only, shell-less, non-root container with no capabilities must *bring* everything and *write* nowhere; most commodity attack chains die unceremoniously. Enforce all of it at admission (Chapter 14 — posture policies), because unenforced hardening regresses.

**Control 2 — See drift that happens anyway (detection).** Runtime security agents ([Falco](https://falco.org/), [Tetragon](https://tetragon.io/), and commercial EDR-for-cloud like the CrowdStrike/SentinelOne class) watch kernel-level events — syscalls, via eBPF — and evaluate them against rules and baselines:

- *Rule-shaped*: shell spawned in a container; outbound connection from a non-network binary; write under `/usr/bin`; ptrace of another process; crypto-miner syscall patterns.
- *Baseline-shaped*: this image, across its fleet, has an observed normal (processes, files, destinations) — flag the *novel*. Powerful corollary of everything upstream: **because your artifacts are immutable, digest-pinned, and identical across replicas, "normal" is unusually well-defined** — one pod of a 40-replica deployment spawning a process its 39 siblings never spawned is a crisp, low-noise signal. Your supply-chain rigor is what makes runtime detection *tractable*. The layers keep paying each other.

**Control 3 — Govern the legitimate holes (exec discipline).** You won't ban `kubectl exec` (and pretending to just drives it underground — Chapter 13's break-glass lesson). Instead: RBAC-restrict `pods/exec` to a small group or a break-glass flow; **audit-log and page on every prod exec** (exec should be *rare and loud*); prefer [ephemeral debug containers](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/#ephemeral-container) (tooling attached alongside, target container untouched — a cleaner forensic story); and treat an exec'd pod as *tainted* — debug, extract what you need, then kill it so the reconciler replaces it with a verified-clean instance. Cattle semantics as a security control: **remediation = replacement from verified state**, never in-place cleanup (you can't prove a cleanup; you can prove a fresh admission).

**Response wiring.** Detection without response path is a dashboard. Signals → alert with workload identity + digest + provenance attached (your evidence chain now *enriches* incident response — "which commit, whose code, what's inside" is pre-answered); containment options in order of blast radius: NetworkPolicy quarantine (cut the pod's egress), delete-and-replace, scale to zero, node cordon. Chapter 22 operationalizes this.

## Threat model & compromise scenarios

- **Post-exploit persistence attempt**: webshell dropped via app vuln → EROFS (read-only root) blocks the write; attacker pivots to in-memory → Falco flags the spawned shell/novel process; pod replaced; access vector patched. The chain worked *as layers*: prevention narrowed the attacker into detection's brightest spotlight.
- **The legitimate-credential insider/exec abuse**: an engineer (or attacker with their creds) execs into a payments pod and reads secrets from memory. RBAC narrows who; audit+paging makes it observed; pod-taint policy bounds the aftermath. Note what this scenario really teaches: *some drift arrives through the front door with valid credentials* — governance of the hole, not existence-denial of the hole, is the control.
- **The patient low-and-slow** (Chapter 16's parting scenario): fully authorized behavior, gradually shifted. Baseline detection is the only technical control that even *sees* it; the honest statement is that detection here is probabilistic, and blast-radius design (everything since Chapter 2) is what bounds the damage while probability does its work.

## Common mistakes

- Writable root filesystems because "the app logs to a local file" (mount a scratch volume; don't unlock the whole house to open one drawer)
- Full-featured base images in prod "for debuggability" (that debuggability is symmetric — it debugs for attackers too; use ephemeral debug containers instead)
- Runtime agent deployed, alerts unrouted or fatigue-tuned into oblivion
- `kubectl exec` culturally routine, unlogged, unremarked
- In-place "cleanup" after suspicion instead of replace-from-verified
- Treating reconciler drift-reverts as noise rather than security telemetry

## Design review questions

- Can I write to the filesystem of your production payment container? Spawn a shell in it? Which policy says no, and where's it enforced?
- Who exec'd into production last week? Produce the list in under five minutes. Who was paged when it happened?
- A pod starts making DNS queries it has never made: what fires, who's paged, and what's the containment playbook?
- After a suspicious event, what's your remediation verb — clean, or replace?

## Implementation examples

Admission-enforced posture: Kyverno policies requiring readOnlyRootFilesystem, drop-ALL, runAsNonRoot; [distroless](https://github.com/GoogleContainerTools/distroless) (gcr.io/distroless) or chiseled/minimal bases; Falco with k8s audit + syscall sources, custom rules keyed to your images' expected process sets; Tetragon for eBPF enforcement (kill-on-violation, not just alert); `kubectl debug` ephemeral containers as the sanctioned path; K8s audit policy logging exec/attach at RequestResponse level, shipped to SIEM with paging rules.

:::tip[Key Takeaways]

- Verification is point-in-time; production is continuous. Drift is the gap, and it's where post-gate attackers live.
- Immutability (read-only, minimal, non-root) makes drift hard; eBPF-era detection makes residual drift visible; replacement-from-verified-state makes response provable.
- Supply-chain rigor is what makes runtime baselines crisp — identical verified replicas give "abnormal" a precise meaning.
- Exec is a governed, audited, loud exception — and an exec'd pod is a dead pod walking.
:::

## Architecture Conversation

**E:** Be honest with me: if we've done everything — Parts II through VI, all of it — how much does runtime detection still matter?

**A:** Invert it: list what your preventive stack, at its very best, does not cover.

**E:** Zero-days in our own app code — provenance proves it's *our* vulnerable code. Compromise via legitimate credentials — an insider, a stolen session, a partner integration. The patient attacker who only does authorized things. And novel techniques we didn't write policies for yet.

**A:** So what's the architectural relationship between prevention and detection?

**E:** Prevention shrinks the attacker's option space; detection watches the space that remains. And — this is the part I hadn't appreciated — prevention makes detection *better*: immutable identical replicas mean tight baselines, verified provenance means every alert arrives with its full biography, default-deny means the first anomalous connection is signal, not noise. They're not two budgets competing; they're one system where each half sharpens the other.

**A:** That's the maturity insight most organizations take a decade to reach. Now — all these signals, identities, policies, evidence stores... someone has to design the platform where they live coherently, run the secrets that won't die, own the policy lifecycle, and answer for the whole thing in a review. Part VII is where you stop being a consumer of this architecture and become its author.
