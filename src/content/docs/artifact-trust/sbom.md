---
title: SBOM
description: "On December 9, 2021, every security team on Earth was asked one question: 'Do we run Log4j?' The organizations that suffered weren't the ones with the"
sidebar:
  label: 9. SBOM
  order: 3
---

> **Chapter 9** · Artifact Trust

## Why this exists

On December 9, 2021, every security team on Earth was asked one question: **"Do we run Log4j?"** The organizations that suffered weren't the ones with the most Log4j — they were the ones who *couldn't answer the question*. Vulnerable-and-knowing beats vulnerable-and-blind by weeks of exposure. The Software Bill of Materials exists to make that question answerable in minutes, by query, forever.

## Mental model

An SBOM is the **ingredients label** on packaged food. It doesn't make the food safe; it makes the food *legible* — so when the recall notice says "contaminated peanuts, lot #47," you check labels instead of lab-testing your entire pantry. Extending honestly: like ingredient labels, SBOMs are only as good as the *process that generates them* (self-reported labels miss things), and only useful if someone *reads them when the recall hits* (an SBOM in a bucket no one queries is compliance theater).

## Architecture

**The layered inventory.** "The SBOM" is really several nested inventories, produced at different stages by different tools that see different things:

| Layer | Contents | Best produced | Visibility |
|---|---|---|---|
| Application SBOM | Direct + transitive language deps (from lockfiles/build graph) | At build, from the build tool | Sees exact resolved versions; misses OS packages |
| Container SBOM | OS packages (apk/deb/rpm) + app layer + stray binaries | At image assembly (Syft, Trivy) | Sees the full filesystem; can miss vendored/static-linked components |
| Operational SBOM | What's actually *deployed where, now* | Continuously, from cluster state | The one that answers the incident question |

The dirty secret of the field: **build-time SBOMs from the dependency graph are far more accurate than after-the-fact image scans** (which infer packages from filesystem heuristics and miss shaded jars, static binaries, vendored code — Log4Shell's worst cases were *shaded* Log4j copies invisible to naive scanners). Generate at build, from the resolver's own graph, then *attach the SBOM to the image digest as a signed attestation* (Chapter 11) so inventory travels with the artifact.

**The operational layer is the payoff.** A warehouse of per-artifact SBOMs is necessary but not sufficient; the incident question is a *join*: `SBOM data ⋈ what's running`. Mature architecture: SBOMs indexed in a queryable store (Dependency-Track, GUAC, or a database), continuously reconciled against cluster inventory (which digests run in which namespaces), so "show me every production workload containing log4j-core < 2.17.1" is a query with an SLA, not a war room.

**Formats.** CycloneDX and SPDX; both fine, pick per ecosystem/regulatory pull (CycloneDX stronger in appsec tooling; SPDX in licensing/compliance lineage). Format wars are a distraction — *accuracy of generation and queryability of storage* determine value.

**Dependency graph, not dependency list.** Knowing `libX 1.2` is present is level one. Knowing *why* — which direct dependency pulled it, which module, since when — is what makes remediation tractable ("bump A" vs "we vendored it in 2019 and no one knows why").

## Threat model & compromise scenarios

- **The next Log4Shell** (the routine case): a critical CVE drops in a common component. SBOM-mature org: query, ranked list of affected deployed workloads, patch by exposure. SBOM-blind org: grep-and-pray across hundreds of repos, while attackers mass-scan the internet — exploitation of major CVEs now begins within *hours* of disclosure.
- **SBOM as attacker's map**: an SBOM is precise vulnerability targeting information — treat SBOM stores as sensitive systems (authn, authz, audit). Sharing SBOMs with customers is increasingly demanded (US EO 14028 pushed federal procurement this way); share deliberately, not by leaving the bucket public.
- **SBOM forgery / omission**: a compromised build emits a clean-looking SBOM omitting the malicious addition. This is why SBOMs are *signed attestations from the trusted builder* (Chapters 8, 11) — inventory inherits the build's trust properties, and why independent after-the-fact scanning still has a role as a cross-check.

## Common mistakes

- Generating SBOMs to satisfy a checkbox, storing them nowhere queryable ("write-only compliance")
- Scanning images instead of exporting the build graph, then trusting the result as complete
- SBOM per repo, but no link to *deployed digests* — inventory that can't answer the operational question
- No SBOMs for the platform itself: your CI runners, ingress controllers, observability stack are software too (XZ Utils was *infrastructure* software)
- Confusing SBOM (what's inside) with provenance (where it came from) — you need both; they answer different questions

## Design review questions

- Time yourself: "which production workloads contain component X?" — minutes, hours, or archaeology?
- Are SBOMs produced from the build graph or inferred from filesystems? Who signs them?
- Does your inventory cover platform components, or only product services?
- When a CVE feed updates, does anything automatically re-evaluate existing SBOMs (continuous matching), or do you only scan at build time?

## Implementation examples

Syft (`syft <image> -o cyclonedx-json`) for container SBOMs; native build-tool export where possible (Maven CycloneDX plugin, `npm sbom`, Go's embedded module info); `cosign attest --type cyclonedx` to attach signed SBOMs to digests; Dependency-Track or GUAC for storage + continuous CVE matching; admission policy requiring an SBOM attestation to exist before a pod runs (Kyverno `verifyImages` attestation checks).

:::tip[Key Takeaways]

- SBOMs convert "are we affected?" from investigation into query — that speed is the entire value.
- Generate at build from the resolver's graph; attach to the digest as a signed attestation; index for querying; join with runtime.
- An unqueried SBOM is theater; an unsigned SBOM is hearsay.
- Inventory the platform, not just the products.
:::

## Architecture Conversation

**E:** We generate CycloneDX for every image and store them in S3. Are we Log4Shell-ready?

**A:** It's 9pm, the CVE just dropped in `commons-text`. Walk me through your next 30 minutes.

**E:** I'd... write a script to pull thousands of JSON files from S3 and grep them. Then figure out which of those images are actually deployed. Which means pulling cluster state from four clusters and joining on digest. Honestly, that's a all-nighter, not 30 minutes.

**A:** So you have ingredients labels — in a warehouse, unsorted, with no map of which pantry each product went to. What's the missing piece?

**E:** The operational join. Index SBOMs in something queryable, keep a live feed of deployed digests, and pre-join them. The query should exist *before* the incident.

**A:** Right. And one more: your SBOM says what the build *reported*. If the build was compromised — the thing SBOMs supposedly help with — why do you believe the report?

**E:** We'd need the SBOM signed by the builder, and ideally an independent scan as a cross-check. Evidence about the artifact needs the same trust treatment as the artifact.

**A:** Which is exactly where we're heading: signatures, then attestations.
