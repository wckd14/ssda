---
title: The Trust Model
description: "Every other chapter in this book is a zoom-in on one link of a single chain."
sidebar:
  label: 2. The Trust Model
  order: 2
---

> **Chapter 2** · Foundations

## Why this exists

Every other chapter in this book is a zoom-in on one link of a single chain. If you internalize this chapter, the rest of the book becomes obvious. If you skip it, the rest becomes a list of tools.

## Mental model: the chain of custody

Software delivery is a **chain of custody**, exactly like evidence in a criminal trial. Evidence is only admissible if every handoff — who collected it, who transported it, who stored it — is documented and verifiable. One undocumented handoff and the evidence is worthless.

```
 Developer ──► Git ──► Builder ──► Artifact ──► Deployment ──► Runtime
     │          │         │           │             │             │
  identity   review    isolation   signature     policy       identity
  (who am I) (was it   (was the    +provenance  (is this     (who is this
             checked)   factory     (birth       allowed      workload,
                        clean)      certificate) to run?)     really?)
```

At every arrow, three questions must be answerable:

1. **Identity** — who/what performed this step? Can it prove it cryptographically?
2. **Evidence** — what proof did this step produce that it happened correctly?
3. **Verification** — does the *next* step independently check that proof before accepting the handoff?

### The five core concepts

**Trust boundary.** A line across which the level of trust changes. Developer laptop → Git is a boundary (laptops are assumed compromised; Git is controlled). CI → registry is a boundary. Registry → cluster is a boundary. Architecture is the art of deciding *what evidence must cross each boundary*.

**Identity.** Every actor — human, pipeline, workload — needs a verifiable identity. Not a shared password. Not a long-lived API key sitting in a config file. A cryptographically verifiable, short-lived, narrowly-scoped identity. (Chapters 6, 15.)

**Evidence.** Assertions, signed by an identity, about what happened: "this artifact was built from commit `abc123` by workflow X" (provenance), "this artifact contains these dependencies" (SBOM), "this artifact passed these tests" (attestations). (Chapters 8–11.)

**Independent verification.** The step that consumes an artifact must verify the evidence itself — it must never trust the producer's word. The cluster verifies the image signature; it doesn't trust CI's claim that it signed it. This is the software equivalent of separation of duties. If the producer and the verifier are the same system, compromising one system defeats both. (Chapter 14.)

**Blast radius.** The honest question is never "can this be compromised?" (yes, everything can) but "*when* this is compromised, what does the attacker get, and how far can they move?" Good architecture assumes breach and makes each breach small, noisy, and dead-ended.

## Trust boundaries: the master table

| Boundary | What crosses it | Evidence required | Who verifies |
|---|---|---|---|
| Laptop → Git | Commits | Signed commits, PR review, status checks | Git platform (branch protection) |
| Git → CI | Source at a SHA | Pinned SHA, protected branch | CI checkout config |
| CI → Registry | Artifact | Digest, signature, provenance, SBOM | Registry policy + later consumers |
| Registry → Cluster | Image | Signature & provenance verification | Admission controller |
| Cluster → Workload | Running pod | Workload identity (SVID/IRSA) | Peer services, cloud IAM |

## Threat model: thinking in attack paths

An attacker's goal is almost always "run my code in your production." Their options, ordered by increasing sophistication:

1. **Compromise a developer** — steal a token, phish credentials, malicious IDE extension
2. **Compromise the source** — sneak code past review, poison a dependency
3. **Compromise the build** — malicious plugin, cache poisoning, runner takeover
4. **Compromise the artifact store** — push/replace images in the registry
5. **Compromise deployment** — modify manifests, abuse deploy credentials
6. **Compromise runtime** — exec into containers, exploit the app itself

Each layer of this book closes one path *and* — crucially — makes the layer *behind* it detectable. Provenance doesn't prevent a build compromise; it makes a fake artifact from a compromised build fail verification downstream.

## Common mistakes

- **Trusting transitively.** "The cluster trusts the registry, the registry trusts CI, CI trusts Git, therefore the cluster trusts the commit." Each hop is an assumption; the chain is only as strong as its most bypassable link. Independent verification collapses transitive trust into direct verification.
- **Perimeter thinking in disguise.** "Only our VPC can reach the registry, so anything in the registry is trusted." Network location is not identity.
- **Confusing encryption with trust.** TLS proves you're talking to the registry. It says nothing about whether the image inside is legitimate.

## Design review questions

- For every arrow in your delivery diagram: what evidence crosses it, and who verifies that evidence?
- Which components, if compromised, can push code to production *without any other system noticing*? (Those are your single points of trust.)
- If your CI system lied about what it built, what downstream would catch the lie?

:::tip[Key Takeaways]

- Software delivery is a chain of custody: identity + evidence + independent verification at every handoff.
- Trust nothing transitively. Verify at the boundary where damage happens.
- Design for blast radius, not for invulnerability.
:::

## Architecture Conversation

**E:** This feels like a lot of ceremony. Git is already access-controlled, CI is internal, the registry is private. Why isn't network isolation plus access control enough?

**A:** Who can push to your private registry?

**E:** The CI service account.

**A:** Where does that credential live?

**E:** In the CI system's secret store... which, okay, is readable by anyone who can modify a pipeline. So any developer — or anyone who steals any developer's token — can push an arbitrary image to the "trusted" registry.

**A:** And what does your cluster check before running an image from that registry?

**E:** That it can pull it. So the actual security property of my "private registry" is: *anyone in engineering can run any code in production*, with one stolen laptop as the entry point.

**A:** Now you're threat modeling. The registry being private was never the control. The control we're missing is: production only runs artifacts carrying evidence that a trusted, isolated builder produced them from reviewed source. Everything else in this book is building that sentence, word by word.
