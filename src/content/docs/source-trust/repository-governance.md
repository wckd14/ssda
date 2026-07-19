---
title: Repository Governance
description: "The governance behind branch protection: who owns what, who may approve changes, and how CODEOWNERS and clear ownership turn Git rules into real source trust."
sidebar:
  label: 4. Repository Governance
  order: 2
---

> **Chapter 4** · Source Trust

## Why this exists

Chapter 3 covered the mechanics of protecting a repository. This chapter covers the *organizational* question those mechanics depend on: **who owns what, and why does ownership create trust?** Every branch protection rule is only as meaningful as the answer to "who is allowed to approve this?" — and that's a governance decision, not a Git setting.

## Mental model

Think of your organization's repositories as a **city zoning map**. Residential code (app logic) has one set of rules. Industrial zones (pipelines, base images) have stricter rules. Critical infrastructure (Terraform for the production account, cluster manifests, policy definitions) has the strictest. Governance is drawing the zones deliberately instead of letting them emerge by accident.

## Architecture

**The four ownership domains** in a typical platform:

| Domain | Contents | Owner | Why |
|---|---|---|---|
| Application | Service code, unit tests | Service teams | They have the context; velocity matters |
| Delivery | Dockerfiles, CI workflows, Helm charts | Platform team (+ service team) | These define *how* code becomes production; compromise affects everyone |
| Infrastructure | Terraform, cluster config, networking | Infra team | Blast radius is the account/cluster, not the service |
| Policy | Admission policies, security baselines, CODEOWNERS templates | Security/platform | These are the rules everything else is checked against |

**Golden paths over gatekeeping.** Mature organizations don't make platform teams approve every Dockerfile — that doesn't scale and breeds resentment. Instead: platform owns *templates* (base images, reusable workflows, Helm library charts), service teams *instantiate* them, and deviation from the template is what triggers heavyweight review. Trust flows from the template: if 200 services use the platform-owned build workflow, reviewing that one workflow secures 200 pipelines.

**Repository topology.** Monorepo vs. polyrepo is usually debated as a productivity question; it's also a trust question:
- **Monorepo**: one set of protections to get right, uniform tooling, CODEOWNERS does heavy lifting; but one compromised admin affects everything, and path-based permission granularity is limited on most platforms.
- **Polyrepo**: natural blast-radius segmentation, per-repo access control; but N repos means N chances to misconfigure protection, and config *drifts*. Mature polyrepo orgs manage repo settings *as code* (Terraform `github_repository` resources, or tools like Peribolos) so protection is auditable and drift-corrected — governance applied with the same rigor as infrastructure.

**Separation between app repos and deployment repos.** A recurring mature pattern: application code and deployment manifests live in *different repositories with different owners*. Write access to app code ≠ ability to change what runs in production. This becomes central in Chapter 12 (GitOps).

## Threat model

The governance-layer attacks aren't code injections — they're *permission drift*:
- A team lead adds a contractor to a team that transitively grants write on infra repos
- A repo is created outside the template with no protection, later becomes load-bearing
- An org-level default ("all members get write on new repos") silently applies to a new critical repo
- The GitHub App installed "for the wiki bot" has `contents: write` on everything

Compromise scenario: none of these is an incident on day one. Each is a landmine that turns a minor credential theft into a major breach eighteen months later. Governance is the discipline of sweeping for landmines continuously — access reviews, settings-as-code, org audit log monitoring.

## Common mistakes

- Ownership by inertia: whoever created the repo three years ago is still "the owner," and they left
- Everyone-is-admin startups that never revisit it at 200 engineers
- Governing repos but not org settings, GitHub Apps, or OAuth grants (the modern equivalents of "we locked the door but the windows are open")
- Treating governance as a spreadsheet instead of code

## Design review questions

- For each of the four domains, name the owning team. If any answer is "well, sort of...", that's a finding.
- How is a new repository created, and what protections does it get by default?
- When did you last review third-party app installations and their scopes?
- Can you produce, from code, the intended protection state of every repo — and detect drift from it?

:::tip[Key Takeaways]

- Ownership is an access-control primitive; draw the zones deliberately.
- Secure the templates and golden paths; leverage beats gatekeeping.
- Manage repo/org settings as code — governance that isn't auditable decays.
- Most governance failures are drift, not decisions.
:::

## Architecture Conversation

**E:** Governance feels like bureaucracy. We're 60 engineers; everyone having broad access keeps us fast.

**A:** I won't argue — at 60 people, broad access might be a rational trade. But answer this: what's your plan for *knowing when the trade stops being rational*?

**E:** ...I don't have one. It'll just quietly stay this way until an incident.

**A:** That's the real failure mode — not the openness, the absence of a decision point. Here's a cheap discipline: manage repo settings and team membership in Terraform *now*, even if the settings are permissive. Then tightening later is a PR, not an archaeology project. What's the one repo where you'd tighten today, even at 60 people?

**E:** The Terraform repo for our AWS org. And honestly, the repo holding our reusable CI workflows — everything builds through it.

**A:** So you do have zones; you just hadn't drawn them. Governance isn't bureaucracy — it's writing down the trust decisions you're already making implicitly, so they can be reviewed like any other architecture.
