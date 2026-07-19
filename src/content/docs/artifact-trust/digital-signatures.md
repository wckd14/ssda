---
title: Digital Signatures
description: "What 'signed' actually means — hashing, signatures, and PKI, plus Sigstore's keyless signing with Fulcio and Rekor, and why a valid signature is never proof of safety."
sidebar:
  label: 10. Digital Signatures
  order: 4
---

> **Chapter 10** · Artifact Trust

## Why this exists

Chapters 8 and 9 kept saying "signed." This chapter unpacks what that actually means, because the machinery — hashing, signing, PKI, certificate chains, transparency logs — is where hand-waving goes to die. Every "verify the signature" step in this book bottoms out here, and so does every "who signs the signer?" question.

## Mental model

Three primitives, three one-line intuitions:

- **Hash** = *fingerprint*. Any change to the content changes the fingerprint. Proves *integrity* ("this is bit-for-bit the thing") but not *origin* (anyone can fingerprint anything).
- **Signature** = *seal on the fingerprint*. Sign the hash with a private key; anyone with the public key verifies. Proves *origin + integrity together*: "the holder of key K vouched for exactly this content."
- **PKI / certificates** = *the introduction problem*. A signature proves "key K signed." But who is K? A certificate is a signed statement by an *authority* binding a key to an identity — and the authority's key is vouched for by another authority, up to a root you simply trust. Every trust chain terminates in an axiom. Architecture is choosing your axioms well.

## Architecture

**The classic approach and its operational disease.** Traditional artifact signing: generate a long-lived keypair, guard the private key, distribute the public key to verifiers. The problems are not cryptographic but *operational*: keys leak (they live in CI secret stores — the exact place Chapter 6 taught us attackers harvest), rotation is a distributed-systems nightmare (every verifier must learn the new key), revocation is worse (how do you tell every cluster on Earth "key K is bad as of Tuesday, distrust signatures after Tuesday — but wait, signatures aren't timestamped trustworthily...").

**Sigstore: keyless signing.** The modern answer, and the reason this book's chapters keep interlocking:

```
Builder (has OIDC identity — Chapter 6)
   │ 1. authenticates to Fulcio with OIDC token
   ▼
Fulcio (certificate authority)
   │ 2. issues a certificate binding the signing key to the
   │    OIDC identity ("repo:acme/payments workflow:release.yml"),
   │    valid ~10 minutes
   ▼
Builder signs artifact digest with ephemeral key
   │ 3. signature + certificate logged to
   ▼
Rekor (transparency log)
   — append-only, publicly auditable record:
     "identity I signed digest D at time T"
```

The ephemeral key is discarded after signing — **there is no long-lived key to steal, rotate, or revoke**. Verification checks: signature validity, certificate chains to Fulcio's root, certificate's *identity* matches policy (this is the actual control — "signed by our release workflow", not "signed by someone"), and inclusion in Rekor proves the signature existed at a logged time (solving the timestamp problem that made classical revocation intractable).

**Transparency logs deserve emphasis.** Rekor is the same idea as Certificate Transparency, which caught rogue CAs in the web PKI: every signature ever issued is publicly visible and append-only. You cannot *prevent* a compromised identity from signing — but you can *detect* it: monitor the log for signatures claiming your identities that you didn't make. It converts key/identity compromise from silent to auditable. Loud beats invisible; this is blast-radius thinking applied to cryptography.

**Why signatures aren't enough.** The most important section of this chapter. A signature proves: *identity I vouched for digest D*. It does **not** prove:
- the content is safe (SolarWinds' malware was *beautifully signed*)
- the content was reviewed (signing is often automated — it proves the pipeline ran, not that humans looked)
- the *right process* produced it (a bare signature says nothing about source repo, ref, review, tests)
- the signer wasn't compromised at signing time

A signature is a *carrier of trust*, not a *source* of it. What should be signed is *rich claims* — "built from commit C of repo R by builder B" (provenance), "contains components X,Y,Z" (SBOM), "passed test suite T" — so verification checks *facts about process*, not the mere presence of a seal. That's attestations, next chapter.

## Threat model & compromise scenarios

- **Key theft (classical)**: attacker signs anything, indefinitely, silently. This is exactly what happened in several high-profile incidents where vendors' code-signing keys leaked and malware shipped with valid vendor signatures. Keyless flow removes the artifact-key; the residual target moves to the *identity* (OIDC account/workflow) — shorter-lived, logged, policy-scoped.
- **Identity compromise (keyless)**: attacker who controls your release workflow's identity signs malicious artifacts *as you*. Mitigations: everything from Chapters 3–6 (that identity is only reachable through protected branches and reviewed workflows) + Rekor monitoring for unexpected signatures.
- **CA/root compromise (Fulcio, or your internal CA)**: the "who signs the signer" endpoint. Mass forgery becomes possible — but transparency-logged, hence detectable. Organizations with stricter requirements run private Sigstore instances or classical keys in HSM/KMS (key never leaves hardware; signing is an audited API call) — trading Sigstore's operational elegance for control of the root.
- **Verification laxity**: the most common *real* failure — `cosign verify` with wildcard identity, or clusters that verify nothing. An unenforced signature scheme is jewelry.

## Common mistakes

- Long-lived signing keys in CI environment variables (the SolarWinds-shaped hole)
- Verifying signature *validity* but not signer *identity* against policy
- Signing tags instead of digests (signing a name, not a thing — Chapter 7's lesson recurring)
- No monitoring of the transparency log for your identities
- Treating "it's signed" as a security conclusion rather than the *start* of one

## Design review questions

- Where do signing keys live, who/what can invoke signing, and what does the audit trail of signing operations look like?
- Recite your verification policy: which identities, which issuer, enforced where?
- If your signing identity were abused tonight, how would you find out — and how would you distrust the bad signatures without distrusting the good ones? (Rekor timestamps + certificate windows are the answer keyless gives you.)
- What, concretely, does a valid signature *entitle* an artifact to in your platform?

## Implementation examples

`cosign sign <image@digest>` (keyless in CI with OIDC); `cosign sign --key awskms:///alias/release-key` for KMS-backed classical; `cosign verify --certificate-identity=https://github.com/acme/payments/.github/workflows/release.yml@refs/heads/main --certificate-oidc-issuer=https://token.actions.githubusercontent.com`; Kyverno/Gatekeeper for cluster-side enforcement; Rekor search/monitoring (`rekor-cli search --email/--sha`) for identity-abuse detection.

:::tip[Key Takeaways]

- Hash = integrity; signature = origin + integrity; certificate = identity binding; every chain ends in a chosen root.
- Keyless (Fulcio + ephemeral keys + Rekor) trades unmanageable key hygiene for identity policy + public auditability.
- Transparency logs turn "prevent misuse" (impossible) into "detect misuse" (tractable).
- A signature is a sealed envelope; what matters is the claim inside — which is why attestations, not bare signatures, are the endgame.
:::

## Architecture Conversation

**E:** With keyless signing there's no key to steal. Haven't we finally eliminated the weak link?

**A:** What does Fulcio check before issuing a signing certificate?

**E:** The OIDC token. So the "key" became the identity — steal the workflow's identity and you sign as us. We moved the target.

**A:** To somewhere better or worse?

**E:** Better: identities are short-lived, bound to context, protected by the whole Git-and-CI stack we built in Parts II–III, and every certificate issuance is publicly logged. Long-lived keys in env vars had none of that.

**A:** Now push on the root. Why do your clusters trust Fulcio?

**E:** Because its root is in our verification config... which we put there. If Fulcio's root were compromised, or if someone changed our verification config to trust a different root — wait. *Who controls the verification config?* If that's just a file in a repo, the whole cryptographic edifice reduces to branch protection on that repo.

**A:** There it is. The policy that decides what to trust is itself a supply-chain artifact. Guard the verifier's configuration with at least the rigor of anything it verifies — most designs I review forget this completely. Chapter 14 and Chapter 19 pick that thread up.
