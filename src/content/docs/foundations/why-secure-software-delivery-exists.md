---
title: Why Secure Software Delivery Exists
description: "Why perimeter security — firewalls, VPNs, WAFs — no longer suffices, and how SolarWinds, Codecov, Log4Shell, and XZ Utils made securing the software supply chain essential."
sidebar:
  label: 1. Why Secure Software Delivery Exists
  order: 1
---

> **Chapter 1** · Foundations

## Why this exists

For twenty years, security teams protected the *perimeter*: firewalls, VPNs, WAFs, endpoint agents. The application inside was assumed trustworthy because *we built it*.

That assumption died in a series of very public funerals:

**SolarWinds (2020).** Attackers didn't hack SolarWinds' customers. They hacked SolarWinds' *build system*. Malicious code (SUNBURST) was injected during compilation — after code review, before signing. The build output was signed with SolarWinds' legitimate certificate and shipped to ~18,000 customers, including US federal agencies. Every perimeter defense on Earth waved it through, because it arrived as a *trusted, signed update from a trusted vendor*.

> The lesson: **a signature proves who signed, not what was reviewed.** If the thing between review and signing (the build) is compromised, signing launders the attack.

**Codecov (2021).** A single leaked credential in a Docker image let attackers modify Codecov's Bash Uploader script — a script thousands of CI pipelines `curl | bash`-ed on every build. For months, the modified script exfiltrated environment variables from customer CI systems: cloud keys, tokens, signing secrets. The blast radius wasn't Codecov; it was *everyone whose pipeline trusted Codecov*.

> The lesson: **your CI pipeline's trust boundary includes every script it downloads.** Dependencies aren't just libraries — they're anything that executes.

**Log4Shell (2021).** Not an attack on the supply chain — a demonstration that nobody knew *what was in their supply chain*. When CVE-2021-44228 dropped, the hard part wasn't patching Log4j. It was answering "which of our 4,000 services contain Log4j, at which version, including transitively, including shaded jars?" Most organizations took *weeks* to answer. That gap is the entire justification for SBOMs (Chapter 9).

**XZ Utils (2024).** The most patient attack ever documented. A persona ("Jia Tan") spent *two years* building trust as an open-source maintainer of a compression library, then inserted a backdoor targeting SSH — hidden in build scripts and binary test files, invisible in the source tree. It was caught by luck: a Microsoft engineer noticed SSH logins were 500ms slower. 

> The lesson: **the trust model of open source is a maintainer's reputation, and reputation can be manufactured.** Also: attacks increasingly hide in the *build*, not the source, because everyone reviews source and nobody reviews builds.

## Why DevOps wasn't enough

DevOps solved a *velocity* problem: it collapsed the wall between development and operations so software could ship daily instead of quarterly. But velocity multiplied the attack surface:

- More deployments → more automation → more credentials in more places
- More automation → machines making decisions humans used to make
- More dependencies → more third-party code executing in your pipelines
- Faster shipping → less time for a human to notice anything wrong

DevOps built a superhighway from a developer's laptop to production. Nobody put checkpoints on it.

## Why "DevSecOps" became a buzzword

The industry's first answer was to bolt scanners onto pipelines and call it DevSecOps. It became a buzzword because most implementations were *scanning without architecture*:

- SAST results that nobody triaged, dumped into a dashboard
- Container scans that ran *after* the image was already deployed
- Security "gates" that could be bypassed by anyone with pipeline edit access
- No answer to the question: "even if every scan passed, why do we believe *this artifact* is the one that was scanned?"

Scanning tells you an artifact has no *known* vulnerabilities. It says nothing about whether the artifact is the one you intended to build, built from the code you reviewed, by a builder you trust. That is a *trust* question, not a scanning question — and it required a new discipline.

## Why identity became the new perimeter

In a modern platform, the perimeter question — "is this request coming from inside the network?" — is meaningless. Builds run on ephemeral cloud runners. Deployments happen from SaaS. Workloads talk across clusters and clouds. The only durable question is:

> **Who are you, can you prove it, and what evidence do you carry?**

Identity (of developers, of builds, of workloads) plus evidence (signatures, provenance, attestations) plus verification at every boundary — that's the architecture the rest of this book builds.

:::tip[Key Takeaways]

- Supply chain attacks compromise the *factory*, not the product — so product-level defenses can't see them.
- A signature proves origin, not integrity of intent. Signing a compromised build launders the compromise.
- DevOps created a high-speed path to production; SSDLC architecture is the discipline of putting verifiable checkpoints on that path.
- The perimeter is dead. Identity + evidence + verification is the replacement.
:::

## Architecture Conversation

**E:** We already do code review, SAST, and container scanning. Aren't we covered?

**A:** Walk me through SolarWinds with your controls. Their code was reviewed. Their builds were scanned. Where in your pipeline would SUNBURST have been caught?

**E:** ...The malicious code was injected *during* the build. Our scanners run on the source and on the final image, but if the build itself injects code, the source scan sees clean source and the image scan sees code with no known CVEs — it was novel malware.

**A:** Right. So what were you actually trusting, without realizing it?

**E:** The build machine. We assumed the output of the build equals the compilation of the input.

**A:** That assumption is the single biggest unexamined trust in most platforms. This book exists to make every assumption like that one explicit, and then either verify it or reduce the damage when it fails. Next question: when your cluster pulls an image, how does it know that image came from *your* CI at all?

**E:** ...It doesn't. It trusts whatever's in the registry.

**A:** Hold that thought until Chapter 14.
