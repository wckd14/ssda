---
title: Incident Response
description: "The entire book assumed breach as a design premise ('blast radius, not invulnerability' — Chapter 2)."
sidebar:
  label: 22. Incident Response
  order: 1
---

> **Chapter 22** · Operations

## Why this exists

The entire book assumed breach as a design premise ("blast radius, not invulnerability" — Chapter 2). This chapter is what happens when the premise comes true. Supply-chain incidents are *different* from ordinary security incidents in ways that break normal IR playbooks — and the difference is exactly what the preceding chapters prepared you for. A platform built on identity, evidence, and verification doesn't just *prevent* better; it *responds* better, because every artifact already carries its biography. This chapter is where all that accumulated evidence earns its keep.

## Mental model

Ordinary IR asks "which machines are infected?" Supply-chain IR asks a harder question: **"what did the compromised thing touch, and what did *those* things touch?"** — because a poisoned build doesn't infect one host; it stamps its poison into every artifact it produced, which flows to every environment those artifacts reached. The mental model is **contact tracing, not decontamination**: you're tracing lineage through a supply chain, and the thing that makes tracing possible-in-hours-vs-months is the evidence chain (provenance, SBOM, attestations) you built in Part IV. IR is where you find out whether your evidence was theater or real.

## Architecture: the supply-chain-specific incidents

Five incidents, each with the property that makes it different and the evidence that makes it tractable:

**1. Signing key / signer identity compromise.**
- *Why it's brutal*: everything signed by the compromised identity now verifies as legitimate — including the attacker's artifacts. Your trust root lied.
- *The keyless advantage (Chapter 10)*: with Fulcio + Rekor, you don't have "a key that's been bad for an unknown duration" — you have a *transparency log of every signature ever issued by that identity*. Query Rekor for signatures you didn't make; you get an exact list and exact timestamps. Certificate windows bound the exposure. Compare classical long-lived keys: "we don't know what was signed or when" — the nightmare.
- *Response*: identify the compromise window (Rekor timestamps), enumerate artifacts signed in-window, distrust them at admission (add to a denylist / revoke the identity's trust), re-sign legitimate artifacts with a new identity, rotate the trust configuration. The evidence chain turns "unknown scope" into "queryable scope."

**2. Registry compromise / malicious artifact injection.**
- *The provenance advantage (Chapter 8)*: every legitimate artifact has provenance chaining to a real build of a real commit. Injected artifacts *don't* (or have forged provenance that fails identity verification). So "which images are malicious?" becomes "which images lack valid provenance from our builder?" — a verification pass, not a forensic guess.
- *Response*: admission policy already blocked unprovenanced images from *running* (the injection may never have reached production — verify that first, it's often the good news). Purge injected artifacts, audit registry access logs for the write, rotate the credential used, verify no valid-provenance artifact was also tampered.

**3. CI compromise.**
- *Why it's the worst*: CI produces *and signs* artifacts (SolarWinds). Artifacts from a compromised CI may carry *valid* provenance (the real builder built them — it was just compromised). This is the residual risk Chapter 8 named honestly.
- *The evidence advantage*: provenance tells you *exactly which artifacts came from which builder invocations between which times*. "List every artifact built by builder B between T1 (suspected compromise) and T2 (remediation)" is a *provenance query*. Reproducible builds (Chapter 5) let you rebuild-and-compare to find *which* in-window artifacts were actually tampered vs. clean.
- *Response*: freeze the compromised CI, rebuild the build infrastructure from known-good (ephemeral runners mean there's no persistent state to clean — Chapter 5 pays off), identify in-window artifacts via provenance, rebuild-and-compare where reproducible, re-issue artifacts, force-rotate every credential CI could touch (assume all are burned).

**4. Git compromise.**
- *The backstop (Chapter 3's "what if Git is compromised")*: an attacker with Git can *propose* anything, but the downstream chain (build must run, provenance must generate, admission must verify) means malicious commits still have to traverse the whole factory — visibly, loudly, logged. Signed commits let you distinguish attacker commits from legitimate ones by identity.
- *Response*: identify unauthorized commits (signature verification, audit log), revert, force-rotate developer/bot credentials, review what merged during the window, verify nothing malicious reached artifacts (provenance ties artifacts back to commits — trace forward from the bad commits).

**5. Dependency / supply-chain compromise (the XZ / Log4Shell shape).**
- *The SBOM advantage (Chapter 9)*: "are we affected, and where?" is the operational-SBOM query you built for exactly this moment. Minutes, not weeks.
- *Response*: query SBOMs joined with runtime inventory for the affected component, rank by exposure (internet-facing first), patch/mitigate by priority, and — critically — check whether the compromised dependency *already ran* and did anything (runtime detection logs, Chapter 17).

## The cross-cutting IR architecture

**Preparation (the only part you control before the incident):**
- Evidence must be *queryable under pressure*: provenance searchable by builder+time, SBOMs joined to runtime, Rekor monitored. An evidence chain you can't query at 3am is theater.
- Runbooks per incident type, *tested* (a tabletop for "CI is compromised" before it is).
- Break-glass that's *usable during* an incident (Chapter 13) — IR often requires emergency deploys, and if your emergency path skips integrity checks, an attacker will trigger a fake incident to use it.
- Credential inventory: know what each compromised component can touch, so "rotate everything it could reach" is a list, not a discovery exercise.

**Containment leverages the architecture:** admission denylists (stop known-bad artifacts from running *anywhere*, instantly, on every path — the unskippable gate works for defense too), NetworkPolicy quarantine (Chapter 16 — cut a compromised workload's egress), identity revocation (short-TTL means much is self-limiting), GitOps revert (roll production to a known-good commit — the flight recorder, Chapter 12).

**Eradication + recovery leverage build-once + reproducibility:** rebuild from verified-clean state, promote known-good digests (rollback is re-pointing at a previous digest that *still carries its original evidence* — Chapter 7), replace-don't-clean (Chapter 17's runtime lesson: you can't prove a cleanup, you can prove a fresh verified deploy).

**Post-incident:** the evidence chain makes the retrospective *precise* — you can state exactly what was affected, because you have provenance and SBOMs, rather than hand-waving "we think it was contained." Feed findings back into threat models (Chapter 20) and policy (Chapter 19).

## Common mistakes

- Evidence produced but not queryable — discovering during the incident that your SBOMs are in a bucket you can't join, or Rekor was never monitored
- Untested runbooks (the tabletop you skipped is the incident you fumble)
- Break-glass that skips integrity verification — weaponizable by the attacker via fake urgency
- Cleaning compromised runtime in place instead of replacing from verified state (unprovable, and misses in-memory persistence)
- Under-rotating: rotating the obviously-compromised credential but not everything the compromised component *could reach*
- Treating a supply-chain incident like a host incident — decontaminating machines while poisoned artifacts sit in the registry waiting to redeploy

## Design review questions

- Tabletop right now: "we suspect CI was compromised Tuesday–Thursday." Walk me through it. How fast can you list in-window artifacts? (That's a provenance query — do you have it?)
- If your primary signing identity were compromised, how would you enumerate what it signed and when? (Rekor — is it monitored?)
- "Are we affected by CVE-X / dependency-Y?" — minutes or weeks? Where does the answer come from?
- When was your last IR tabletop for a *supply-chain* (not host) incident?
- Does your IR break-glass preserve integrity verification? Could a faked incident be used to bypass controls?
- For each pipeline component: what can it touch? Is that a written list (for rotation scope) or a discovery exercise?

## Implementation examples

Rekor monitoring (rekor-monitor, or periodic `rekor-cli search` for your identities); provenance queries via your attestation store / GUAC ("artifacts by builder+time"); Dependency-Track/GUAC for the SBOM affected-workloads join; admission denylist policies (Kyverno/Gatekeeper image-blocklist) for instant containment; ArgoCD/Flux revert to known-good commit; Falco/runtime logs for "did it execute" forensics; documented, tested runbooks per incident class in the platform repo.

:::tip[Key Takeaways]

- Supply-chain IR is contact-tracing through artifact lineage, not host decontamination — and the evidence chain (provenance, SBOM, Rekor) is what makes tracing take hours instead of months.
- Each incident type has a specific evidence advantage: Rekor for signer compromise, provenance for CI/registry/Git, SBOM for dependency compromise. IR is where you learn if your evidence was real.
- Containment reuses the architecture: admission denylists, network quarantine, identity revocation, GitOps revert.
- Recovery reuses build-once + reproducibility + replace-from-verified: rebuild clean, promote known-good digests, never clean in place.
- Prepare the queryability *before* the incident; test runbooks; keep break-glass integrity-preserving.
:::

## Architecture Conversation

**E:** It's 2am. Our CI system — we think it was compromised sometime in the last three days. Every artifact it built might be poisoned. In a traditional shop this is a multi-week forensic nightmare. Talk me down.

**A:** First question: did any unverified artifact reach production?

**E:** Admission requires valid provenance, so injected artifacts *without* it never ran. But artifacts the compromised CI built carry *real* provenance — the builder was legit, just owned. So those could be in prod, provenance and all.

**A:** So how do you find *which* artifacts, out of everything CI built, are actually tampered?

**E:** Provenance gives me the list of everything built in the window — that's a query, not a hunt, because every artifact records its builder and build time. Then, if our builds are reproducible, I rebuild each in-window artifact on clean infrastructure and compare digests. Matches are clean; mismatches are the tampered ones. I've turned "which of thousands of artifacts is poisoned" from guesswork into a diff.

**A:** And containment while you investigate?

**E:** Admission denylist for the in-window digests — instant, every path, every cluster, because admission is the unskippable gate. Rotate every credential CI could reach — and I have that list because we inventoried it. Rebuild CI from scratch; ephemeral runners mean there's no persistent implant to miss. Then re-issue the clean artifacts and lift the denylist.

**A:** Now the honest part. What if the builds *aren't* reproducible, so you can't diff?

**E:** Then I can't cleanly separate tampered from clean, so I treat the whole window as suspect — rebuild everything built in it from verified source, re-promote. More expensive, but still *bounded* by the provenance query. Without provenance, I wouldn't even know the boundary — that's the multi-week nightmare. The evidence chain didn't prevent this incident, but it turned an unbounded catastrophe into a bounded, queryable, hours-long operation.

**A:** That sentence is why every "produce evidence" chapter mattered. Prevention was never the only payoff — *legibility under fire* was. An architecture you can't reason about during an incident is an architecture you don't really have. Next: how organizations grow into all of this without trying to do it all on day one.
