---
title: Attestations
description: "You now have signatures (Chapter 10) and two things worth signing: provenance (Chapter 8) and SBOMs (Chapter 9)."
sidebar:
  label: 11. Attestations
  order: 5
---

> **Chapter 11** · Artifact Trust

## Why this exists

You now have signatures (Chapter 10) and two things worth signing: provenance (Chapter 8) and SBOMs (Chapter 9). But your pipeline produces many more facts worth trusting: tests passed, SAST ran clean, the container scan found nothing critical, performance met SLOs, compliance checks passed. Today those facts live as *green checkmarks in the CI UI* — unverifiable, unportable, forgotten the moment the page closes. Attestations turn every checkmark into **signed, portable, machine-verifiable evidence attached to the artifact digest** — and that's the move that lets deployment gates verify *facts* instead of trusting *systems*.

This is also where people get confused, so let's be surgical about the vocabulary.

## Mental model

An artifact moving toward production is a traveler assembling a **dossier of stamped documents**:

```
artifact@sha256:9f8e...
   ├── provenance attestation      "born of commit abc123, builder B"   (Ch. 8)
   ├── SBOM attestation            "contains these 214 components"      (Ch. 9)
   ├── test attestation            "suite v2 passed, 1,842/1,842"
   ├── SAST attestation            "scanned by S at rev R: no criticals"
   ├── container-scan attestation  "no known CVEs > medium at time T"
   └── compliance attestation      "meets baseline PCI-build-v3"
```

Each stamp is issued by a different authority (the test runner, the scanner, the compliance checker), signed with *that authority's* identity, and physically attached to the digest in the registry. The border checkpoint (admission, Chapter 14) doesn't call each authority to ask — it *reads the dossier and verifies the stamps*.

**Vocabulary, precisely:**
- **Statement**: a claim about a subject — "digest D has property P" (in-toto's structure: subject + predicateType + predicate)
- **Attestation**: a statement *signed* by an identity, wrapped in a DSSE envelope
- **Provenance / SBOM / scan result**: just different *predicate types* — different kinds of claims in the same envelope format. Provenance is not a different mechanism from attestations; it's the most important *instance* of one.

## Architecture

**Producers sign with their own identity.** The test-runner attestation should be signed by the *test infrastructure's* identity, the scan by the *scanner's*. Why not let the pipeline sign everything at the end? Because then the pipeline is a single trust chokepoint — compromise it and every "fact" is forgeable at once. Distinct signer identities mean the verifier can require *independent* stamps, and forging the full dossier requires compromising multiple systems. (Reality check: many orgs start with one signing identity for all attestations and split later — fine, as long as you *know* you've made that trade.)

**Attached to the digest, stored in the registry.** Via OCI referrers/artifacts, attestations live alongside the image they describe. Evidence travels with the artifact through promotion (Chapter 7's build-once model pays off again — one digest accumulates its dossier through the pipeline; a rebuild would orphan it all).

**Consumed by policy.** The endgame. Admission policy (Chapter 14) stops being "is the image signed?" and becomes a *rich predicate over evidence*:

> Admit only if: provenance from builder B, source = our repo @ protected ref, **and** SBOM attestation present, **and** scan attestation newer than 7 days with no criticals, **and** test attestation for this digest passed.

Notice what this abolishes: the deployment gate no longer *trusts the CI system's word* that checks ran. It verifies signed evidence, independently, at the boundary where damage happens. The green checkmark became a cryptographic fact. Notice also the freshness condition — attestations are claims *at a time* ("no known CVEs as of T"). Scan facts decay; policies must demand recency, which implies re-scanning deployed digests and issuing fresh attestations continuously.

## Threat model & compromise scenarios

- **Skipped-check attack (the one attestations kill)**: attacker with pipeline-edit rights deletes the SAST step, or routes deployment through a pipeline that never had it. Without attestations: nothing downstream notices — deploy credentials work regardless. With attestation-gated admission: the artifact arrives at the border *missing a required stamp* and is refused. Controls you can't bypass by *not running them* are a different species from controls that only work when invoked.
- **Attestation replay/misbinding**: reusing a passing test attestation from digest A to bless digest B — defeated because the subject *is* the digest; a stamp for A verifies against nothing else. (This is why attestations bind to digests, never tags or versions.)
- **Compromised producer**: the scanner itself is compromised and attests falsely. Residual risk, honestly held: attestations are only as truthful as their producers. Mitigations: producer infrastructure gets Chapter-5 treatment (isolated, ephemeral, identity-bound); independent duplicate checks for the highest-stakes claims; transparency logging of attestations for after-the-fact audit.
- **Policy laxity**: attestations exist, admission checks only signature presence. The dossier is assembled and no one reads it — evidence theater again.

## Common mistakes

- Signing attestations with a human developer's identity instead of the producing system's
- One giant "everything passed" attestation (unfalsifiable blob) instead of typed, per-check predicates
- No freshness requirements — a scan attestation from 200 days ago satisfying today's policy
- Building attestation *production* without attestation-*consuming* policy (the most common: all dossier, no border)
- Confusing attestation (signed claim about an artifact) with authorization (decision to deploy) — attestations are *inputs* to authorization, Chapter 13's subject

## Design review questions

- List the facts your deploy gate currently takes on faith from CI. Which are attestation-worthy?
- For each attestation type: whose identity signs, and could the build steps forge it?
- Does any policy anywhere *consume* your attestations? Show the predicate.
- What are your freshness rules, and what re-attests already-deployed digests?
- Can an artifact reach production through any path that skips the stamping stations?

## Implementation examples

`cosign attest --type <predicate> --predicate results.json <image@digest>` in each pipeline stage; in-toto predicate conventions (slsaprovenance, cyclonedx, vuln); Kyverno `verifyImages.attestations` with `conditions` evaluating predicate fields (e.g., deny if `criticalCount > 0`); GitHub artifact attestations + `gh attestation verify`; policy-controller (Sigstore) ClusterImagePolicy for attestation-aware admission.

:::tip[Key Takeaways]

- Attestation = signed, typed claim bound to a digest; provenance and SBOM are instances, not siblings.
- The dossier pattern: many producers, each signing with its own identity, evidence traveling with the artifact.
- The payoff is policy that verifies facts instead of trusting systems — checks become unskippable.
- Evidence decays; require freshness; re-attest what's running.
:::

## Architecture Conversation

**E:** This is a lot of machinery to re-prove things our CI already enforces. The pipeline literally *fails* if tests or scans fail — the artifact never gets built. Why stamp what's structurally guaranteed?

**A:** Structurally guaranteed by what?

**E:** The pipeline definition... which lives in the repo... which anyone with write access can edit, and which has fifteen variants across teams, and side-doors like the manual deploy job for hotfixes.

**A:** So the guarantee is "every path that *chooses* to run checks, runs checks." What does the cluster require?

**E:** A pull-able image. So the real invariant is: checks happen unless anyone, anywhere, builds a path without them — including an attacker, including a well-meaning engineer at 3am. With attestation-gated admission, the invariant flips: *nothing runs without proof the checks happened*, regardless of which path built it.

**A:** Say the general principle. It's one of the most important in the book.

**E:** Enforce at the *destination*, not along the *routes*. Routes multiply and drift; the destination is one chokepoint you control.

**A:** And that chokepoint — the border where the dossier gets read — is where we go next: deployment trust.
