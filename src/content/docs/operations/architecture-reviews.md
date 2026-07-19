---
title: Architecture Reviews
description: "This is the chapter the whole book was training you for."
sidebar:
  label: 24. Architecture Reviews
  order: 3
---

> **Chapter 24** · Operations

## Why this exists

This is the chapter the whole book was training you for. Knowing the controls makes you a good implementer. Being able to sit in front of an *unfamiliar* platform — one you didn't build, whose documentation is out of date, whose engineers are (reasonably) defensive — and *find where the trust is misplaced in an hour* makes you an architect. Architecture review is the applied form of everything: threat modeling (Chapter 20) turned into a live conversation, the chain of custody (Chapter 2) turned into a checklist, and the habit — the one the source material most wanted this book to instill — of *questioning trust assumptions until the architecture becomes resilient.*

## Mental model

An architecture review is not an audit (checking boxes against a standard) and not an interrogation (proving people wrong). It's **collaborative trust-archaeology**: you and the team dig, together, for the assumptions the platform rests on that nobody has said out loud — and then you test whether those assumptions survive an adversary. The best reviews feel less like a test and more like the moment in a good pairing session where both people suddenly *see* the load-bearing assumption at once. Your job is to make the implicit explicit, then ask "what if that's not true?"

The single most powerful move in a review is the recurring question of this entire book:

> **"Why should X trust Y?"**

Applied at every arrow in the chain of custody, that question surfaces almost every real weakness. The runner-up move is: **"what happens if Z is compromised?"** — which finds the missing backstops.

## Architecture: how to run the review

**Before: get the diagram (or build it).** You cannot review what you can't see. If they have a current data-flow diagram with trust boundaries, start there. If they don't (common), your first hour is *building one with them* — and that act alone surfaces issues ("wait, how does the deploy repo actually get updated?" "...huh, I'm not sure"). No diagram is itself a finding.

**During: walk the chain, arrow by arrow.** Use Chapter 2's chain as your route. At each boundary, ask the three questions (identity / evidence / verification) and the two power questions ("why should X trust Y?", "what if X is compromised?"). Don't let the conversation jump to the fun parts (everyone wants to talk about their cool signing setup); walk it *in order*, because gaps hide in the boring boundaries.

**The canonical question set — organized by the source material's examples, which are the sharpest ones:**

*Source trust:*
- "What happens if Git is compromised? Walk me through what an attacker with an admin token can do — and what, if anything, downstream would catch it." (Finds: over-trust in Git, missing admission backstop.)
- "Who can get a change into production-affecting main with zero other-person involvement?" (Finds: the honest answer, usually "all admins + anyone who edits CODEOWNERS.")
- "Who reviews changes to your CI workflows? To CODEOWNERS itself?" (Finds: the control-plane-of-the-control gap.)

*Build trust:*
- "What happens if Jenkins/your CI is compromised?" (Finds: the blast radius — often "cluster-admin," which should horrify.)
- "If build #4512 is malicious, what can it do to build #4513?" (Finds: shared-runner persistence.)
- "Can your build steps forge their own provenance?" (Finds: SLSA L1/L2 masquerading as L3.)

*The deployment trust question the book keeps returning to:*
- **"Why should Kubernetes trust Jenkins?"** — the crown-jewel question. It forces the team to articulate what, mechanically, makes the cluster believe an artifact. If the answer is "it's in our registry" or "CI has the deploy credential," you've found that the entire left side of their pipeline is *assumed*, not *verified* — there's no admission-time evidence check. This one question often reframes an entire platform.

*Artifact/deployment trust:*
- "Point at a running pod — trace it to one commit. How long does that take?" (Finds: broken or absent chain of custody, mutable tags.)
- "Who owns deployment authority? Can the person who authors a change also independently ship it?" (Finds: separation-of-duties violations.)
- "What happens to your cluster when the admission webhook is down?" (Finds: `failurePolicy: Ignore` — the off-switch.)

*The meta-question that finds the soft center:*
- "Where's the one place a single compromise runs your code in prod with nothing downstream noticing?" (Finds: the control plane — policy repo, OIDC issuer, signing root, reconciler config. There's always one; a team that can't name theirs hasn't threat-modeled.)

**After: findings as trust-assumption failures, ranked by blast radius.** Don't deliver a checklist of "you're missing tool X." Deliver: "here are the trust assumptions your platform rests on that don't survive an adversary, ranked by what an attacker gets when each fails." Frame every finding as *a misplaced trust*, not *a missing product* — because that's what teaches the team to keep finding them after you leave. The goal of a review is not to fix this platform; it's to *transmit the habit* so the team fixes the next hundred issues themselves.

## The habit this book is really about

Notice that every Architecture Conversation in this book has been an architecture review in miniature — the senior architect never *told* the engineer the answer; they asked "why should X trust Y?" until the engineer *found* it. That's deliberate. Facts you can look up; the *habit of interrogating trust* is what makes an architect, and it can only be practiced, not memorized. The habit is: never accept "it's fine because it's internal / private / signed / reviewed" without asking *what specifically enforces that, and what happens when that enforcement fails.* Apply it relentlessly, kindly, and to your own systems most of all.

## Common mistakes (in conducting reviews)

- Reviewing as audit (checkbox against a standard) instead of as trust-archaeology (finding the load-bearing assumptions)
- Letting the team steer you to their strengths; skipping the boring boundaries where gaps hide
- Delivering "you need tool X" findings instead of "you trust Y without verifying it" findings — the former gets a tool bought, the latter teaches the habit
- Reviewing without a diagram (you'll miss what isn't drawn)
- Gotcha energy — making the team defensive kills the collaborative digging that finds real issues
- Reviewing the happy path only; not asking about break-glass, admin paths, and control planes
- One-and-done reviews; not establishing review as a *recurring* practice at every significant change

## Design review questions (the review-of-reviews)

- Do you review your platform's architecture *at design time and on trust-boundary changes*, or only after incidents?
- When you review, do you produce trust-assumption findings or shopping lists?
- Can your team, unprompted, name their platform's soft center? (If not, that's the first thing to fix — not by fixing the soft center, but by teaching them to find it.)
- Is the *habit* — "why should X trust Y?" — present in how your engineers discuss designs day to day, or only in formal reviews?

:::tip[Key Takeaways]

- Architecture review is applied threat modeling: walk the chain of custody arrow by arrow, asking "why should X trust Y?" and "what if X is compromised?" at each.
- The most powerful single question — "why should Kubernetes trust Jenkins?" — surfaces whether the pipeline's left side is verified or merely assumed.
- Frame findings as misplaced-trust, not missing-tools; the goal is to transmit the *habit*, not just fix one platform.
- Every platform has a soft center (a control plane whose single compromise wins); finding yours is the job, and a team that can't name theirs hasn't done the work.
- The habit — relentless, kind interrogation of trust assumptions until the architecture becomes resilient — is what this entire book exists to instill.
:::

## Architecture Conversation (the last one)

**E:** We've reached the end. Give me one more review — but this time, review *me*. How do I know if I've actually learned to think like an architect, versus just memorized twenty-four chapters of controls?

**A:** Fair. I'll give you a platform in three sentences and you tell me what you ask first. A fintech runs GitHub with branch protection, Jenkins on static EC2 runners building images, pushing to ECR by mutable tag, deployed by a Jenkins job running `kubectl apply` with a cluster-admin kubeconfig. Go.

**E:** First question isn't about any tool — it's "why should the cluster trust Jenkins?" And I already suspect the answer: it doesn't verify anything; it runs whatever Jenkins applies, with cluster-admin. So Jenkins compromise equals total cluster compromise, and Jenkins is on *static* runners — meaning one poisoned build persists to the next. Mutable tags mean anyone with ECR push can silently swap production images with no Git change. There's no admission gate, so there's no backstop for any of it. The soft center is Jenkins itself: compromise it and you have persistence, artifact-substitution, and cluster-admin, with nothing downstream noticing.

**A:** And how do you deliver that?

**E:** Not as "buy Sigstore and Kyverno." As: "your platform trusts Jenkins completely and verifies it nowhere — here's what an attacker gets when Jenkins falls, which is everything, silently. The highest-leverage change is to make the cluster *verify* what it runs instead of *trusting* who hands it over." Then the specific controls — ephemeral runners, digest-pinning, provenance, admission verification — follow from the trust gap, not from a product catalog.

**A:** You reached for the trust question before the tool question, traced the blast radius, found the soft center, and framed the fix as relocating trust rather than buying software. That's it. That's the whole thing. You didn't memorize the controls — you can *regenerate* them from first principles by asking where trust is misplaced. Tools will change; that question won't. Go review real platforms, be kind while you do it, and turn every engineer you talk to into someone who asks it too.

**E:** One last thing — why did you never just *tell* me the answers, this whole time?

**A:** Because an answer I give you protects one platform. A question you can't stop asking protects every platform you ever touch. That was always the point.
