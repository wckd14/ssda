---
title: CI as a Trust Factory
description: "Your CI system is the most attractive target in your company, and here's the uncomfortable syllogism that proves it: 1."
sidebar:
  label: 5. CI as a Trust Factory
  order: 1
---

> **Chapter 5** · Build Trust

## Why this exists

Your CI system is the most attractive target in your company, and here's the uncomfortable syllogism that proves it:

1. CI executes arbitrary code (that's its job — it runs whatever the repo says).
2. CI holds powerful credentials (to push images, deploy, read secrets).
3. Therefore CI is, by design, a **remote code execution service with production credentials**.

SolarWinds was a build compromise. Codecov was a build compromise. The XZ backdoor lived in build scripts. Attackers figured out years ago that the build is where review has already happened and signing hasn't — the perfect insertion point. The industry's response is to re-architect CI from "a box that runs scripts" into a **trust factory**: a facility whose *output can be believed because the factory's integrity is engineered, not assumed*.

## Mental model

Think of a pharmaceutical cleanroom. The product is trustworthy not because each pill is inspected (you can't inspect compiled code meaningfully) but because the *process* is controlled: sealed environment, verified raw materials, single-batch isolation, documented chain of custody. Build trust is the same: you can't look at a binary and see a backdoor, so the binary's trustworthiness must come entirely from the trustworthiness of its production process.

Four properties define a clean build factory:

1. **Isolation** — one build cannot affect another
2. **Ephemerality** — the environment is born fresh and dies after one build
3. **Hermeticity** — all inputs are declared and verified; nothing undeclared enters
4. **Reproducibility** — the same inputs yield the same output, so anyone can check

## Architecture

**Shared vs. ephemeral runners.** The classic Jenkins model — long-lived worker VMs shared across teams and builds — is a cross-contamination machine. Build A poisons the tool cache, `~/.gradle`, the Docker daemon, or drops a background process; builds B through Z inherit it. Every subsequent "clean" build on that runner is now suspect. The fix is **ephemeral, single-use runners**: a fresh VM or hardened container per build, destroyed on completion. Persistence, the attacker's most valuable asset, is structurally denied. GitHub-hosted runners, GitLab autoscaling runners, and EKS-based systems like Actions Runner Controller all implement this.

**Build isolation layers.** Even with ephemeral runners, ask: isolated from *what*?
- From other builds: separate VM/microVM (Firecracker-class isolation beats shared-kernel containers for hostile-input workloads)
- From the CI control plane: a compromised build should not be able to reach the CI server's admin API
- From the network: see hermeticity
- From credentials it doesn't need: per-job, minimally-scoped, short-lived (Chapter 6)

**Hermetic builds.** A hermetic build declares *all* inputs — source, dependencies, toolchain, base images — pinned by cryptographic digest, and executes with **no general internet access**. Dependencies come from an internal proxy/mirror (Artifactory, Nexus, or a checked-in lockfile with hash verification). Why so strict? Because "the build fetched something from the internet" means "the build's output depends on what the internet felt like serving at that moment" — which is exactly how Codecov's poisoned script and dependency-confusion attacks enter. Bazel is the flagship hermetic build tool; but you can approximate hermeticity in any stack: lockfiles with integrity hashes (`package-lock.json`, `go.sum`, `poetry.lock`), digest-pinned base images (`FROM python@sha256:...`), and egress-restricted runners.

**Reproducible builds.** If building commit `abc123` twice yields bit-identical output, then *anyone can verify the official artifact* by rebuilding and comparing — the ultimate independent check, and the definitive detector for SolarWinds-style injection (the tampered official build won't match the clean rebuild). Full reproducibility is hard (timestamps, build paths, parallelism nondeterminism), but even partial reproducibility plus periodic rebuild-and-compare audits raises the attacker's bar enormously.

**Cache architecture.** Caches are the loophole in ephemerality — state that deliberately survives across builds. A poisoned cache is persistence-as-a-service for attackers: poison one cached layer or dependency archive, and every future build that hits the cache inherits the payload. Rules: scope caches per-repo and per-branch (a PR from a fork must never write a cache that `main` builds read); treat cache restore as untrusted input; verify integrity where possible; prefer content-addressed caches keyed by lockfile hash.

## Threat model & attack stories

**The malicious Maven plugin.** A build engineer adds a useful-looking Maven plugin. Maven plugins execute arbitrary code *inside the build JVM* with the build's full privileges. The plugin waits, then one day rewrites bytecode during the `package` phase — after tests, before signing. SolarWinds, as a service. The same story exists for every ecosystem: npm postinstall scripts, Gradle plugins, Python setup.py, GitHub Actions from the marketplace (`uses: someone/action@v1` — a *mutable tag* pointing at arbitrary code that runs with your secrets in scope). Defense: treat build-time dependencies as *more* dangerous than runtime dependencies, pin actions by full SHA, allowlist marketplace actions, run dependency review on the build toolchain itself.

**Dependency confusion.** Your internal package is `acme-billing-utils` on your private registry. Attacker publishes `acme-billing-utils` v99.0.0 on the public registry. Misconfigured resolvers prefer the higher version from the public source. Attacker code now runs inside your build. (Alex Birsan demonstrated this against Apple, Microsoft, and 30+ others in 2021.) Defense: namespace/scope reservation, resolver configuration that never falls through to public for internal names, hash-verifying lockfiles.

**`pull_request_target` and fork PRs.** CI that runs attacker-submitted code *with secrets in scope* is self-service credential exfiltration. Any workflow triggered by fork PRs must run with zero secrets and read-only tokens.

## Real-world implementations

Google's internal build infrastructure (the inspiration for SLSA — Chapter 23) treats builds as hermetic, reproducible, and executed on infrastructure the developer cannot interactively access; provenance is generated by the platform, not by the build steps. GitHub's approach with Actions emphasizes ephemeral hosted runners plus OIDC-based identity. The common conceptual thread: **the build platform, not the build script, is the trusted component** — because build scripts are attacker-controlled by definition (they live in the repo).

## Common mistakes

- Long-lived runners with Docker socket mounted (`/var/run/docker.sock` in a build container = root on the host = every build on that host is compromised)
- `curl | bash` in pipelines — executing unverified remote code at build time
- Marketplace actions pinned to tags (`@v2`) instead of SHAs
- One giant CI service account whose credentials every job can read
- Caches shared between untrusted (fork PR) and trusted (main) contexts
- Believing "our CI is internal" is isolation — internal means *every engineer's compromised laptop is one hop away*

## Design review questions

- If build #4512 is malicious, what can it do to build #4513? (Correct answer: nothing.)
- What can a build reach on the network? Produce the egress allowlist.
- Show me every credential visible to a standard build job. Which of them are long-lived?
- Could a fork PR ever execute with secrets in scope?
- If your CI admin console credentials leaked tonight, what's the blast radius?

## Implementation examples

- **GitHub Actions**: hosted (ephemeral) runners; ARC on EKS for self-hosted ephemerality; `permissions:` block per-job scoped to least privilege; actions pinned by SHA; environment protection rules for deploy jobs; egress control via runner-level proxy.
- **Jenkins**: dynamic agents via Kubernetes plugin (pod-per-build) instead of static workers; no builds on the controller; Credentials Binding scoped per-folder; JCasC so Jenkins config itself is reviewed code.
- **Hermeticity**: Bazel with pinned toolchains; or lockfile-verified installs (`npm ci`, `pip install --require-hashes`) + digest-pinned `FROM` + NetworkPolicy/egress-proxy allowlisting only the internal artifact mirror.

:::tip[Key Takeaways]

- CI is RCE-with-credentials by design; architect it like the target it is.
- Ephemerality kills persistence; hermeticity kills undeclared inputs; reproducibility enables independent verification.
- Build-time dependencies (plugins, actions, scripts) are the softest entry point in modern platforms.
- Caches are deliberate holes in ephemerality — treat their contents as untrusted input.
:::

## Architecture Conversation

**E:** We moved to ephemeral runners, so builds can't contaminate each other. Are we done?

**A:** Where do your dependencies come from during the build?

**E:** npm, PyPI, Docker Hub. Over the internet.

**A:** So each "isolated" build's inputs are decided at build time by external servers plus your resolver logic. Your builds are isolated from *each other* but wide open to the *world*. Which matters more?

**E:** The world, honestly — that's where dependency confusion and poisoned packages come from. So: lockfiles with hashes, and an internal mirror as the only egress.

**A:** Good. Now the deeper one. Your build produces an image and pushes it. What proves, to anything downstream, that this image came out of *this* clean factory rather than from a developer laptop with the registry credential?

**E:** Nothing, currently. The registry accepts pushes from anyone with the credential.

**A:** So you've built a cleanroom with an unmarked loading dock — pristine products and counterfeits arrive on the same shelf, indistinguishable. The factory's cleanliness is worthless unless the products carry proof of origin. That proof is identity (next chapter) plus provenance (Chapter 8).
