---
title: How to Read This Handbook
description: The structure every chapter follows, and the single question the whole book answers.
sidebar:
  order: 1
---

This is not a tool manual. Tools change every eighteen months; the architecture behind them changes roughly once a decade. This handbook teaches the architecture.

Every chapter follows the same structure so you can navigate it years from now:

1. **Why this exists** — the problem that forced the industry to invent it
2. **Mental model** — the core idea that simplifies the topic
3. **Architecture** — how mature organizations implement it
4. **Trust boundaries** — what is trusted, and what isn't
5. **Threat model & compromise scenarios** — how an attacker approaches it, and what happens if it breaks
6. **Defensive controls** — how the blast radius is reduced
7. **Real-world implementations** — how Google, GitHub, Microsoft, Stripe and others approach it conceptually
8. **Common mistakes** — designs that look secure but aren't
9. **Design review questions** — what an architect should ask
10. **Implementation examples** — Jenkins, GitHub Actions, EKS, ArgoCD, Cosign, SPIFFE, and friends
11. **Key takeaways** — the enduring principles
12. **Architecture Conversation** — a Socratic dialogue between a senior platform architect (**A**) and an engineer (**E**) that questions the trust assumptions until the design becomes resilient

The single question this entire book answers:

> **When a container starts running in production, why should anyone believe it is the code the developer wrote?**

Every chapter is one link in the chain of custody that answers that question.

---
