---
title: Maturity Models
description: "How to sequence a secure-delivery program without a big-bang rewrite: SLSA, NIST SSDF, and CIS Benchmarks as a staged roadmap matched to your actual risk."
sidebar:
  label: 23. Maturity Models
  order: 2
---

> **Chapter 23** · Operations

## Why this exists

Reading twenty-two chapters of controls can produce a dangerous reaction: "we have none of this; we're hopeless; let's do all of it next quarter." That reaction fails every time — big-bang security transformations break production, exhaust teams, and get abandoned. Maturity models exist to answer the *sequencing* question: given that you can't do everything at once, **what do you do first, what does "good enough for now" look like, and how do you improve deliberately over years?** They turn an overwhelming pile into a roadmap. This chapter is the antidote to both complacency ("we're fine") and paralysis ("it's hopeless").

## Mental model

Maturity is not a score to maximize; it's a **deliberate trajectory matched to your risk**. A three-person startup at "SLSA Level 1" everywhere may be making a *correct* engineering decision; a bank at Level 1 for its payment system is negligent. The model's job isn't to shame you toward maximum rigor — it's to make your current level a *choice you can defend* rather than an accident you haven't noticed, and to give you the next rung when you're ready to climb. Think **fitness levels, not a final exam**: you train progressively, you match intensity to goals, and "elite everywhere" is neither achievable nor always desirable.

## The three frameworks worth knowing

**SLSA (Supply-chain Levels for Software Artifacts)** — the build-integrity ladder, and the most directly relevant to this book. It grades *how trustworthy your build and provenance are*:

- **L0**: no guarantees. (Most orgs start here and don't know it.)
- **L1**: provenance exists — the build produces a provenance document. Cheap, and immediately useful for the "what did we build" question.
- **L2**: provenance is *signed*, build runs on a hosted/managed platform. Tampering with provenance now requires defeating signing.
- **L3**: provenance is *unforgeable by the build's own steps* — generated in an isolated trust domain the build can't reach. This is the level that actually stops SolarWinds-class attacks (Chapters 5, 8), because a compromised build *cannot* forge its own provenance.

The insight: SLSA levels map directly onto Chapter 8's threat model. L1 answers "what did we build," L2 defeats provenance-tampering, L3 defeats build-compromise-forges-provenance. You climb by *closing specific attack classes*, not by collecting points.

**NIST SSDF (Secure Software Development Framework, SP 800-218)** — the *breadth* framework. Where SLSA goes deep on build integrity, SSDF covers the whole SDLC in four practice groups: Prepare the Organization (PO), Protect the Software (PS), Produce Well-Secured Software (PW), Respond to Vulnerabilities (RV). It's outcome-based (it says *what* to achieve, not *how*), which makes it a good *coverage checklist* — "have we thought about each of these practice areas?" — and it carries regulatory weight (US federal software procurement references it, via EO 14028).

**CIS Benchmarks / Kubernetes hardening** — the *concrete configuration* layer. Where SSDF is outcome-based and SLSA is build-focused, CIS gives you specific, checkable settings (CIS Kubernetes Benchmark, CIS Docker Benchmark) — the runtime and platform hardening baseline (Chapters 16, 17). Tools like kube-bench check compliance automatically. This is your "are the knobs set right" layer.

**How they compose:** SLSA for build/artifact trust (depth on the supply chain), SSDF for whole-lifecycle coverage (breadth as a checklist), CIS for concrete platform hardening (configuration floor). They're complementary lenses, not competitors — mature programs reference all three, each answering a different question ("is our build trustworthy," "did we cover the lifecycle," "are our configs hardened").

## Architecture: a sequenced roadmap

The order that works, roughly, because each rung enables the next (and each delivers value alone, so you're never "halfway to nothing"):

**Foundation (weeks) — visibility and the cheapest wins:**
- Branch protection + CODEOWNERS on critical paths (Chapter 3-4) — nearly free, immediately raises the bar
- SBOM generation + a queryable store (Chapter 9) — because the *next* Log4Shell is coming and this is your answer
- Secret scanning in CI + pre-commit (Chapter 18) — stop the bleeding
- Ephemeral CI runners (Chapter 5) — kills persistence, often just a config change on hosted CI

**Build trust (months) — SLSA L1→L2:**
- OIDC federation, kill static CI secrets (Chapter 6)
- Provenance generation, then signing (Chapters 8, 10)
- Digest-pinning, build-once-promote-many (Chapter 7)

**Deployment gate (months) — the enforcement turn:**
- GitOps (Chapter 12) — often the biggest operational shift, sequence it carefully
- Admission control in *audit mode first*, then enforce, tier by tier (Chapters 14, 19) — never big-bang
- Attestation-gated admission (Chapter 11) — evidence becomes enforcement

**Runtime + SLSA L3 (quarters to years):**
- Workload identity, kill runtime static secrets (Chapter 15)
- Default-deny network + mesh authz, staged namespace-by-namespace (Chapter 16)
- Runtime detection + immutability (Chapter 17)
- SLSA L3 (isolated provenance generation) for tier-0 workloads
- Policy-as-code maturity, threat modeling as routine (Chapters 19, 20)

**Continuous — the never-done part:** IR tabletops (Chapter 22), threat model refresh (Chapter 20), maturity re-assessment, closing the gap between your current level and your *target* level per tier.

## The tiering principle (revisited from Chapter 21)

You don't have *one* maturity level; you have one *per workload tier*. Crown jewels reach SLSA L3 + full enforcement while internal tools sit at L1 + basic hardening — deliberately. Maturity investment concentrates where blast radius concentrates. A single org-wide maturity number is a vanity metric; per-tier target-vs-actual is a management tool.

## Common mistakes

- Big-bang transformation (do everything now) → broken prod, burned-out team, abandoned program, poisoned political well
- Chasing the SLSA number as a goal rather than closing the attack classes each level represents (L3 provenance that nobody *verifies* is a very expensive nothing)
- Maturity as a compliance checkbox ("we're SSDF-compliant") without the outcomes SSDF describes
- Uniform maturity target across all workloads (over-investing in internal tools, under-investing in crown jewels)
- Building capabilities (SBOMs, provenance) without the *consumption* that gives them value (queries, admission verification) — maturity theater
- No re-assessment cadence — maturity drifts backward as systems change and nobody notices

## Design review questions

- What's your current SLSA level, per workload tier, and what's your *target*? Is the gap a plan or an accident?
- For each capability you've built (SBOM, provenance, attestations): is it *consumed* by something (a query, a gate), or just produced?
- If you named one thing to improve next quarter, would it be the highest-leverage rung, or the easiest/most-visible one?
- Which frameworks do you reference, and do you use them as roadmaps or as compliance-theater checkboxes?
- When did you last *re-assess* maturity, and did you find drift?

## Implementation examples

SLSA: `slsa-github-generator` / GitHub artifact attestations (L2-L3 build provenance), `slsa-verifier` for verification-side; SSDF: map your controls to SP 800-218 practices as a coverage audit (many vendors provide mapping templates); CIS: kube-bench (Kubernetes benchmark), docker-bench-security, Trivy's config/misconfiguration scanning; OpenSSF Scorecard for a quick automated repo-hygiene baseline; the CNCF Software Supply Chain Security whitepaper as a threat-catalog cross-reference (Chapter 20).

:::tip[Key Takeaways]

- Maturity models answer *sequencing*: what first, what's good-enough-for-now, how to improve over years — the antidote to both complacency and paralysis.
- SLSA (build-integrity depth), SSDF (lifecycle breadth), CIS (config floor) are complementary lenses; reference all three, each for its own question.
- Climb by closing attack classes, not collecting points; a capability nobody *consumes* is theater regardless of its level.
- Maturity is per-tier: concentrate investment where blast radius concentrates; one org-wide number is vanity.
- Sequence deliberately (audit-mode before enforce, namespace-by-namespace, tier by tier); big-bang transformation fails every time.
:::

## Architecture Conversation

**E:** Honestly, reading this whole book, we have almost none of it. Branch protection, some scanning, that's it. Where do I even start without it being hopeless?

**A:** What's the question you most dread being unable to answer during an incident?

**E:** "Are we affected by \<the next big CVE\>, and where?" Right now that's an all-nighter.

**A:** Then that's your first project — not because it's the most "advanced," but because it's high-value, achievable in weeks, and delivers value *the day it's done*. SBOM generation plus a queryable store. What's second?

**E:** Ephemeral runners and OIDC — kill the persistence and the static CI secrets. Also achievable, also valuable alone.

**A:** Notice what you're *not* doing.

**E:** I'm not trying to reach SLSA L3 with isolated provenance and default-deny mesh authz next quarter. That would break everything and burn out the team. I'm climbing rungs where each one stands on its own and each enables the next. And I'm not doing it uniformly — I'll push the payments service further and faster than internal tooling.

**A:** Last thing. A year from now you've built SBOMs, provenance, signing — the whole production side. What's the failure mode I'm worried you'll walk into?

**E:** Building all the *evidence* and never building the *consumption*. SBOMs nobody queries, provenance nobody verifies at admission, signatures nobody checks. Maturity theater — a very expensive pile of capabilities that stops zero attacks because nothing downstream *uses* them. The rung isn't "produce provenance," it's "produce provenance *and gate on it*."

**A:** That's the wisdom most programs learn the hard way. Every capability is worthless until something *consumes* it — the interlock, again, all the way from Chapter 2. Build the producer and the consumer together, or don't build the producer yet. Now — the final skill, the one that makes you dangerous in the best way: sitting down in front of *someone else's* platform and finding, in an hour, where the trust is misplaced.
