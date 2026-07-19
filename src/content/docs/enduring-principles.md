---
title: The Enduring Principles
description: "Ten principles that outlast any tool — the whole handbook, distilled."
sidebar:
  order: 99
---

Tools will change. In five years the specific technologies in this book — the CI systems, the signing tools, the policy engines — may be replaced by successors with different names. What won't change are the principles they express. If you remember nothing else, remember these:

1. **Software delivery is a chain of custody.** Identity, evidence, and independent verification at every handoff. This is the whole book in one sentence.

2. **Trust nothing transitively; verify at the boundary where damage happens.** The cluster verifies the artifact directly — it doesn't trust that the registry trusts that CI trusts Git. Transitive trust is the assumption attackers exploit.

3. **Design for blast radius, not invulnerability.** Everything can be compromised. Good architecture makes each compromise small, loud, and dead-ended. The honest question is never "can this be breached" but "what happens when it is."

4. **The answer to 'what if X is compromised?' is never inside X.** Verification lives in the next trust domain. This is separation of duties, mechanized, all the way down.

5. **Eliminate secrets with identity; the best secret is no secret.** Prove who you are; don't carry a bearer token. Short-lived, scoped, attested identity beats stored credentials everywhere it can reach.

6. **Evidence is worthless until something consumes it.** Provenance nobody verifies, SBOMs nobody queries, signatures nobody checks — all theater. Build the producer and the consumer together.

7. **The control plane of every control is the real perimeter.** Attackers edit the policy, not the artifact. Guard the policy repo, the signing root, the OIDC issuer, the CODEOWNERS file — strictest of all.

8. **Match rigor to risk, and make the secure path the easy path.** Uniform rigor gets routed around; uniform laxity gets breached. Tier your workloads; build golden paths.

9. **Prevention shrinks the attacker's options; detection watches what remains; legibility saves you during the incident.** They're one system, and each makes the others better.

10. **The habit is the deliverable.** "Why should X trust Y?" — asked relentlessly, kindly, at every boundary, of your own systems most of all. Memorized controls secure one platform. The habit of interrogating trust secures every platform you ever touch.

The chain of custody starts with a developer's commit and ends with a running workload. Every link is a place where trust can be earned or assumed. This book was about earning it — and about the discipline of never letting an assumption go unquestioned until the architecture becomes resilient.

Now go build systems worth trusting. And when someone hands you one, ask them why anyone should.

*— End —*
