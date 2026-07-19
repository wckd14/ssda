---
title: Policy as Code
description: "By now, 'the policy' has appeared in almost every chapter — branch protection rules, OIDC trust conditions, admission policies, network policies, auth"
sidebar:
  label: 19. Policy as Code
  order: 2
---

> **Chapter 19** · Platform Security

## Why this exists

By now, "the policy" has appeared in almost every chapter — branch protection rules, OIDC trust conditions, admission policies, network policies, authorization policies, Vault access policies. Every one of them is *the control's control plane* — and the recurring lesson of every Architecture Conversation has been that **the attacker's real target is the policy, not the thing the policy protects**. This chapter is about the architecture of policy *itself*: where it lives, who owns it, how it's tested, how it evolves, and how you keep the entity that enforces your security from being the softest way to disable your security.

Note the framing, matching the source material's intent: this is **not a chapter about OPA/Rego syntax**. Rego is a tool; you can learn it from docs in an afternoon. This is about the *architecture* of policy as a first-class platform concern.

## Mental model

Policy is **legislation for your platform**. And functioning legislation needs the same things functioning law does: a clear jurisdiction (what this policy governs), an authoring process (who can propose and who ratifies), a testing process (does it do what we think, without unintended effects), versioning and audit (what was the law on the day of the incident?), and a controlled amendment process (changing the law is harder than obeying it). A platform whose policies are ad-hoc YAML edited by whoever, whenever, with no tests, is a platform governed by decree — and decrees are exactly what attackers issue once they're inside.

## Architecture

**Policy as code, literally.** Every policy — admission rules, network policies, IAM, OIDC trust conditions, Terraform Sentinel/OPA checks — is a versioned artifact in a repository, reviewed via PR, tested in CI, deployed via GitOps, and audited via Git history. Policies get the *exact* SDLC this whole book describes for application code, because **policies are among the most security-critical code you run**. If your application code goes through review, testing, and provenance, but your admission policies are hand-edited in the cluster, you've hardened the cargo and left the rudder unguarded.

**Where policies belong (the architectural decision).** The key design question is placement — the same policy logic can live at very different points, with very different tradeoffs:

| Placement | Enforces | Strength | Weakness |
|---|---|---|---|
| Shift-left (CI, pre-merge) | Fast feedback, dev-time | Cheap, educational, catches early | Bypassable (skip the check) |
| Admission (cluster gate) | Last-line, unskippable | On every path (Ch. 14) | Later feedback; availability-critical |
| Runtime (mesh/network) | Live behavior | Continuous | Post-deployment |

Mature platforms place the *same intent* at multiple layers — a policy like "no privileged containers" is checked in CI (fast feedback for the developer), *enforced* at admission (unskippable), and *observed* at runtime (drift detection). Shift-left for velocity, enforce at the boundary for security — never rely on shift-left alone, because a check that runs pre-merge is a check an attacker (or a rushed engineer) routes around.

**Policy ownership.** The four-domain model from Chapter 4 applies: who owns which policies? Security/platform owns the *baseline* (the non-negotiable floor: no privileged pods, signature required, default-deny); service teams own *service-specific* policy within that floor. The pattern that scales is **library policies + local parameters**: the platform team ships tested, reusable policy modules (Gatekeeper ConstraintTemplates, Kyverno policy libraries), teams instantiate them with their parameters. Reviewing the library secures every consumer — the same leverage as golden-path build templates (Chapter 5).

**Policy testing — the discipline that separates policy-as-code from policy-as-yaml.** Untested policy is dangerous in *both* directions: a policy that's too loose fails silently (it was supposed to block X and doesn't — you find out during the breach), and a policy that's too strict causes an outage (it blocks legitimate traffic — you find out during the incident, and now "security policy" is a cursed phrase). So policies get unit tests: assert this input is denied, that input is allowed, this edge case is handled. OPA has `opa test`, Kyverno has a CLI test harness, Gatekeeper has gator. Test the *intent* — including the cases you expect to allow, because over-blocking is how good security controls get rolled back by frustrated teams.

**Policy evolution — the lifecycle most teams get wrong.** New policies don't go straight to Enforce; that's how you break production and poison the political well (Chapter 16's staged-rollout lesson, generalized):

```
 Author + test  ──►  Audit/Warn mode  ──►  measure violations  ──►  fix or exempt  ──►  Enforce
 (PR, unit tests)   (log, don't block)    (who would break?)     (remediate the      (with the
                                                                  legit ones)         escape hatch
                                                                                      designed in)
```

And design the **exemption mechanism** deliberately: exemptions with expiry (`validUntil`), owned and reviewed, so "temporary exception" doesn't become "permanent hole nobody remembers." An exemption without an expiry is a policy with a silent carve-out — the thing attackers look for first.

**Guarding the policy plane (the meta-control).** Since policy-repo write access is enforcement-rewrite access, the policy repo gets the *strictest* controls in your org: security-team-only CODEOWNERS, required reviews from people who understand the blast radius, signed commits, and — critically — **separation from the teams whose work the policy governs** (the people who can deploy shouldn't be able to weaken the policy that gates their deploys, echoing Chapter 13's separation of duties). Plus in-cluster detection: alert on *any* change to ClusterPolicies, webhook configurations, ConstraintTemplates — because a GitOps'd policy change is legitimate-looking right up until you notice *who* made it and *what* it exempted.

## Threat model & compromise scenarios

- **Policy weakening via legitimate channels**: attacker (or compromised insider) opens a PR adding an exemption, swapping a trusted identity, or flipping Enforce→Audit — and GitOps faithfully applies it, complete with an audit trail of the disabling. Defense: strictest-in-org review on the policy repo, separation of duties, and in-cluster alerting so a policy change is *noticed* independent of the repo.
- **The gap between layers**: a policy enforced in CI but not at admission means anyone bypassing CI bypasses the policy — the "we shift-left'd it" false comfort. Defense: enforce security-critical intent at the *boundary*, treat shift-left as feedback not enforcement.
- **Silent policy failure**: a policy that was supposed to block something but has a logic bug and doesn't — undetected because nobody tested the *deny* cases. Defense: policy unit tests asserting the denials, and audit-mode telemetry showing what *would* be blocked (a policy that never fires in audit mode is either perfect or broken — investigate which).
- **Over-blocking → rollback → net-negative security**: an untested strict policy breaks legitimate work, gets angrily reverted, and the *category* of control becomes politically radioactive. Defense: test allow-cases, stage through audit mode, measure before enforcing. Security controls that get rolled back are worse than ones never shipped.

## Common mistakes

- Admission/network policies hand-edited in-cluster, untracked, untested — decree, not legislation
- Policies going straight to Enforce without an audit-mode soak (breaking prod, poisoning the well)
- No policy unit tests, especially no *allow*-case tests (silent over- and under-blocking)
- Exemptions without expiry or ownership (permanent holes disguised as temporary)
- The policy repo governed no more strictly than app repos — or worse, by the same people the policy governs
- Relying on shift-left checks as enforcement (bypassable by definition)
- No alerting on policy/webhook configuration changes

## Design review questions

- Where do your admission and network policies live? Are they in Git, reviewed, tested, and GitOps-deployed — or edited in-cluster?
- Show me a policy's unit tests. Do they assert what's *allowed*, not just what's denied?
- Who can merge to the policy repo? Is that set separate from the teams whose deployments those policies gate?
- How does a new policy roll out — straight to Enforce, or through audit mode with measurement?
- Show me your current policy exemptions. Which have expiry dates? Which have owners? Which are older than their justification?
- What alerts when someone changes a ClusterPolicy or webhook configuration in the cluster?

## Implementation examples

OPA/Gatekeeper (ConstraintTemplates as reusable library, `gator test` in CI, audit mode via `enforcementAction: dryrun`, constraint exemptions with review); Kyverno (policies-as-CRDs, CLI test harness, `Audit` vs `Enforce` per-policy, PolicyExceptions with controlled ownership); Conftest (OPA policies against Terraform/K8s manifests in CI — shift-left layer); Terraform Sentinel/OPA (IaC policy gates); all policies deployed via ArgoCD/Flux from a strictly-governed policy repo; in-cluster change alerting via audit-log rules on `validatingwebhookconfigurations`, `clusterpolicies`, `constrainttemplates`.

:::tip[Key Takeaways]

- Policy is your platform's legislation: versioned, reviewed, tested, staged, audited — it's the most security-critical code you run, so give it the strongest SDLC.
- Placement is architecture: shift-left for feedback, enforce at the boundary for security, observe at runtime for drift — the same intent at multiple layers, never relying on the bypassable one.
- Test both directions: unit-test denials *and* allowances; roll out through audit mode; measure before enforcing — over-blocking gets your controls rolled back.
- The policy plane is the attacker's real target. Guard the policy repo more strictly than anything it governs, separate it from the governed, and alert on every change to the enforcers.
:::

## Architecture Conversation

**E:** We've got admission policies enforcing signatures and blocking privileged pods. They're solid. I feel good about our posture.

**A:** Where do those policies live?

**E:** In the cluster. We applied them with kubectl when we set things up.

**A:** So they're not in Git, not reviewed, not tested, and to change them someone just... runs kubectl apply?

**E:** ...Anyone with cluster-admin can silently weaken every security control we have, and there'd be no PR, no review, no record beyond an audit log nobody watches. The policies protecting everything are the *least*-protected thing in the platform.

**A:** Now play the attacker. You've compromised a cluster-admin credential. You want to run your malicious image, which our signature policy blocks. What's the *easy* move — forge a signature, or...?

**E:** Or just `kubectl edit` the ClusterPolicy to add my registry to an exemption, or flip it to Audit mode. Why defeat the control when I can edit the control? Forging provenance is hard cryptography; editing a YAML is a Tuesday.

**A:** That's the entire chapter in one sentence: *attackers edit the control, not the artifact*. So what's the architecture?

**E:** Policies go in a repo with the strictest CODEOWNERS we have — security team only, separate from the people whose deploys the policies gate. GitOps deploys them, so in-cluster edits get reverted as drift. Unit tests assert both the denies and the allows. New policies soak in audit mode before enforcing. And we alert on *any* change to a ClusterPolicy or webhook config in-cluster, because a legitimate-looking GitOps policy change is exactly what a compromise looks like — the audit trail shows *what* changed but someone has to be watching *who* changed it and *what it exempted*.

**A:** You just described giving your security policies the same chain of custody this entire book built for application artifacts. That's the insight: the controls deserve the same rigor as the things they control — *more*, because they're the master keys. Which sets up the discipline that ties every chapter together: when you sit down to design or review a platform, how do you reason about all of this *systematically*, instead of hoping you remembered everything? That's threat modeling.
