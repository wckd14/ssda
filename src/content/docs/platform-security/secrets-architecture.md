---
title: Secrets Architecture
description: "The architecture of every secret that must still exist: minimizing long-lived credentials, issuing dynamic and short-lived secrets with Vault, and the full secret lifecycle."
sidebar:
  label: 18. Secrets Architecture
  order: 1
---

> **Chapter 18** · Platform Security

## Why this exists

Half of this book has been quietly waging war on one thing: the long-lived secret. Chapter 6 replaced them in CI with OIDC. Chapter 15 replaced them at runtime with workload identity. This chapter zooms out and asks the question those chapters kept deferring: **what is the architecture of every secret that must still exist, across its entire life?** Because some always must — a third-party API key with no OIDC option, a database password for a legacy system, a signing key's root of trust. The goal is not "use Vault." The goal is: **for every secret, minimize its lifetime, its scope, its blast radius, and the number of places it exists — end to end, from creation to revocation.**

## Mental model

Most teams think of secrets as **objects to store** ("where do we put the password?"). Mature platforms think of secrets as **a lifecycle to manage** ("how does this secret get born, delivered, used, rotated, and killed — and how many copies exist at each moment?"). The shift is from *vault-as-warehouse* to *secret-as-a-flow*. A stored secret is a liability that grows with every copy and every day of age; the architecture's job is to keep secrets *few, fresh, and narrow*.

Best of all is the secret that doesn't exist — the recurring theme. Every secret you can replace with identity (Chapters 6, 15) is a secret you never have to store, deliver, rotate, or revoke. **Elimination beats management.** This chapter is about the residue that survives elimination.

## Architecture: secrets across the SDLC

Trace one secret through every boundary — this is the map most "secrets management" discussions skip:

```
 Developer ──► CI ──► Build ──► Registry ──► Deployment ──► Runtime ──► Rotation ──► Revocation
     │          │       │          │            │             │            │            │
  never in   OIDC,    no baked-  no secrets   sealed/       injected     scheduled    kill on
  git; local not      in secrets in images   external      at runtime    + on-        compromise;
  only       stored   (build      (scan for   ref, not      via CSI/     compromise   fast, tested
             (Ch.6)   args leak!) leaks)      plaintext     identity     (short TTL   path
                                                            (Ch.15)      makes it
                                                                         automatic)
```

**Developer stage.** Secrets must never enter Git — not in code, not in `.env` committed "by accident," not in Terraform state (which is plaintext!). Controls: pre-commit hooks (gitleaks, trufflehog), platform-side push protection (GitHub secret scanning), and the cultural rule that a leaked secret is *rotated, not deleted* (deleting the commit leaves it in history and in every clone). Local development uses short-lived credentials from the secrets platform, never shared static keys pasted in Slack.

**CI stage.** Covered in Chapter 6 — OIDC over stored secrets. The residue (secrets that genuinely must live in CI) gets: per-job scoping, masking in logs, and *never* exposure to fork-triggered workflows. Watch the subtle leak: secrets passed as build args (`--build-arg`) get baked into image layers and are recoverable with `docker history`.

**Build/registry stage.** No secrets baked into images, ever — layers are forever, and image scanning (Trivy, and dedicated secret scanners) should fail the build if one slips in. The classic leak: a `RUN` step that uses a credential and a later step that "removes" it — the credential persists in the earlier layer.

**Deployment stage.** Manifests reference secrets; they never *contain* them. Kubernetes `Secret` objects are **base64, not encrypted** — anyone with `get secret` RBAC or etcd access reads them plaintext. Mature patterns: external secret operators (External Secrets Operator syncing from Vault/cloud secret managers), or sealed/encrypted-at-rest secrets (Sealed Secrets, SOPS) so the GitOps repo holds only ciphertext, or — best — CSI Secret Store driver mounting secrets fetched at runtime via workload identity, so the secret never becomes a K8s Secret object at all.

**Runtime stage.** The secret arrives *just in time*, scoped to *this workload's identity*, ideally short-lived (Vault dynamic secrets: a database credential minted per-pod, valid for an hour, auto-revoked). Injected via mounted volume (tmpfs, not disk) or fetched from the secrets API using the SVID/IRSA identity — the two halves of Part VI and this chapter clicking together.

**Rotation.** Rotation is not a fire drill you perform in a panic; it's a property you engineer. Short-TTL dynamic secrets rotate *by expiring* — the strongest form, because there's no rotation event to forget. For secrets that can't be dynamic: scheduled rotation, versioned so old and new coexist during rollover (rotating without versioning causes the outage that makes teams afraid to rotate, which is how you end up with five-year-old keys). Design rotation into the secret's birth; retrofitting it is where rotation projects go to die.

**Revocation.** The property everyone forgets until an incident: when a secret is compromised, how fast can you make it *stop working everywhere*? Short-TTL secrets self-revoke (compromise has an expiry). Long-lived secrets need a tested, fast revocation path — and "tested" is load-bearing: an untested revocation path discovered mid-incident is a second incident. This is why TTL is a security control, not a convenience: **a short TTL is automatic revocation.**

## Threat model & compromise scenarios

- **The leaked secret's blast radius is a function of four numbers**: lifetime (how long it works), scope (what it accesses), copies (how many places it lives), and detection lag (how long until you notice). Architecture minimizes all four. A secret that's short-lived, narrowly-scoped, exists in one place, and is monitored is a bad day; a long-lived, broadly-scoped, widely-copied, unmonitored secret is a company-ending breach. Same "leak," four-orders-of-magnitude difference in outcome — decided entirely by architecture, before the leak ever happened.
- **The bottom turtle** (secret-zero problem): to fetch secrets you need a credential; to get that credential you need... a secret. Naively solved by placing one long-lived master secret somewhere, which becomes the ultimate target. Solved properly by *identity*: the workload proves what it is (attested by the platform, Chapter 15), and that proof — not a pre-placed secret — is what unlocks the secrets API. This is why secrets architecture *depends on* identity architecture; a secrets manager without workload identity just relocates secret-zero.
- **Secrets sprawl**: the same credential copied into CI, a `.env`, a wiki, three Slack threads, and two engineers' laptops. Now revocation requires *finding all copies*, which is impossible, so nobody rotates, so the secret ages into a landmine. The architectural answer is *centralization of source + just-in-time delivery* so there's one authoritative copy and ephemeral usages, never persistent duplicates.
- **The secrets manager as single point of failure/compromise**: centralizing secrets concentrates risk (who signs the signer, again). Mitigations: the vault's own auth is identity-based (not a master secret), aggressive audit logging of every access, break-glass procedures, and namespacing/policy so one compromised identity can't read *all* secrets — least privilege applied to the vault itself.

## Common mistakes

- Treating Kubernetes Secrets as secure (they're encoded, not encrypted; enable etcd encryption-at-rest at minimum, but don't stop there)
- Secrets in Terraform state files sitting in an S3 bucket in plaintext
- Adopting Vault as a *warehouse* for long-lived secrets that every app can read — a nicer-looking version of the original problem, with secret-zero unsolved
- Rotation designed without versioning (→ outages → fear → never rotating)
- No revocation path, or an untested one
- `--build-arg` and multi-stage leaks baking secrets into image layers
- Deleting leaked secrets from Git instead of rotating them

## Design review questions

- Pick your most sensitive secret. Trace it: where created, every place it exists right now, how delivered to workloads, its TTL, how rotated, how revoked. Count the copies.
- How many secrets in your platform are long-lived where an identity-based (OIDC/workload) replacement exists but wasn't adopted?
- If your most powerful production credential leaked at noon, what's your revocation path and how long until it's dead *everywhere*? When did you last test that?
- What unlocks your secrets manager — an identity, or another secret? (If a secret: where does *that* one live?)
- Can you enumerate every secret and its age? What's the oldest, and why is it still alive?

## Implementation examples

HashiCorp Vault (dynamic DB/cloud secrets with TTLs; Kubernetes auth via SA token → identity-based unlock, no secret-zero; PKI engine for short-lived certs); External Secrets Operator (sync from Vault/AWS Secrets Manager/GCP into the cluster on demand); Secrets Store CSI Driver (mount at runtime via IRSA/workload identity, no K8s Secret object); SOPS + age/KMS or Sealed Secrets (ciphertext-in-Git for GitOps); cloud-native (AWS Secrets Manager with automatic rotation Lambdas, rotated on a schedule with versioning built in); gitleaks/trufflehog in pre-commit and CI; etcd encryption-at-rest as table stakes.

:::tip[Key Takeaways]

- Secrets are a lifecycle (birth → delivery → use → rotation → revocation), not a storage problem. Manage the flow, minimize the copies.
- The best secret is no secret: eliminate via identity wherever OIDC/workload identity reaches; this chapter governs only the residue.
- A leaked secret's damage = lifetime × scope × copies × detection-lag. Architecture minimizes all four *before* the leak.
- Short TTL is automatic rotation and automatic revocation — engineer TTL, not fire drills.
- Solve secret-zero with identity, or your secrets manager just relocates the problem.
:::

## Architecture Conversation

**E:** We deployed Vault. All our secrets live there now instead of in env vars. That's the secrets problem solved, right?

**A:** How does an application authenticate to Vault to *get* its secrets?

**E:** It uses a Vault token that we... put in the pod as an environment variable.

**A:** So to protect your secrets, you distributed a secret that unlocks all the other secrets. Where does that token come from, and how long does it live?

**E:** It's a long-lived token we generated once and put in the deployment. Oh. We built the world's most secure warehouse and taped the master key to the front door. Every pod carries the one credential that opens everything.

**A:** That's secret-zero, and it's the failure mode of every "we adopted a vault" project that skips identity. What's the fix?

**E:** The pod authenticates to Vault using its *identity* — the Kubernetes service account token Vault verifies against the cluster, or its SPIFFE SVID. No pre-placed Vault token; the workload *proves what it is* and Vault issues short-lived, scoped secrets based on that proof. Which means... secrets architecture literally cannot work without the workload identity from Chapter 15. They're one system.

**A:** Now you see why the book's order matters. Identity had to come first, because secrets management is just identity plus the residue that identity can't yet eliminate. One more: you've centralized secrets in Vault. State the new risk honestly.

**E:** Vault is now a single point of catastrophic compromise — read it and you have everything. So Vault's own auth must be identity-based, every access audited, and policy must scope each identity to only its secrets, so one compromised workload can't read the whole store. Least privilege, applied to the thing that holds the privileges.

**A:** Concentration of trust, deliberately chosen and rigorously guarded — the same honest trade as GitOps and admission. You're not eliminating the risk; you're putting it in one defensible, monitored place. Which raises the question behind all of these policies and scopes and rules: where do the *rules themselves* live, who owns them, and how do they change? That's the next chapter.
