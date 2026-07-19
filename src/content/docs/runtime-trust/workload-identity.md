---
title: Workload Identity
description: "The artifact cleared the border. Now it's a running workload — and it immediately needs to talk: to databases, to cloud APIs, to other services."
sidebar:
  label: 15. Workload Identity
  order: 1
---

> **Chapter 15** · Runtime Trust

## Why this exists

The artifact cleared the border. Now it's a running workload — and it immediately needs to *talk*: to databases, to cloud APIs, to other services. The question flips from "should this run?" to **"who is this, and how does anyone verify it?"**

The legacy answer is secrets: API keys in env vars, database passwords in mounted files, a shared `service-token` five teams copy around. Every property we fixed in CI (Chapter 6) is broken again at runtime: long-lived, bearer-style ("whoever holds it, is it"), divorced from context, unrotatable in practice. Kubernetes made it worse by making workloads *ephemeral and multiplied* — you can't provision static credentials for pods that appear and vanish by the hundred. The runtime answer is the same architectural move as Chapter 6: **stop distributing secrets; start proving identity** — but now the prover is a pod, and the identity must be issued by the *platform*, based on properties the platform verifies.

## Mental model

Workload identity is an **employee badge issued by the building, not a key copied in a hardware store.** The badge (a short-lived, cryptographically-verifiable document) is issued at the door by the facility that *watched you arrive and verified your paperwork* — it names who you are, it expires, and every door checks it against its own access list. A stolen badge dies in minutes; a stolen key works forever. The critical property: the *workload never possesses a long-lived secret* — it possesses the ability to *be identified* by the platform it runs on.

## Architecture

**SPIFFE: the universal grammar.** SPIFFE (Secure Production Identity Framework For Everyone) standardizes the idea:

- **SPIFFE ID**: a structured name — `spiffe://acme.prod/ns/payments/sa/payments-api` — identifying a workload within a *trust domain* (`acme.prod`).
- **SVID**: the badge itself — an X.509 certificate (or JWT) containing the SPIFFE ID, short-lived, automatically rotated.
- **Workload API**: how a pod gets its SVID *without presenting any prior secret* — the local agent verifies who's asking via **attestation** (same word as Chapter 11, same meaning: verified claims — here, the agent checks kernel-level facts: this process belongs to pod P, with service account S, in namespace N, on a node whose identity was itself attested to the server).

**SPIRE** is the production implementation: a server (signing authority for the trust domain, holds registration entries mapping selectors→SPIFFE IDs) plus a per-node agent (attests nodes to the server, attests workloads locally, serves the Workload API). The elegant part is the **attestation chain**: server verifies node (via cloud instance identity documents, TPM, etc.), node agent verifies workload (via kubelet/kernel introspection), so the workload's badge is rooted in *infrastructure-verified facts*, not in any secret the workload stored. Bootstrapping identity without pre-placed secrets — this solves the "bottom turtle" problem every secrets system otherwise hits (to fetch a secret you need a credential; to get that credential you need...).

**IRSA and cloud-native equivalents.** AWS IRSA (IAM Roles for Service Accounts) is the same pattern with Kubernetes-native parts: the cluster's OIDC issuer signs a projected ServiceAccount token naming the pod's SA; AWS STS validates it against the cluster's issuer and exchanges it for role credentials — Chapter 6's trust triangle, verbatim, with a pod in place of a CI job:

```
Pod (SA: payments-api) ──projected OIDC token──► AWS STS
                                                   │ verify against cluster issuer;
                                                   │ trust policy requires
                                                   │ sub == system:serviceaccount:payments:payments-api
                                                   ▼
                                     short-lived role credentials (≈1h)
```

(EKS Pod Identity is the successor plumbing; GCP Workload Identity Federation and Azure Workload Identity are the same architecture with different nouns.) The claims-matching lesson from Chapter 6 recurs identically: a trust policy matching `system:serviceaccount:*:*` grants the role to *every pod in the cluster*.

**mTLS: identity for service-to-service.** SVIDs being X.509 certificates means service-to-service authentication falls out naturally: mutual TLS where *both* sides present SVIDs, each verifying the peer's SPIFFE ID against policy. Service meshes (Istio, Linkerd) automate exactly this — sidecar/ambient proxies obtain workload certs and enforce mTLS transparently; Istio's identity system is SPIFFE-conformant. The mesh is an *implementation* of workload identity + encrypted transport, not a separate concept.

**Federation.** Two trust domains (two clusters, two companies, cloud↔on-prem) can trust each other's identities by exchanging *trust bundles* (root keys) — `spiffe://acme.prod/...` becomes verifiable inside `partner.prod` without shared secrets. This is how identity survives the multi-cluster, multi-cloud reality that killed network-perimeter thinking.

## Threat model & compromise scenarios

- **Pod compromise** (the baseline): attacker in the container gets... the SVID/STS creds — valid for minutes-to-an-hour, scoped to *that workload's* permissions, every use logged with identity attached. Compare the legacy counterfactual: a `.env` full of long-lived keys for every downstream. Identity doesn't prevent the compromise; it *shrinks and illuminates* it (the book's recurring win condition).
- **Identity theft ≠ identity impersonation**: to *become* `payments-api` (rather than steal one short badge), the attacker must alter what the platform attests — deploy a pod with that service account. Which requires... getting a workload admitted (Chapter 14). The layers now interlock: *admission decides what may run; identity derives from what admission admitted.* Runtime identity is only as trustworthy as the gate.
- **Node compromise**: a compromised node's agent can attest lies about workloads *on that node* — blast radius = one node's workloads, not the trust domain (this containment is precisely why per-node attestation beats cluster-wide shared secrets).
- **Trust domain compromise** (SPIRE server / cluster OIDC signing keys): the who-signs-the-signer endpoint again — attacker mints arbitrary identities. Mitigations rhyme with Chapter 10: protect the signing infrastructure as tier-0, short intermediate lifetimes, audit issuance, federation boundaries so one domain's compromise doesn't cascade.

## Common mistakes

- IRSA adopted, but the old long-lived keys still mounted "just in case" (the Chapter 6 mistake, ported)
- One shared service account (`default`) for every pod in a namespace — identity without granularity is a group costume
- Wildcarded trust-policy subjects
- mTLS "on" but authorization still `ALLOW *` — encrypted, authenticated, and unrestricted (Chapter 16's subject)
- Secrets managers used as a *destination* ("we moved the long-lived keys into Vault") rather than identity used to *eliminate* them
- Forgetting that identity granularity should match *blast-radius intent*: if two workloads share an identity, they share a fate

## Design review questions

- Pick a production pod: enumerate every credential visible inside it (env, mounts, metadata endpoints). How many are long-lived? Why does each exist?
- Show the IAM trust policy for your most powerful role reachable from the cluster. What exact subject does it require?
- If this pod is compromised at 2am, what can the attacker reach, for how long, and what logs carry the workload's identity?
- Can a pod in namespace A obtain an identity intended for namespace B? What, mechanically, prevents it?

## Implementation examples

EKS: IRSA (`eks.amazonaws.com/role-arn` SA annotation) or Pod Identity associations; SPIRE on Kubernetes with `k8s_psat` node attestation + workload registrar; Istio (SPIFFE-conformant certs, PeerAuthentication STRICT); cert-manager csi-driver-spiffe for SVID mounting; Vault Kubernetes auth (SA-token-based login → scoped, short-TTL secrets) as the bridge pattern for systems that still require secrets.

:::tip[Key Takeaways]

- Runtime identity = platform-attested, short-lived, automatically-rotated badges; the workload stores no long-lived secret, ever.
- SPIFFE/SVID, IRSA, and mesh identity are one architecture (attest → issue → verify → expire) in three dialects.
- Identity chains to admission: the gate decides what runs; identity names what the gate admitted. The layers are one system.
- Granularity is blast-radius design: one identity per meaningful security boundary.
:::

## Architecture Conversation

**E:** We rolled out IRSA everywhere. No more AWS keys in pods. Are we done with runtime identity?

**A:** Your payments-api pod — what IAM role does its identity map to, and what can that role do?

**E:** `payments-app-role`... which, from history, has S3 full access, SQS full access, and DynamoDB on `*`. We migrated the *mechanism* and kept the *permissions* — a beautifully short-lived badge that opens every door in the building.

**A:** So what did IRSA actually buy, and what's still yours to do?

**E:** It bought revocability, auditability, and no stealable static key. Least privilege was never the mechanism's job — that's authorization, and we haven't done it. Same for service-to-service: our pods authenticate to *AWS* beautifully and to *each other* not at all — any pod can call payments-api's internal endpoint.

**A:** So state the boundary between this chapter and the next.

**E:** Identity answers "who are you, provably." Authorization answers "given who you are, what may you do." We built half the sentence.

**A:** Chapter 16 finishes it.
