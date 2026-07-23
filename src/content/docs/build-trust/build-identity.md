---
title: Build Identity
description: "Why static CI secrets cause breaches like Codecov, and how OIDC replaces them with a short-lived, context-bound build identity that also unlocks keyless signing."
sidebar:
  label: 6. Build Identity
  order: 2
---

> **Chapter 6** · Build Trust

## Why this exists

Every attack story in Chapter 5 ends the same way: *the attacker reaches the credentials*. Static secrets in CI — `AWS_ACCESS_KEY_ID` in a secrets store, a registry password in an env var — are the crown jewels because they are **long-lived, broadly scoped, and divorced from context**. Stolen once, they work from anywhere, for months, for anything. Codecov's entire blast radius *was* CI environment variables.

The architectural fix is to stop giving builds *secrets* and start giving them *identity*.

## Mental model

A static credential is a **house key**: whoever holds it gets in, forever, no questions. An OIDC-based workload identity is a **passport checked at every border**: issued by an authority, naming exactly who you are (org, repo, workflow, branch), expiring in minutes, and evaluated against policy at each use. You can't meaningfully steal a passport check; you'd have to steal the *person*.

## Architecture

**The OIDC trust triangle.** Modern CI identity works like this:

```
   CI Platform (identity provider)
   "I certify this token belongs to:
    repo=acme/payments, workflow=release.yml,
    ref=refs/heads/main, run_id=4512"
        │  signed OIDC token (JWT), TTL ≈ minutes
        ▼
   Build job ── presents token ──► Cloud/Service (relying party)
                                    │ verifies signature against
                                    │ CI platform's public keys,
                                    │ checks claims against policy:
                                    │ "repo == acme/payments
                                    │  AND ref == refs/heads/main"
                                    ▼
                          short-lived, scoped credentials
                          (AWS STS creds, ~15–60 min)
```

No secret is stored anywhere. The build *proves who it is* per-run, and the relying party decides what that identity may do. AWS calls the exchange [`AssumeRoleWithWebIdentity`](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html) via STS; GCP calls it [Workload Identity Federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation); Vault has a [JWT/OIDC auth method](https://developer.hashicorp.com/vault/docs/auth/jwt); [Sigstore's Fulcio](https://docs.sigstore.dev/certificate_authority/overview/) issues signing certificates against the same tokens (Chapter 10).

**Claims are the security boundary.** The token's claims — `repository`, `ref`, `workflow`, `environment`, `actor` — are what your trust policy matches on. The infamous foot-gun: an AWS role trust policy matching only `repo:acme/*` lets *any workflow in any branch of any repo in the org* — including a PR branch created by a compromised account — assume the production deploy role. Correct policies pin `repo` **and** `ref` (and, on GitHub, prefer the `environment` claim, since environments carry their own protection rules).

**Granularity of identity.** Mature platforms issue different identities for different pipeline stages: the *test* job gets an identity that can pull dependencies; only the *release* job on `main` gets an identity that can push to the production registry or sign. This is least privilege applied to the pipeline's internal structure, and it's what makes "compromise the PR build" different from "compromise the release."

**Jenkins and legacy CI.** Jenkins has no first-class OIDC issuer, which is a real architectural gap. Approaches: run Jenkins agents on EKS and use IRSA/Pod Identity so each agent pod gets a scoped IAM role; or use Vault with tightly-scoped, short-TTL roles per folder/job; or front Jenkins with an internal token service. The principle survives even when the implementation is uglier: **per-job, short-lived, contextually-bound credentials; no static secrets in the CI store.**

## Threat model & compromise scenarios

- **Token theft**: an OIDC token or STS credential stolen mid-build works for minutes, only for that job's permissions, and its use is logged with full context (CloudTrail shows exactly which repo/ref assumed the role). Compare: a stolen static key works for months, silently. The compromise didn't become impossible — it became *small and loud*. That's the design goal.
- **Claim-matching bugs**: the new top vulnerability class. Wildcard `sub` claims, forgetting `ref`, trusting `workflow_dispatch` from any actor. Audit trust policies like IAM policies — because they are IAM policies.
- **Issuer compromise**: if the CI platform's OIDC signing keys are compromised, the attacker mints arbitrary identities. This is the "who signs the signer?" problem — you've concentrated trust in the issuer. Mitigations: monitor issuer key rotation, restrict which issuers each cloud account trusts, and keep production-critical roles gated behind additional controls (environment approvals) so identity alone isn't sufficient.

## Common mistakes

- OIDC configured, but the old static keys never revoked ("we added the passport system but the skeleton keys still work")
- `sub` claim wildcards; missing `ref`/`environment` conditions
- One deploy role shared by all repos — identity without granularity
- Secrets available to all jobs including fork-triggered ones
- Treating Vault as the goal: Vault holding long-lived secrets that every job can read is a *nicer-looking* version of the same problem

## Design review questions

- List every static credential in your CI secret store. For each: why can't it be an OIDC exchange?
- Show me the trust policy for the production deploy role. What exact claims does it require?
- Can a feature-branch build obtain any credential that touches production?
- When a credential is used, can you tell *which build* used it from the audit log?

:::tip[Key Takeaways]

- Replace stored secrets with proven identity: OIDC federation makes credentials short-lived, scoped, and contextual.
- The claims-matching policy *is* the security boundary; review it like IAM, because it is IAM.
- Identity granularity per pipeline stage separates "can build" from "can release."
- Build identity is the same pattern as workload identity (Chapter 15) — one architecture, two locations.
:::

## Architecture Conversation

**E:** We federated GitHub Actions to AWS via OIDC. No more static AWS keys. Done?

**A:** Read me your role's trust policy condition.

**E:** `"token.actions.githubusercontent.com:sub": "repo:acme/*"`.

**A:** I compromise one intern's account, push a branch to *any* acme repo with a workflow that assumes this role. Do I get in?

**E:** ...Yes. The org wildcard means every branch of every repo is production-trusted. It should be `repo:acme/payments:environment:production`, with the environment requiring approval.

**A:** Better. Now: why should AWS trust GitHub's OIDC issuer at all?

**E:** Because... we configured it to. If GitHub's issuer were compromised, the attacker mints tokens claiming to be any repo, and AWS believes them.

**A:** Correct — you haven't eliminated trust, you've *relocated* it to a party with better security economics than your secrets store, and made every use of it logged and short-lived. That's what good architecture does: it never achieves zero trust, it puts the remaining trust where it's most defensible and most observable. Keep asking "who do I still trust?" — the answer is never "no one," and knowing the answer is the whole game.
