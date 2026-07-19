---
title: Provenance
description: "Provenance is the cryptographic record of who built an artifact, from which source and build — SLSA-style, signed with Sigstore — tying every delivery stage together."
sidebar:
  label: 8. Provenance
  order: 2
---

> **Chapter 8** · Artifact Trust

## Why this exists

Everything so far protects *stages*: the repo, the build, the registry. Provenance is different — it's the thread that ties the stages together. It answers, cryptographically, the question this book opened with:

> **Why should anyone believe this artifact is the code the developer wrote?**

Without provenance, that belief rests on a chain of unverifiable assumptions ("well, it's in our registry, so presumably CI built it, so presumably from our repo..."). With provenance, it rests on a signed, machine-checkable statement.

## Mental model: the birth certificate

Provenance is an artifact's **birth certificate**: an authoritative document, issued by a trusted authority *present at the birth*, stating who the parents are (source repo + commit), where the birth happened (build platform), when, and attended by whom (workflow, builder). Crucially:

- A birth certificate is only credible because the *hospital* issues it — not the baby, not the parents. Provenance is only credible when the **build platform** generates and signs it — not the build script (build scripts are attacker-controlled; they live in the repo).
- Anyone can *claim* parentage; the certificate is checkable against the issuing authority.
- And, extending the analogy to its limit: a certificate doesn't prove the person in front of you is good — it proves *who they are and where they came from*. Provenance doesn't prove code is safe; it proves the code is *the* code, from *your* review process, via *your* factory. Safety comes from what the review and factory do; provenance makes their output non-forgeable.

## Architecture

**What provenance contains.** The standard format is **SLSA Provenance** (an in-toto attestation). Conceptually:

```json
{
  "subject": [{ "name": "acme/payments",
                "digest": { "sha256": "9f8e..." } }],        ◄ WHAT
  "predicate": {
    "buildDefinition": {
      "externalParameters": {
        "workflow": { "repository": "github.com/acme/payments",
                      "ref": "refs/heads/main",
                      "path": ".github/workflows/release.yml" } },
      "resolvedDependencies": [
        { "uri": "git+https://github.com/acme/payments",
          "digest": { "gitCommit": "abc123..." } } ]          ◄ FROM WHAT
    },
    "runDetails": {
      "builder": { "id": "https://github.com/actions/runner/..." }, ◄ BY WHOM
      "metadata": { "invocationId": "...", "startedOn": "..." }
    }
  }
}
```

Subject (artifact digest) + materials (source commit, dependencies) + builder identity + invocation details — the complete birth record.

**How provenance is produced.** The critical architectural rule: **the platform, not the pipeline, generates provenance.** If a build step in your YAML writes the provenance JSON, then anyone who can edit the YAML (or compromise the build) writes whatever provenance they like. SLSA formalizes this as build levels: at L3, provenance generation is *unforgeable by the build's own steps* — it runs in a separate trust domain (e.g., GitHub's reusable `slsa-github-generator` workflows, or GitHub artifact attestations, where the signing identity is provisioned by the platform and unavailable to user-defined steps).

**How provenance is signed and verified.** The provenance document is wrapped in a DSSE envelope and signed — typically via Sigstore keyless flow: the builder authenticates via its OIDC identity (Chapter 6!), Fulcio issues a short-lived certificate binding the signature to that identity, and the signature is logged in Rekor's transparency log (Chapter 10 covers this machinery). Verification then checks: (1) signature validity, (2) **signer identity matches the expected builder** — e.g., certificate identity is *your* release workflow in *your* repo, not merely "some valid Sigstore signature", (3) subject digest matches the artifact you're about to run, (4) source claims meet policy (repo is yours, ref is `main`).

**Where verification happens.** At every consumption boundary, but decisively at **admission to the cluster** (Chapter 14): "no pod runs unless its image carries provenance signed by our build platform, from our repo, from a protected ref." That one policy converts the entire left side of the pipeline from *assumed* to *verified*.

## Threat model: how attackers forge provenance — and why they fail

1. **Fabricate the document.** Write a provenance JSON claiming the artifact came from your repo. *Fails at signature verification* — attacker has no key/identity acceptable to the verifier.
2. **Sign with a stolen developer identity.** *Fails at identity policy* — the verifier requires the *builder's* identity (the release workflow), not any org member. This is why "verify the signer is exactly the expected workflow" matters and why sloppy verification (`--certificate-identity-regexp '.*'`) is worthless.
3. **Compromise the build steps and emit fake provenance.** *Fails at SLSA L3* — provenance generation is outside the build steps' reach. At L1/L2 (pipeline-generated provenance), this attack *succeeds* — which is exactly the difference the levels measure.
4. **Compromise the build platform itself.** The honest residual risk. The platform is the trusted issuer; its compromise defeats provenance from within. Mitigations live in different trust domains: transparency logs make every issued signature *publicly auditable* (mass forgery is loud), reproducible builds allow independent rebuilding-and-comparison, and monitoring Rekor for signatures claiming your identity detects misuse. Note the pattern again: the answer to "X is compromised" is never inside X.

**Real-world grounding.** SolarWinds is the canonical "this is what provenance is for" case: SUNBURST-tainted builds would carry provenance from the *real* builder — but a reproducibility check would fail, and more importantly, the entire post-incident question "which artifacts came from the compromised build system, built between which dates?" becomes a *query over provenance* instead of a months-long forensic dig. npm/PyPI ecosystems now publish provenance for packages (npm `--provenance`, PyPI Trusted Publishers) applying the identical architecture to open-source supply chains.

## Common mistakes

- Provenance generated by a step in the user-controlled pipeline (forgeable by definition)
- Verifying "a valid signature exists" without pinning *whose* signature (identity policy is the actual control)
- Generating provenance but never verifying it anywhere ("evidence theater" — a birth certificate no one ever asks for)
- Verifying in CI only ("we check provenance in the deploy pipeline") — the deploy pipeline is upstream machinery; the *cluster* must verify, or a deploy-pipeline compromise bypasses everything
- Forgetting that provenance covers the artifact, not its behavior — it complements scanning/testing, never replaces it

## Design review questions

- Can your build steps forge their own provenance? (If provenance is emitted by your YAML: yes.)
- Write out the exact verification policy: which signer identities, which source repos, which refs are acceptable — and where is it enforced?
- If an image appeared in your registry with no provenance, would anything downstream reject it?
- During an incident, how fast can you answer: "list every artifact built by builder B between T1 and T2"?

## Implementation examples

- **GitHub**: `attest-build-provenance` action / artifact attestations; `gh attestation verify`; or `slsa-github-generator` for SLSA L3.
- **Verification**: `cosign verify-attestation --type slsaprovenance --certificate-identity <exact workflow identity> --certificate-oidc-issuer https://token.actions.githubusercontent.com <image@digest>`; Kyverno `verifyImages` with attestation conditions for in-cluster enforcement; `slsa-verifier` for CLI verification against source expectations.
- **Jenkins**: harder (no platform-issued identity) — pattern: isolated signing service that Jenkins jobs *request* attestations from, with the service validating job context before signing; honest assessment: reaching L3-equivalent on Jenkins requires building the separate trust domain yourself.

:::tip[Key Takeaways]

- Provenance is the artifact's birth certificate: subject digest + source + builder + invocation, signed by the *platform*.
- Forgeable provenance (pipeline-emitted) is worse than none — it manufactures false confidence.
- Verification policy (whose signature, from which repo/ref) is the control; a signature's existence is not.
- Provenance proves origin, not virtue. It makes your other controls (review, scanning) non-bypassable rather than replacing them.
:::

## Architecture Conversation

**E:** Provenance seems circular. The build system signs a statement saying the build system did the build. It's grading its own homework.

**A:** Sharp. Untangle it: *within* one trust domain, yes, it's self-attestation. So what makes it non-circular?

**E:** The verifier is in a *different* trust domain. The cluster checks the signature against an identity policy the build system doesn't control.

**A:** Right — provenance isn't the build system convincing itself; it's the build system making a claim that *someone else* can hold it to. Now the question you should ask next.

**E:** Who signs the signer? If Fulcio or the OIDC issuer is compromised, forged provenance verifies cleanly.

**A:** And the answer?

**E:** ...There's no final signer. At some point there's a root you just trust.

**A:** Correct, and it's important to say it out loud rather than pretend otherwise. The design goals for that root are: make it *small* (few systems, minimal surface), make it *hard* (dedicated infrastructure, not a shared Jenkins box), and make it *loud* (transparency logs — every signature ever issued is publicly visible, so abusing the root can't stay secret). You can't eliminate the root of trust. You can choose it deliberately and surveil it. That's Chapter 10's real subject.
