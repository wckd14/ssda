---
title: Deployment Authorization
description: "Everything so far verifies what is deployed (evidence) and how it flows (GitOps)."
sidebar:
  label: 13. Deployment Authorization
  order: 2
---

> **Chapter 13** · Deployment Trust

## Why this exists

Everything so far verifies *what* is deployed (evidence) and *how* it flows (GitOps). This chapter is about *who may cause it and under what circumstances* — the human-authority layer. It exists because two failure modes destroy platforms from opposite directions: **unauthorized change** (no meaningful control over who ships to prod) and **authorization theater** (a CAB meeting rubber-stamping tickets nobody reads, adding days of latency and zero security). Mature release engineering threads between them.

## Mental model

Deployment authorization is a **launch-control system**: the missile only fires when independently-held keys turn together. Not one person's enthusiasm, not a committee's paperwork — a small set of *machine-enforced, independently-held* conditions: valid evidence (the artifact's dossier, Chapter 11) + policy satisfaction + the right approvals for *this* change's risk class. The keyword is *machine-enforced*: authorization that lives in a wiki is a suggestion; authorization that lives in branch protection, environment rules, and admission policy is a control.

## Architecture

**Promotion as the authorization skeleton.** In the build-once model (Chapter 7) + GitOps (Chapter 12), "deploy to prod" is concretely "merge the PR that points prod at digest D." Authorization architecture is therefore mostly *Git and pipeline mechanics*, which is precisely what makes it enforceable:

- **Risk-tiered approvals.** Not all changes are equal; treating them equally guarantees theater. A digest bump that passed staging: one owner approval, auto-mergeable. A change touching the payment service's config or infrastructure: stricter owners, maybe two teams. Schema migrations: their own path. Encode tiers in CODEOWNERS + branch rules + environment protection so the *heavyweight process spends only where risk lives*.
- **Separation of duties, precisely defined.** The useful rule isn't "another human clicked approve," it's: **no single identity can author a change and independently cause it to run in production.** Author ≠ sole approver (branch protection), builder ≠ deployer (Chapter 12's split), and — often forgotten — *the person who approves the deploy repo PR shouldn't be able to also rewrite the policy that gates it* (Chapter 19).
- **Environment protection as machine-checked authority.** GitHub environments / GitLab protected environments bind deploy identities (Chapter 6's OIDC claims include `environment`) to required reviewers, wait timers, and branch restrictions — turning "prod deploys need release-team approval" from a norm into a credential-issuance condition.

**Emergency deployments — the section that decides everything.** Every platform has a 3am. If your authorized path takes 45 minutes of approvals and prod is down, engineers *will* route around it — and the workaround becomes the everyday path within a quarter. Design break-glass deliberately:

1. **Fast, not absent**: a break-glass path with *reduced* gates (e.g., skip staging soak, single senior approver) — never *zero* gates. Evidence verification (signatures, provenance) stays on: an emergency justifies skipping *slow* checks, never *integrity* checks — "we're in a hurry" is precisely the social-engineering pretext an attacker uses.
2. **Loud**: using it pages someone, is logged, is visibly labeled in the deploy history.
3. **Expensive afterward, cheap during**: mandatory post-incident review of every break-glass use; the *review* is the deterrent, not friction at 3am.
4. **Monitored for trend**: break-glass frequency rising = your normal path is too slow — fix the path, or the emergency door becomes the front door.

## Threat model & compromise scenarios

- **Social-engineered urgency**: "sev1, need this deployed NOW, skip the checks" — from a compromised account or a manipulated human. Defense: break-glass that preserves integrity verification and produces an audit trail regardless of who invokes it; culture where invoking it is normal-and-reviewed, so nobody grants ad-hoc exceptions *outside* it.
- **Approval fatigue as a vulnerability**: humans asked to approve 30 PRs/day approve without reading — attackers hide in the flow. Defense: automate the low-risk tiers *away from humans entirely* (evidence-gated auto-promotion) so human attention concentrates on the few changes that need judgment. Fewer, meaningful approvals beat many hollow ones — this is a security argument, not just DX.
- **Authority accretion**: the release engineer who, over three years, accumulates author+approve+deploy+policy rights. Periodic access reviews against the "no single identity" invariant; model your own org's admins as threat actors when reviewing (not because they're malicious — because their *credentials* are targets).

## Common mistakes

- One-size approvals: everything needs the same two rubber stamps (theater) or a weekly CAB (latency + theater)
- Break-glass that bypasses signature/provenance verification ("emergencies" = your integrity controls are optional)
- No break-glass at all — guaranteeing invention of undocumented ones
- Approval enforced socially ("we always get a thumbs-up in Slack") rather than mechanically
- Measuring authorization by *ceremony performed* rather than *invariants held*

## Design review questions

- State your separation-of-duties invariant in one sentence. Now name every identity that violates it (include admins and service accounts).
- Show the break-glass procedure. What does it skip? What does it *never* skip? When was it last used, and where's that review?
- What fraction of prod deploys involve a human decision, and is that fraction spent on the changes that actually carry risk?
- Can the deploy-approving group modify the policies that gate deploys?

## Implementation examples

GitHub: environment protection rules (required reviewers, wait timers, deployment branch policies) + CODEOWNERS tiers + merge queue; GitLab: protected environments + approval rules; ArgoCD sync windows (freeze periods) + manual-sync-only for regulated apps; Kyverno/OPA policy exceptions with expiry (`spec.validUntil`) as machine-managed break-glass with automatic re-lock.

:::tip[Key Takeaways]

- Authorization = machine-enforced launch keys: evidence + policy + risk-proportional human approval.
- The invariant: no single identity authors and independently ships. Everything else is implementation.
- Break-glass is designed, loud, integrity-preserving, and reviewed — or it becomes the main entrance.
- Concentrate scarce human judgment on high-risk change; automate the rest on evidence.
:::

## Architecture Conversation

**E:** Our auditors want approval on every production change. Engineers want continuous deployment. These seem simply incompatible.

**A:** What does the auditor actually need — a human click, or an assurance?

**E:** Assurance: changes are authorized, traceable, and can't bypass controls. The click is just how they've seen it done.

**A:** So restate continuous deployment in assurance language.

**E:** Every change is authored via reviewed PR, carries signed evidence that all required checks passed, is promoted by a system that verifies that evidence, and is fully traceable commit-to-pod. Authorization *happened* — it's encoded in branch protection and admission policy rather than in a meeting. Honestly, that's *more* auditable: the control can't be skipped, and the evidence is cryptographic rather than a ticket someone filled in afterward.

**A:** I've watched that exact argument satisfy regulated-industry auditors — when the platform could *demonstrate* the enforcement, not just describe it. Demonstration means: show the policy, attempt the bypass, show it fail, show the log. Now — the policies doing all this enforcing: what's *their* change process? If they're a YAML file one admin can edit...

**E:** ...then approvals are decoration. The policy repo is the real authority. Chapter 19, I assume.

**A:** And the engine that enforces it at the last possible moment: Chapter 14. Go.
