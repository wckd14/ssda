---
title: Admission Controllers
description: "The last unskippable gate: admission controllers at the Kubernetes API server verify signatures and attestations before any pod runs — with Kyverno, Gatekeeper, or OPA."
sidebar:
  label: 14. Admission Controllers
  order: 3
---

> **Chapter 14** · Deployment Trust

## Why this exists

Every control so far lives *upstream*: Git rules, CI hygiene, signing, GitOps review. Upstream controls share one weakness — **they only govern traffic that goes through them.** A stolen kubeconfig, a compromised reconciler, a misconfigured operator, a Helm install from a laptop: all reach the Kubernetes API directly, and none of your pipeline's virtue applies. The Kubernetes API server is where *every* path converges — pipeline, human, attacker, controller. Admission control is the checkpoint at that convergence point: **the last gate, and the only unskippable one.**

This is the chapter where the entire book's evidence chain gets *cashed in*.

## Mental model

Admission control is **border control at the destination country**. Your artifact traveled through many jurisdictions (repo, CI, registry) collecting stamped documents (signatures, provenance, attestations). None of those jurisdictions can be certain their controls weren't routed around — but the border can refuse entry to anyone without the full dossier, *regardless of route taken*. Chapter 11's principle made flesh: enforce at the destination, because routes multiply.

## Architecture

**Where admission sits.** Inside the Kubernetes API server's request path — after authentication and authorization, before persistence to etcd:

```
kubectl / reconciler / operator / attacker-with-kubeconfig
        ▼
  API server ── authn ── authz(RBAC) ── MUTATING admission ── validation ── VALIDATING admission ── etcd
                                            │ (webhooks/policies can                │ (webhooks/policies can
                                            │  modify the object)                   │  only allow/deny)
```

Everything that becomes cluster state passes here. That's the property no pipeline stage has.

**The policy engines.**
- **[Kyverno](https://kyverno.io/)**: policies *are* Kubernetes resources (YAML, no new language), with first-class `verifyImages` — signature and attestation verification with identity and predicate conditions built in. The pragmatic default for the supply-chain use case.
- **[OPA Gatekeeper](https://open-policy-agent.github.io/gatekeeper/website/)**: Rego-based, maximally expressive, ConstraintTemplates for reusable parameterized policy; the choice when policy logic is genuinely complex or shared beyond Kubernetes ([OPA](https://www.openpolicyagent.org/) is a general-purpose decision engine — Chapter 19).
- **[Sigstore policy-controller](https://docs.sigstore.dev/policy-controller/overview/)**: purpose-built ClusterImagePolicy for signature/attestation verification.
- **[ValidatingAdmissionPolicy](https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/) (CEL, in-tree)**: no webhook, no availability trade for simple validations — the direction the ecosystem is moving for basic rules; external engines remain necessary for image verification (which requires registry I/O and crypto).

**The two policy families that matter here:**

1. **Image trust (the supply-chain payoff).** The policy this whole book has been building toward, in Kyverno shape:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata: { name: require-verified-provenance }
spec:
  validationFailureAction: Enforce
  webhookConfiguration: { failurePolicy: Fail }
  rules:
  - name: verify-payments-images
    match: { any: [{ resources: { kinds: [Pod], namespaces: [payments] } }] }
    verifyImages:
    - imageReferences: ["registry.acme.io/prod/*"]
      required: true
      attestors:
      - entries:
        - keyless:
            subject: "https://github.com/acme/*/.github/workflows/release.yml@refs/heads/main"
            issuer: "https://token.actions.githubusercontent.com"
      attestations:
      - type: https://slsa.dev/provenance/v1
        conditions:
        - all:
          - key: "{{ invocation.configSource.uri }}"
            operator: Equals
            value: "git+https://github.com/acme/*"
      mutateDigest: true      # rewrite tags to digests at admission
```

Read what this enforces: *nothing runs in the payments namespace unless built by our release workflow, on main, from our repos, with verifiable provenance* — checked at the last moment, on every path, including the stolen-kubeconfig path.

2. **Runtime posture (what manifests may *say*).** GitOps verifies manifest *origin*; admission must verify manifest *content*: no privileged containers, no hostPath/hostNetwork, required securityContext, resource limits, disallow `:latest` and unpinned images. Pod Security Admission covers the baseline; engines cover the org-specific rest.

**Availability architecture — the part that bites.** Webhook-based admission puts a network call in the API server's write path. `failurePolicy` is the sharpest trade in the chapter: **Fail** (webhook down ⇒ API requests rejected — security holds, cluster changes freeze) vs **Ignore** (webhook down ⇒ requests pass unverified — availability holds, and your last gate has a documented off-switch: an attacker who can DoS or evict your webhook *disables enforcement*). Mature stance: `Fail` for the security-critical policies + engineering the webhook like the tier-0 service it now is (HA replicas, PDBs, priority classes, resource guarantees, exclusion of its own namespace to avoid deadlock at bootstrap) + narrow, explicit exemptions (kube-system components) rather than broad Ignore.

## Threat model & compromise scenarios

- **Stolen kubeconfig / compromised reconciler / rogue operator**: all converge at admission and face the same dossier check. This is the scenario the whole architecture exists for — upstream compromise, downstream refusal.
- **Attacking the gate itself**: delete/modify the webhook configuration or policies (defense: RBAC — almost nobody needs write on ValidatingWebhookConfigurations or ClusterPolicies; alert on any change), evict/DoS the webhook to exploit `Ignore` (defense: `Fail` + HA), or **compromise the policy source** — policies deployed via GitOps means policy-repo write access is enforcement-rewrite access. The verifier's configuration is a tier-0 artifact (Chapter 10's conversation, now operational).
- **Namespace/exemption gaps**: policies scoped to `prod` namespace while an attacker deploys to `default`; kube-system exemptions used as landing zones. Default-deny posture: match everything, exempt narrowly and explicitly.
- **TOCTOU note**: admission verifies at *admission*; a mutable tag could point elsewhere at pull time. `mutateDigest` (resolve tag→digest in the admitted object) closes it — Chapter 7 again.

## Common mistakes

- Audit mode forever ("we'll enforce next quarter," for nine quarters)
- `failurePolicy: Ignore` on the signature-verification policy (an off-switch labeled "kick me")
- Verifying signature existence but not signer identity/predicate conditions (Chapter 10's lesson, unlearned)
- Policy engine RBAC open to all cluster admins-of-convenience
- Forgetting non-Pod workload carriers (Deployments admit fine; verify at Pod level, where every controller's output converges)
- No policy on the policy: unreviewed changes to ClusterPolicies

## Design review questions

- Attempt to run an unsigned image in every namespace, via kubectl, via the reconciler, via a Job created by an operator. Show me all three refusals.
- What happens to the cluster when the admission webhook is down? Who decided that trade, and is it written down?
- Who can modify webhook configurations and policies? What alerts on it?
- Which namespaces/identities are exempt, and why, and where is that reviewed?

:::tip[Key Takeaways]

- Admission is the only gate on *every* path to cluster state — the destination checkpoint that makes upstream controls unbypassable.
- Image-trust policy at admission is where signatures, provenance, and attestations convert from evidence into enforcement.
- The gate becomes tier-0 infrastructure: engineer its availability, guard its configuration, treat `failurePolicy` as the deliberate trade it is.
- Default-deny with narrow exemptions; enforce at Pod level; resolve to digests at admission.
:::

## Architecture Conversation

**E:** With verified provenance enforced at admission, do we still need all the upstream controls? The gate catches everything anyway.

**A:** What does the gate verify?

**E:** That the image came from our release workflow on main with valid provenance... oh. The gate verifies the artifact came *through the front door*. It says nothing about what happened *behind* the front door — malicious code that passed a rubber-stamp review, a poisoned dependency in a hermetic-in-name-only build. Admission verifies the *chain held*, not that each link was *good*.

**A:** So the layers compose how?

**E:** Upstream controls make the front door *trustworthy*; admission makes the front door *mandatory*. Either without the other fails: strong pipeline + no gate = bypassable virtue; strong gate + weak pipeline = mandatory passage through a compromised checkpoint.

**A:** Now the uncomfortable one. Your admission policies are deployed by ArgoCD from a Git repo. An attacker gets write to that repo. Sequence the attack.

**E:** PR that adds an exemption or swaps the trusted identity, merge, reconciler faithfully applies it, gate now waves their images through — with GitOps providing a lovely audit trail of the disabling. The policy repo is literally the keys to the gate. Strictest CODEOWNERS we have, security-team-only merge, alerts on any ClusterPolicy change in-cluster, and... honestly it should be a *different* set of humans than the people who can merge app deploys.

**A:** Separation of duties, one more level up. You keep rediscovering the same three moves — verify at the boundary, separate the authorities, guard the guard's configuration. That's because there are only about three moves. The rest of the book is choosing where to apply them.
