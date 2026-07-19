---
title: "Platform Architecture: Putting It All Together"
description: "Twenty chapters gave you twenty controls."
sidebar:
  label: 21. Platform Architecture
  order: 4
---

> **Chapter 21** · Platform Security

## Why this exists

Twenty chapters gave you twenty controls. This chapter assembles them into *one coherent platform* — because a pile of good controls is not an architecture, any more than a pile of good bricks is a building. The value is in how they compose: how identity flows into signing, how evidence flows into admission, how each layer makes the next one's job possible. This is the chapter where you stop learning components and start *designing systems*. We'll design an enterprise platform end to end, then examine why it holds together.

## The complete chain, annotated

Here is the whole thing, every boundary carrying its identity, evidence, and verification:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SECURE SOFTWARE DELIVERY — FULL CHAIN                       │
└─────────────────────────────────────────────────────────────────────────────┘

DEVELOPER
  │  identity: signed commits (gitsign/GPG)
  │  evidence: the commit, attributed
  ▼
GIT  ── root of trust ──────────────────────────────────────────── [Ch 3, 4]
  │  controls: branch protection (admins too), CODEOWNERS by path,
  │            protected tags, required checks, merge queue
  │  boundary: only reviewed, signed changes to protected refs cross
  ▼
CI — the trust factory ─────────────────────────────────────────── [Ch 5, 6]
  │  isolation: ephemeral single-use runners
  │  hermeticity: pinned deps (hashes), digest-pinned base images,
  │               egress only to internal mirror
  │  identity: OIDC — no stored long-lived secrets; claims pin repo+ref
  │  produces: artifact + PROVENANCE (platform-generated, not pipeline)
  ▼
ARTIFACT ── build once, promote many ──────────────────────────── [Ch 7-11]
  │  addressed by DIGEST, never tag
  │  dossier attached to digest (signed attestations, distinct signers):
  │    • provenance  (born of commit C, builder B)         [Ch 8]
  │    • SBOM        (contains components …)               [Ch 9]
  │    • test / SAST / scan / compliance results           [Ch 11]
  │  signing: keyless (Fulcio + ephemeral key + Rekor log) [Ch 10]
  ▼
REGISTRY ── evidence locker ───────────────────────────────────────
  │  per-trust-level paths/creds; promotion = signed evidence, not rebuild
  ▼
DEPLOY REPO (GitOps) ── desired state in Git ─────────────────── [Ch 12, 13]
  │  digest-pinned manifests; separate repo, stricter owners than app code
  │  authorization: risk-tiered approvals, separation of duties,
  │                 designed break-glass (integrity-preserving)
  │  reconciler (Argo/Flux) pulls — CI never holds cluster creds
  ▼
ADMISSION ── the only unskippable gate ──────────────────────────── [Ch 14]
  │  verifies, on EVERY path, before etcd:
  │    • image signed by OUR builder identity, from OUR repo+ref
  │    • required attestations present & fresh (provenance, SBOM, scan)
  │    • posture: non-root, read-only-root, no privileged, digest-pinned
  │  failurePolicy: Fail (engineered as tier-0); default-deny + narrow exempt
  ▼
RUNTIME ─────────────────────────────────────────────────────── [Ch 15-17]
  │  identity: SPIFFE/SVID or IRSA — short-lived, platform-attested, no
  │            stored secrets; chains to what admission admitted
  │  authorization: default-deny network + mesh authz on verified identity
  │  drift: immutable containers + eBPF detection; exec is rare/loud;
  │         remediation = replace from verified state, never clean-in-place
  │
  └─ throughout: secrets as lifecycle, minimized & identity-unlocked [Ch 18]
                 policy as code, governed strictest of all           [Ch 19]
                 threat model as the generator of every control above [Ch 20]
```

## Why this composition holds: the interlocks

A platform is defined by its *interlocks* — the places where one layer's output is another layer's precondition. These are what make the architecture more than the sum of controls:

**Identity is one pattern in three places.** The OIDC trust triangle (prove identity → get short-lived scoped credential → verifier checks claims) appears identically in CI (Chapter 6), in workload identity (Chapter 15), and underneath keyless signing (Chapter 10, where Fulcio issues a cert against the same OIDC token). Learn it once; it recurs everywhere. This is why the platform is *learnable* — there are only about three primitives, reused.

**Evidence flows into enforcement.** Provenance, SBOM, and attestations (produced in Part IV) are *inert* until admission (Chapter 14) *consumes* them as policy inputs. Evidence-production without evidence-consumption is theater; the interlock is the value. And admission-verification is only meaningful because the evidence was produced by an isolated trust factory (Chapter 5) with unforgeable platform-issued identity (Chapter 6). Pull any one thread and the others lose their meaning.

**Each layer makes the next tractable.** Immutable, digest-pinned, identical artifacts (Chapter 7) are what make runtime baselines crisp enough to detect drift (Chapter 17). Build-once (Chapter 7) is what lets the dossier accumulate on one digest through promotion (Chapter 11). Workload identity (Chapter 15) is what lets secrets be identity-unlocked instead of secret-zero'd (Chapter 18). The layers don't just coexist; they *enable* each other.

**Verification always lives in the next trust domain.** The recurring answer to "what if X is compromised?" — Git's compromise is backstopped by admission; the build's by independent verification and reproducibility; the signer's by transparency logs; the vault's by identity-based auth and per-secret scoping. No layer vouches for itself; the next layer checks it. This is separation of duties, mechanized, all the way down.

**The control plane of every control is the real perimeter.** Every Architecture Conversation converged here: the policy repo, the OIDC issuer, the signing root, the vault's auth, the reconciler's config, the CODEOWNERS file. These are the master keys, and they get the strictest governance (Chapter 19) — because attackers edit the control, not the artifact.

## Designing for an organization: the tiers

Real platforms aren't one-size. Match rigor to risk (this is Chapter 23's maturity model, applied):

- **Tier 0 (crown jewels — payments, auth, PII):** the full chain, `failurePolicy: Fail`, SLSA L3 provenance, default-deny everywhere, strictest review, dedicated identities. Every interlock live.
- **Tier 1 (standard production services):** the full chain, pragmatic exemptions, audit-mode graduating to enforce, shared platform golden paths.
- **Tier 2 (internal tools, low-blast-radius):** signature verification + posture policies + identity, lighter on the exhaustive attestation dossier.

The art is *not* applying tier-0 rigor everywhere (that's how platforms become unusable and get routed around) nor tier-2 rigor to crown jewels (that's how breaches happen). Golden paths (Chapters 4, 5, 19) make the *secure* path the *easy* path, so teams opt into rigor by default rather than being forced into it.

## The multi-cluster, multi-cloud reality

The perimeter is dead (Chapter 1), so the platform spans clusters and clouds. The architecture survives this because it was never perimeter-based: SPIFFE federation (Chapter 15) lets identities verify across trust domains; keyless signing and transparency logs are cloud-agnostic; GitOps reconcilers pull into each cluster independently; admission enforces locally everywhere. Identity + evidence + local verification is *inherently* distributed — which is exactly why it replaced the perimeter.

## Common mistakes (at the architecture level)

- Building controls that don't interlock — evidence produced but never verified, identity issued but permissions never scoped, policies written but never enforced at the boundary
- Uniform rigor (everything tier-0, so the platform is unusable, so teams build shadow paths that bypass all of it)
- Securing the artifact chain while leaving the control planes (policy repo, issuer, vault auth) as the soft underbelly
- No golden path — so security is a tax each team pays manually and inconsistently, rather than the default they inherit
- Designing for one cluster/cloud, then bolting on federation as an afterthought
- Treating the platform as "done" — it's a living system that drifts, and the threat landscape moves

## Design review questions

- Draw your platform's full chain. At every arrow: identity, evidence, verifier. Any arrow missing one of the three is a finding.
- Trace one real artifact commit-to-pod. Does evidence produced upstream actually get *verified* downstream, or just produced?
- Name every control plane (policy repo, OIDC issuer, signing root, vault auth, reconciler config, CODEOWNERS). Is each governed more strictly than what it controls?
- Where's your golden path? What fraction of services are on it vs. bespoke?
- Does the architecture survive a second cluster / second cloud without re-founding it?
- Point at your softest link — the one place where a single compromise runs code in prod with nothing downstream noticing. (There's always one. Knowing it is the job.)

:::tip[Key Takeaways]

- A platform is its interlocks, not its controls: evidence→enforcement, identity→everywhere, each-layer-enables-the-next, verification-in-the-next-domain.
- There are only ~3 primitives (verify-at-boundary, separate-the-authorities, guard-the-control-plane) reused across ~20 controls — which is what makes the whole thing learnable and coherent.
- Match rigor to risk with tiers and golden paths; uniform rigor gets routed around, uniform laxity gets breached.
- The control planes are the real perimeter; secure them strictest.
- The platform is a living system — design it, then keep threat modeling it forever.
:::

## Architecture Conversation

**E:** I can see all twenty controls now. But when I sit down to design a platform from scratch, where do I even *start*? Twenty things at once is paralyzing.

**A:** You don't start with controls. You start with one sentence and refuse to let any part of it be unverified. Say the sentence.

**E:** "When a container runs in production, we can prove it's the code a developer wrote, reviewed, built cleanly, and authorized to deploy."

**A:** Now break that sentence and each fragment *names its own control*. "The code a developer wrote" —

**E:** — signed commits, Git as root of trust. "Reviewed" — branch protection, CODEOWNERS. "Built cleanly" — the trust factory, hermetic builds, platform-issued provenance. "Authorized to deploy" — GitOps review, deployment authorization. "We can prove it" — the whole evidence chain, verified at admission. The controls aren't a checklist I memorize; they're what each clause of that sentence *demands*.

**A:** That's the whole book. The sentence generates the architecture; threat modeling (Chapter 20) stress-tests it; the interlocks make it hold. Last question, the one that never stops mattering: you've built all of it. Where's your single point of failure — the one component whose compromise runs your code in prod with nothing catching it?

**E:** Realistically... the policy repo plus the reconciler. If I compromise the repo that holds admission policies *and* the GitOps config, I can exempt my own images and deploy them, with a tidy audit trail of me doing it. That's my soft center.

**A:** Correct — and notice you can now *find* your own soft center, which most engineers never can. That's the difference between someone who deploys tools and someone who designs architecture. So harden it: separate the humans who own policy from those who own deploys, alert on every policy change independently of the repo, and put the signing root somewhere neither can reach alone. You'll never reach zero soft centers — you reach *known, guarded, monitored* soft centers. That's not a lesser goal. That *is* the goal. Now let's talk about what happens when, despite all of it, something gets through.
