---
title: The Artifact Lifecycle
description: "Between 'the build finished' and 'the pod started,' your software lives as an artifact — usually a container image in a registry."
sidebar:
  label: 7. The Artifact Lifecycle
  order: 1
---

> **Chapter 7** · Artifact Trust

## Why this exists

Between "the build finished" and "the pod started," your software lives as an **artifact** — usually a container image in a registry. Most teams treat this phase as boring storage. It isn't. The artifact phase is where the industry's most embarrassing failures happen, because of one deceptively simple confusion: **the difference between a name and a thing.**

## Mental model

A container **tag** (`payments:v2.1.0`, `payments:latest`) is a *name* — a mutable pointer anyone with push access can move. A **digest** (`payments@sha256:9f8e...`) is the *thing* — the cryptographic hash of the image's content, immutable by mathematics rather than by policy.

> Deploying by tag is like wiring money to "whoever currently owns the nickname Dave." Deploying by digest is wiring to an account number.

Every artifact-layer attack in this chapter is, at root, an exploitation of name/thing confusion.

## Architecture

**Build once, promote many.** The cardinal rule of release engineering: build the artifact **exactly once**, then *promote the same digest* through dev → staging → prod. Never rebuild per environment. Why?
1. **What you tested is what you ship.** A rebuild — even from the same commit — can differ: newer base image, drifted dependency, different toolchain. Your staging signoff attested to a *digest*; a prod rebuild ships an *untested sibling*.
2. **Evidence attaches to digests.** Signatures, provenance, scan results, attestations (Chapters 8–11) all reference a digest. Rebuild and every piece of accumulated evidence is orphaned.

**Promotion architecture.** Promotion should be a *metadata operation on an immutable object*, not a data operation:

```
CI build ──► registry/dev/payments@sha256:9f8e...
                    │  gates pass (tests, scans, approval)
                    ▼  promote = re-tag / copy same digest
             registry/prod/payments@sha256:9f8e...   ◄── same digest
```

Two common topologies: separate registries (or registry paths) per trust level with copy-on-promote and *different push credentials per level* (CI can push to dev; only the promotion service can write to prod), or a single registry where "promoted" is expressed purely through signed attestations and admission policy (Chapter 14). The second is architecturally cleaner: promotion becomes *evidence*, not *location*.

**Registry internals worth knowing.** OCI registries are content-addressed stores: an image is a *manifest* (JSON listing layer digests + config digest), and the manifest's own digest is the image digest. Tags are tiny mutable references to manifests — which is precisely why they're untrustworthy and why digest-pinning works. This content-addressing is also what OCI artifacts (signatures, SBOMs, attestations stored *in the registry, attached to the digest*) build upon — the registry becomes the evidence locker, with evidence physically co-located with the thing it describes.

**Rollback.** Because promotion never destroys digests, rollback is "re-point deployment at the previous digest" — instant, exact, and carrying all its original evidence. Teams that rebuild-to-rollback discover, mid-incident, that the rebuild differs from what used to work. Retention policy corollary: never garbage-collect digests that are deployed or were recently deployed.

## Threat model & compromise scenarios

**The `latest` tag attack (the classic).**

```
Deployment manifest: image: acme/payments:latest
Attacker (with any registry push credential — e.g., leaked CI token):
  docker push acme/payments:latest   ◄── now points at malicious image
Next pod restart / node scale-up / eviction:
  kubelet pulls "latest" ──► attacker code runs in production
```

No Git change, no pipeline run, no review — the deployment "didn't change," yet production did. The same attack works on *any* mutable tag, including `v2.1.0` if tag immutability isn't enforced. With `imagePullPolicy: IfNotPresent` and node-cached images it even deploys *unevenly*, producing maddening flapping behavior. Defenses: digest-pinned deployment manifests (GitOps tooling can automate digest resolution), registry tag-immutability settings, admission policy rejecting `:latest` and unpinned images.

**Registry credential theft.** Whoever can push to the paths production pulls from can insert artifacts. Per-level credentials, OIDC push identity (Chapter 6), and — decisively — signature verification at admission (Chapter 14) mean a registry write is necessary but no longer *sufficient*.

**Cross-environment leakage.** Dev images deployable in prod because both pull from the same path with no gate: the "oops, we shipped the debug build with test credentials baked in" incident.

## Common mistakes

- Rebuilding per environment (often rationalized as "we inject environment config at build time" — config belongs at deploy/runtime, not build)
- Mutable tags in production manifests; no tag immutability on the registry
- One registry credential used by CI, developers, and the deploy system alike
- Garbage collection that deletes the digest currently running in prod
- "We scan images in the registry nightly" as the only artifact control — scanning detects known CVEs, not substitution

## Design review questions

- Point at a running production pod: can you trace its exact digest back to one build of one commit? How long does that take you?
- Who — humans and machines — can write to the registry path production pulls from?
- Is anything in production referenced by mutable tag?
- Show me the rollback procedure. Does it rebuild anything?

## Implementation examples

ECR: immutable tags setting, per-path IAM policies, pull-through cache for upstream hygiene. Harbor: projects-as-trust-levels, replication-as-promotion, built-in signing/scanning integration. GitOps digest automation: ArgoCD Image Updater / Flux image automation writing *digests* into Git. Kyverno/Gatekeeper policies: `disallow-latest-tag`, `require-image-digest`.

:::tip[Key Takeaways]

- Tags are names; digests are things. Production references things.
- Build once, promote the digest; evidence travels with the digest.
- Promotion is a trust decision expressed as metadata, not a rebuild.
- Registry write access must be necessary-but-not-sufficient for production execution.
:::

## Architecture Conversation

**E:** We pin digests in prod manifests now. So registry compromise is handled?

**A:** Where do the digests in the manifests come from?

**E:** CI resolves the tag to a digest after build and writes it to the GitOps repo.

**A:** So the integrity of your digest pin depends on the integrity of the thing that wrote it. If CI is compromised, it writes the *attacker's* digest into Git — perfectly pinned, perfectly immutable, perfectly malicious. What did digest-pinning actually buy you?

**E:** It closed the *silent substitution* path — no one can change what runs without a Git write. But it moved the trust question upstream: why should we believe the digest that got written is the right one?

**A:** Exactly. Digest-pinning gives you *integrity of reference*. It cannot give you *legitimacy of the referent*. For that, the artifact itself must carry proof of where it came from — who built it, from what commit, on what infrastructure. That proof is provenance, and it's the next chapter, and it's the heart of this book.
