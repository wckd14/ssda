---
title: GitOps
description: "GitOps as an architecture, not just a tool: Git as the reviewable source of truth for production, pull-based reconciliation, drift control, and build/deploy separation of duties."
sidebar:
  label: 12. GitOps
  order: 1
---

> **Chapter 12** · Deployment Trust

## Why this exists

Ask a traditional pipeline: "what is running in production right now, and who decided that?" The honest answer: "whatever the last successful deploy job pushed, decided by whoever ran it, minus whatever anyone has `kubectl edit`-ed since." Production state is the accumulated residue of imperative actions — unrecorded, unreviewable, unreconstructable. GitOps exists to replace that residue with a single, reviewable, versioned statement of truth.

This chapter is deliberately not about [ArgoCD](https://argo-cd.readthedocs.io/). ArgoCD is one implementation. GitOps is an *architecture* with four load-bearing ideas, each answering a question.

## Mental model

Traditional CD is **push**: the pipeline reaches into the cluster and performs surgery. GitOps is **pull with reconciliation**: the cluster runs an agent that continuously compares *desired state* (Git) against *actual state* (cluster) and converges them.

Think of it as a **thermostat, not a fireplace-lighter**. You don't issue "light the fire" commands; you declare "21°C" and a control loop holds reality to the declaration — including *undoing* deviations you never commanded.

## The four questions

**Why Git?** Because Git already *is* the best change-control system your organization operates: every change is attributed, reviewed (branch protection — all of Chapter 3 now protects *production state*, not just code), diffable, and revertible. Declaring "production = contents of this repo at HEAD of main" imports two decades of source-control discipline into operations for free. Your production change process becomes a *pull request* — with CODEOWNERS on the manifests, required approvals, and an audit log you didn't have to build.

**Why reconciliation?** Because point-in-time deployment can't answer "and *then* what?" A push pipeline exits after `kubectl apply`; whatever happens next — manual edits, a controller fight, an attacker's modification — persists. A reconciler makes deviation *temporary by construction*: drift is detected on the next loop and either reverted or alarmed. Security framing: reconciliation converts a whole class of attacks from "persistent, silent" to "reverted in minutes and logged as drift." An attacker who `kubectl edit`s a deployment to inject a sidecar watches the reconciler calmly delete their work. To persist, they must compromise *Git* — which is exactly where your strongest review controls live. GitOps *herds attackers toward your most defended boundary*.

**Why immutable state?** The Git history of the deployment repo is production's flight recorder: every state production has ever been in, who approved the transition, and when. Rollback = revert commit (restoring a previous *digest-pinned* state — Chapter 7's discipline compounding). Incident forensics = `git log`. Compliance = the repo *is* the change-management record.

**Why shouldn't CI deploy?** The sharpest question, and the one that separates GitOps-as-architecture from GitOps-as-tooling-fashion:

```
Push model:                          Pull model:
CI holds cluster-admin creds         CI holds... a Git write credential
   │                                    │ (opens a PR to the deploy repo)
   ▼                                    ▼
compromised CI = cluster-admin       reconciler (in-cluster) pulls Git
                                     compromised CI = can *propose* changes
                                       that still face review + admission
```

Separating *build* authority from *deploy* authority is separation of duties, mechanized. CI's job ends at "artifact + evidence exist"; the deployment repo decides *what* runs; the reconciler executes; admission verifies. Four parties, four compromises needed. Also: no inbound cluster access for deploys — the agent pulls — which removes the pile of kubeconfigs-in-CI that every pentest report features.

## Architecture

The mature topology (note the two-repo pattern from Chapter 4):

```
app repo ──CI──► image@digest + attestations ──► registry
                                                     │
deploy repo (manifests/Helm/Kustomize, digest-pinned)│
    ▲  PR: bump payments to @sha256:9f8e...          │
    │  (opened by CI or image-automation bot,        │
    │   approved per CODEOWNERS)                     │
    └──── reconciler (Argo CD / Flux) pulls ◄────────┘
              │ applies desired state
              ▼
          cluster ──► admission verifies evidence (Ch. 14)
```

Design decisions that matter: separate deploy repo with *different* (usually stricter) owners than app repos; environments as directories/branches with promotion-by-PR; reconciler service account scoped per-namespace or per-tenant, not cluster-admin everywhere (the reconciler is now your most powerful in-cluster identity — see threat model); auto-sync + self-heal on (drift reversion) with alerts on drift *events* (reverted drift is still an indicator of compromise or confusion — investigate it, don't just celebrate the revert).

## Threat model & compromise scenarios

- **Compromised CI**: can open PRs to the deploy repo — loud, reviewable, and the artifact it references still needs valid attestations. Blast radius collapsed from "cluster-admin" to "can propose."
- **Compromised deploy repo**: *this is now production access.* Everything from Chapter 3 — branch protection applied to admins, CODEOWNERS, signed commits — is no longer about code quality; it's the production perimeter. Deploy repos deserve your strictest Git posture. And the residual backstop is admission: even a merged malicious manifest must reference an image that passes verification.
- **Compromised reconciler**: holds the credentials to apply anything it's scoped to. Mitigations: least-privilege per project/namespace, no cluster-admin god-mode instance shared by all tenants, its own admission constraints, and treating the reconciler's config (Applications/Kustomizations) as governed artifacts themselves.
- **Manifest-level attacks**: GitOps verifies *where manifests come from*, not *what they say* — a reviewed-and-merged manifest can still mount host paths or run privileged. Manifest security is admission policy's job (Chapter 14); GitOps and admission are complements, not substitutes.

## Common mistakes

- "GitOps" where CI still runs `kubectl apply` with the reconciler as decoration
- Deploy repo protected more weakly than app repos (exactly backwards)
- Mutable tags in manifests, delegating "what actually runs" back to the registry (Chapter 7's attack, reborn)
- One cluster-admin ArgoCD for 40 teams — a freshly built single point of trust
- Auto-sync off "so we control timing" — leaving the drift window permanently open
- Ignoring drift alerts because self-heal fixed it (self-heal fixed the *symptom*)

## Design review questions

- Can anything reach production without a commit to the deploy repo? List every path, including break-glass.
- Who can merge to the deploy repo's main? Is that list shorter or longer than "who could kubectl-apply before"?
- What is the reconciler's exact RBAC? Who reviews changes to *its* configuration?
- When drift is detected and reverted, who is paged?

## Implementation examples

Argo CD: Projects for tenant isolation, AppProject-scoped RBAC, sync windows for change freezes, resource hooks for ordering; [Flux](https://fluxcd.io/): Kustomization/HelmRelease CRs, image automation writing digests, multi-tenancy via namespaced controllers; both: SSO + audit, notifications on drift events, digest-pinning via image-update automation rather than humans copying SHAs.

:::tip[Key Takeaways]

- GitOps = desired state in Git + continuous reconciliation; the value is architectural, not tool-shaped.
- Reconciliation makes unauthorized change temporary and loud; attackers are herded toward Git, your best-defended boundary.
- Splitting build authority (CI) from deploy authority (deploy repo + reconciler) is mechanized separation of duties.
- The deploy repo is production. Protect it like production. The reconciler is a crown jewel. Scope it like one.
:::

## Architecture Conversation

**E:** We adopted ArgoCD, so we're GitOps now. CI builds, then calls the Argo API to sync the app. Clean, right?

**A:** What credential does CI hold to make that call?

**E:** An Argo API token with sync rights... which, if Argo's RBAC is broad, is effectively deploy rights. So we rebuilt push-model CD with extra steps — CI still holds a production-shaped credential.

**A:** What's the pull-model version?

**E:** CI's last act is a PR to the deploy repo bumping the digest. Argo watches the repo and syncs on merge. CI's only credential is Git-write, and the change faces review and admission before it's real.

**A:** Good. Now the question everyone skips: you've made Git the single source of truth for production. Finish the sentence — "therefore Git compromise is..."

**E:** ...production compromise. We concentrated the risk deliberately, betting that one heavily-defended boundary beats twenty weakly-defended ones. Which means the deploy repo needs our absolute strictest controls, and admission as the independent backstop behind it.

**A:** That's the honest statement of the GitOps trade, and almost nobody says it out loud. Concentration of trust is fine — *unexamined* concentration is how platforms die. Next: who decides a change is *allowed* to happen at all.
