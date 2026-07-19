---
title: Threat Modeling
description: "Every chapter so far handed you controls."
sidebar:
  label: 20. Threat Modeling
  order: 3
---

> **Chapter 20** · Platform Security

## Why this exists

Every chapter so far handed you controls. But controls are answers, and this chapter is about the *questions* — because a platform engineer's real job isn't knowing that admission controllers exist; it's being able to look at an unfamiliar architecture and *systematically discover* where trust is misplaced. Threat modeling is that skill, made into a repeatable method. Without it, you secure what you happen to think of and miss what you don't. With it, you have a discipline that surfaces the gaps *before* an attacker does — and, crucially, before you've written a line of the platform.

## Mental model

Threat modeling is answering four questions, in order, honestly:

1. **What are we building?** (You can't secure what you can't diagram.)
2. **What can go wrong?** (Where's the trust misplaced?)
3. **What are we going to do about it?** (Controls, prioritized by risk.)
4. **Did we do a good job?** (Validation, iteration.)

That's Adam Shostack's framing, and it's better than any acronym because it's just *structured honesty about your own system*. The methodologies (STRIDE, attack trees, etc.) are tools that serve those four questions — never substitutes for them.

## Architecture: a threat modeling methodology for delivery platforms

This book's chain of custody *is* a threat model skeleton. Here's the repeatable method, mapped to the pipeline:

```
   Assets  ──►  Threat Actors  ──►  Trust Boundaries  ──►  Attack Paths  ──►  Controls  ──►  Residual Risk
   (what's     (who wants it,      (where trust        (how they get      (what stops    (what's left,
    worth       what can they      changes — every     from actor to      each path)     accepted by
    stealing)   reach)             arrow in Ch.2)      asset)                            whom)
```

**Step 1 — Assets.** What is worth attacking? For a delivery platform: the ability to run arbitrary code in production (the master asset — almost every attack wants this), signing keys, production data, cloud control-plane access, customer secrets, the CI/CD system itself. Name them explicitly; unnamed assets go unprotected.

**Step 2 — Threat actors.** Who, with what capability and access? External attacker (starts outside, no credentials). Malicious insider (starts with legitimate access — the actor most security theater ignores). Compromised insider (external attacker wearing a legitimate credential — the *most common* real scenario, and the reason "trusted employee" is a dangerous phrase). Supply-chain actor (compromises a dependency you trust). Model each realistically: what does each *start* with, and what's their goal? The compromised-insider actor is the one that justifies most of this book — because "identity + verification at every boundary" is precisely the defense against an attacker who holds valid credentials.

**Step 3 — Trust boundaries.** This is where delivery-platform threat modeling gets its power: **every arrow in the Chapter 2 chain of custody is a trust boundary**, and each is a place to interrogate. Developer→Git, Git→CI, CI→Registry, Registry→Cluster, Cluster→Workload. At each: what crosses it, what's assumed trustworthy, and *what would it take to violate that assumption?* The boundaries are pre-drawn for you — that's the gift of having a mental model.

**Step 4 — Attack paths.** Chain the actor to the asset across the boundaries. This is where **attack trees** shine: put the goal at the root, enumerate the ways to achieve it, recurse.

```
GOAL: run malicious code in production
├── compromise the source (get bad code into Git)
│   ├── steal developer credential ──► push (blocked by: branch protection, signed commits)
│   ├── malicious PR passes review  ──► merge (blocked by: CODEOWNERS, review quality)
│   └── poison a dependency          ──► pulled into build (blocked by: pinning, SBOM)
├── compromise the build (inject during build)
│   ├── malicious build plugin/action (blocked by: pinning, hermetic build)
│   └── compromise runner            ──► persist (blocked by: ephemeral runners)
├── compromise the artifact (substitute the image)
│   ├── steal registry credential    ──► push (blocked by: signature verification at admission)
│   └── move a mutable tag           ──► deploy (blocked by: digest pinning)
├── compromise deployment
│   └── modify manifests / abuse deploy creds (blocked by: GitOps review, admission)
└── compromise runtime
    └── exec / exploit app (blocked by: RBAC, immutability, runtime detection)
```

Read that tree and notice: **each leaf names the control that blocks it, and each control is a chapter.** The whole book is one attack tree, defended. This is the payoff of the chain-of-custody model — threat modeling a delivery platform becomes "walk the tree, verify each leaf has a live control, find the leaves that don't."

**Step 5 — Controls.** For each viable path, what control breaks it? And — the mature addition — *at which boundary*, and does the control cost (latency, friction, availability risk) justify the risk it removes? Not every leaf needs a control; some risks are cheaper to accept than to close (Step 6).

**Step 6 — Residual risk.** The step that separates engineers from theater. No system is fully secured; after controls, what remains? Who *accepted* that residual risk, and do they have the authority to? "We accept that a compromise of our OIDC issuer forges identities, because the issuer is a hardened, monitored, transparency-logged system and the alternative costs more than the risk" is a *legitimate* engineering decision — *if made explicitly by someone accountable*. Unnamed residual risk isn't accepted; it's just hidden.

**When to threat model.** Not once, at the end (that's an audit). Threat model *at design time* (cheapest to fix), *at significant change* (new trust boundary = re-model), and *periodically* (the system and the threat landscape both drift). A threat model is a living document, versioned like everything else in this book.

## STRIDE as a boundary-interrogation checklist

At each trust boundary, STRIDE gives you six questions so you don't miss a category:

- **S**poofing — can an actor fake an identity here? (→ authentication: signed commits, OIDC, SVIDs)
- **T**ampering — can data be modified in transit/at rest? (→ integrity: digests, signatures)
- **R**epudiation — can an actor deny an action? (→ audit: transparency logs, Git history)
- **I**nformation disclosure — can secrets leak? (→ confidentiality: secrets architecture, encryption)
- **D**enial of service — can availability be attacked? (→ the admission `failurePolicy` trade, HA)
- **E**levation of privilege — can an actor gain more than granted? (→ least privilege, authz)

STRIDE isn't the model; it's a *completeness check* run at each boundary so your honesty in Step 4 doesn't have blind spots.

## Common mistakes

- Threat modeling as a one-time audit document that's stale before it's filed
- Modeling only the external attacker, ignoring compromised-insider (the common case)
- Enumerating controls without enumerating *attack paths* (a list of good practices isn't a threat model — it's a wish list)
- No residual-risk step, so risks are silently un-owned
- Modeling the happy path only; missing break-glass, admin paths, and the control-plane-of-the-control (the policy repo, the OIDC issuer, the vault's auth)
- Confusing STRIDE-per-element with actually chaining attacks — categories without paths miss the multi-step reality

## Design review questions

- Can you produce a current data-flow diagram of your platform with trust boundaries marked? (If not, you can't threat model it — start there.)
- For your top asset ("run code in prod"), walk me an attack tree. Which leaves have a live, enforced control? Which are bare?
- Which threat actor does each of your major controls actually defend against? Are you defending against compromised-insider, or only external?
- What's your top residual risk, who accepted it, and when was that decision last revisited?
- When did you last threat model — and was it before or after you built the thing?

## Implementation examples

Shostack's four-question frame as the backbone; STRIDE-per-boundary as the completeness checklist; attack trees for the "how do they reach the asset" enumeration; lightweight tooling (OWASP Threat Dragon, or just diagrams-as-code in the repo) so the model is versioned and reviewable like everything else; for supply-chain specifically, map your model against SLSA threats and the CNCF supply-chain security whitepaper's threat catalog (Chapter 23) so you're not re-deriving known attack classes from scratch.

:::tip[Key Takeaways]

- Threat modeling is structured honesty: what are we building, what goes wrong, what do we do, did we do it well.
- For delivery platforms, the chain of custody hands you the boundaries and the attack tree for free — walk it, and verify each leaf has a live control.
- Model the compromised-insider, not just the external attacker; it's the common case and the reason the whole architecture exists.
- Name your residual risk and its owner. Unowned risk is hidden risk, not accepted risk.
- Model at design time and on every boundary change — it's a living artifact, not an audit.
:::

## Architecture Conversation

**E:** Threat modeling always felt like a compliance ritual — fill in the STRIDE spreadsheet, file it, never look again. How is this different?

**A:** Because you're going to do it *before* you build, on a whiteboard, in an hour, and it's going to change your design. Try it now. New service: a webhook receiver that takes GitHub events and triggers deploys. Asset?

**E:** The ability to trigger deploys — so, effectively, run code in production. High-value.

**A:** Actor and first attack path?

**E:** External attacker. First path: forge a webhook call to trigger a malicious deploy. So... spoofing at the boundary — I need to verify the webhook signature. And even then, tampering — the payload could be manipulated, so the deploy target must come from *verified* content, not the payload's claims.

**A:** Good — you found two controls by walking one path, before writing any code. Keep going: the webhook receiver holds a credential to trigger deploys. Elevation path?

**E:** If the receiver is compromised, the attacker inherits deploy rights. So the receiver shouldn't *hold* deploy rights — it should open a PR to the GitOps repo (Chapter 12), which still faces review and admission. Its credential should be Git-write, not deploy. The blast radius of compromising the receiver drops from "deploy anything" to "propose a change that gets reviewed."

**A:** You just re-derived the entire book's architecture *from a threat model of one component*, in four minutes, without me naming a single control. That's the point: the controls aren't things to memorize — they're what *falls out* when you walk assets → actors → boundaries → paths honestly. Threat modeling isn't the ritual. It's the *generator* of the architecture. Now — the chapter that assembles every generated control into one coherent platform.
