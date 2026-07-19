---
title: Glossary
description: Plain-language definitions of every key term used in the Secure Software Delivery Architecture handbook — SBOM, SLSA, SPIFFE, Sigstore, provenance, attestation, and more.
sidebar:
  order: 3
---

Key terms used throughout this handbook, ordered alphabetically.

---

**Admission controller**
A Kubernetes component that intercepts API-server requests before objects are persisted. Policy-enforcing admission controllers (OPA/Gatekeeper, Kyverno) can reject or mutate workloads that fail supply-chain policy — e.g., images without a valid Cosign signature or a missing SLSA provenance attestation.

**Attestation**
A signed, machine-verifiable statement about an artifact or process. An attestation binds a *subject* (typically an artifact digest) to a *predicate* (a fact: how it was built, what it contains, whether it passed tests). The in-toto Attestation Framework and DSSE define the canonical envelope format.

**Chain of custody**
The unbroken sequence of verifiable handoffs — Developer → Git → Build → Artifact → Deployment → Runtime — each link signed or witnessed such that a claim about the running workload can be traced back to the originating source commit.

**CI (Continuous Integration)**
An automated system that builds, tests, and packages code changes on every push. In a secure delivery architecture, the CI system is itself a trust boundary: it must run on hardened infrastructure, emit signed provenance, and be the *only* path through which artifacts enter the registry.

**CODEOWNERS**
A Git repository file that maps directory paths to mandatory reviewers. When enforced via protected-branch rules, it provides cryptographic proof (via signed merge commits) that a human with declared authority approved each change.

**Cosign**
A Sigstore tool for signing and verifying container images and other OCI artifacts. Cosign can store signatures in-registry (as OCI referrers) or produce attestation bundles, and integrates with Fulcio and Rekor for keyless signing.

**DSSE (Dead Simple Signing Envelope)**
A minimal JSON envelope format for authenticated statements, defined by the in-toto project. DSSE wraps an arbitrary payload with one or more signatures, providing a standard container for attestations that is simpler than PGP or JWS.

**Fulcio**
A Sigstore certificate authority that issues short-lived code-signing certificates tied to OIDC identities (GitHub Actions OIDC, Google, etc.). Because certificates expire in minutes, Fulcio enables *keyless* signing: no long-lived private key is needed, and the identity is the CI pipeline itself.

**GitOps**
An operating model where the desired state of infrastructure and workloads is stored entirely in Git, and a reconciliation agent (Argo CD, Flux) continuously drives the live environment toward that state. GitOps makes deployment auditable and reproducible: every change is a signed Git commit.

**in-toto**
A framework for end-to-end supply-chain integrity. It defines a *layout* (the expected steps in a pipeline) and *link metadata* (evidence that each step ran as specified). Verifying a supply chain means checking that all expected steps ran, in order, by the right functionaries.

**mTLS (Mutual TLS)**
A TLS handshake in which *both* client and server authenticate with certificates. In a zero-trust runtime, mTLS between services proves workload identity at the network level without relying on network position (IP address or VLAN).

**OIDC (OpenID Connect)**
An identity layer on top of OAuth 2.0 that issues short-lived identity tokens (JWTs). Modern CI systems (GitHub Actions, GitLab CI) mint OIDC tokens per-job; these are used by Fulcio to issue signing certificates and by cloud providers to grant IAM credentials without storing static secrets.

**OPA (Open Policy Agent)**
A general-purpose policy engine that evaluates Rego rules against JSON input. In supply-chain contexts, OPA is commonly used as the policy backend for Gatekeeper (Kubernetes admission) or as a standalone gate in CI pipelines.

**Policy-as-code**
The practice of expressing security and compliance requirements as version-controlled, machine-executable rules (Rego, CEL, YAML constraints) rather than wiki docs or manual checklists. Changes to policy go through the same review and CI process as application code.

**Provenance**
A verifiable record of *how* an artifact was produced: what source commit, which build system, what inputs, and when. SLSA Provenance is the canonical schema. Provenance answers "where did this artifact come from?" — the foundation for supply-chain verification.

**Rekor**
A Sigstore transparency log that provides an immutable, publicly auditable record of signing events. When Cosign signs an artifact, the signature and certificate are appended to Rekor. Verifiers can check the log to confirm a signing event existed at a specific time, even after a certificate expires.

**SBOM (Software Bill of Materials)**
A machine-readable inventory of all components in a software artifact — libraries, transitive dependencies, operating-system packages. SBOMs are produced in SPDX or CycloneDX format and enable vulnerability scanning, license auditing, and incident response (quickly identifying which workloads are affected by a CVE).

**Sigstore**
An open-source project (hosted by the OpenSSF) providing the tooling stack for keyless software signing: Fulcio (CA), Rekor (transparency log), and Cosign (signing client). Sigstore makes it practical for every build to be signed without managing PKI.

**SLSA (Supply chain Levels for Software Artifacts)**
A security framework (pronounced "salsa") defining four levels of supply-chain integrity assurance. Higher SLSA levels require tamper-evident build systems, hermetic builds, and non-forgeable provenance, creating a common vocabulary for maturity and a baseline for verification policies.

**SPIFFE (Secure Production Identity Framework for Everyone)**
An open standard for workload identity. A SPIFFE identity is a URI (SPIFFE ID) backed by a short-lived X.509 certificate (SVID). It allows services to prove their identity to each other without static credentials or network-level trust assumptions.

**SPIRE (SPIFFE Runtime Environment)**
The reference implementation of SPIFFE. SPIRE consists of a server (issues SVIDs) and agents (run on each node, attest workload identity to the server). SPIRE integrates with Kubernetes, VM attestors, and cloud IAM to bootstrap cryptographic identity for every workload.

**Supply chain**
In software, the full set of people, systems, and steps involved in producing and delivering a software artifact — from developer workstation through build system, registry, and deployment pipeline to the running workload. A compromised link anywhere in the chain can produce malicious software at the other end.

**SVID (SPIFFE Verifiable Identity Document)**
The credential issued by SPIRE to a workload. An SVID contains the workload's SPIFFE ID inside an X.509 certificate (or JWT). SVIDs are short-lived and automatically rotated, so compromise of one does not persist.

**Trust boundary**
Any point in the delivery pipeline where authority or identity changes hands — where a claim must be re-verified rather than inherited. Identifying all trust boundaries is the prerequisite for designing controls; every chapter in this handbook is organized around one.

**Workload identity**
A cryptographic identity assigned to a running process or container, distinct from the human developer who wrote it. Workload identity (via SPIFFE/SPIRE, Kubernetes service accounts, or cloud IAM) allows services to authenticate to each other and to infrastructure without embedding secrets in the image.
