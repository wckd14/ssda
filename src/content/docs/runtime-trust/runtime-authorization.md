---
title: Runtime Authorization
description: "What each workload is allowed to do: Zero Trust reduced to its engineering core — default-deny networking, mTLS identity, and service-to-service authorization."
sidebar:
  label: 16. Runtime Authorization
  order: 2
---

> **Chapter 16** · Runtime Trust

## Why this exists

Every workload now has a verifiable name. The question becomes: **what is each name allowed to do?** In most clusters, the honest answer is "everything" — flat pod networking means any pod can reach any pod, and once past network reachability, most internal services accept any caller. The industry name for fixing this is **Zero Trust**, a term so marketed it's nearly meaningless; this chapter reduces it to its engineering content:

> No request is granted because of *where it came from* (network location). Every request is authenticated (identity, Chapter 15) and authorized (policy, this chapter), and the default is deny.

Why it matters: the post-compromise phase. Attackers rarely land on their target — they land *somewhere* (a vulnerable sidecar, a dev tool, an SSRF) and **move east-west** toward the crown jewels. Flat internal networks make the first foothold equal to total access. Runtime authorization is the architecture of making lateral movement *expensive, loud, and mostly impossible*.

## Mental model

A city, not a castle. Castle security (perimeter thinking): one hard wall, soft everything inside. City security: every building has its own locks and its own guest list; the street being public doesn't open a single door. A burglar in a castle roams; a burglar in a city stands in the street facing ten thousand locked doors — and every doorbell they try is on camera.

## Architecture

Authorization at three layers — defense in depth, each catching what the previous can't:

**Layer 1 — Network policy (L3/L4: who can *reach* whom).** Kubernetes NetworkPolicies (enforced by the CNI: [Cilium](https://cilium.io/), [Calico](https://www.tigera.io/project-calico/)) constrain connectivity by pod/namespace selectors and ports. The architectural move is **default-deny**: an empty-podSelector policy denying all ingress (and, harder but higher-value, egress) per namespace, then explicit allows:

```yaml
# payments namespace: deny all ingress by default...
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny, namespace: payments }
spec: { podSelector: {}, policyTypes: [Ingress, Egress] }
---
# ...then allow only checkout ──► payments-api :8443
kind: NetworkPolicy
metadata: { name: allow-checkout, namespace: payments }
spec:
  podSelector: { matchLabels: { app: payments-api } }
  ingress:
  - from: [{ namespaceSelector: { matchLabels: { name: checkout } },
             podSelector: { matchLabels: { app: checkout } } }]
    ports: [{ port: 8443 }]
```

Egress control is the underrated half: a compromised pod that can't reach the internet can't fetch its second stage or exfiltrate — most real intrusions die of starvation right there. (Note the label-trust caveat: selectors trust labels, and labels are set by whoever creates pods — admission policy governing labels closes the loop with Chapter 14.)

**Layer 2 — Service-to-service authorization (L7: who may *call* what).** Network reachability isn't permission. With mesh mTLS (Chapter 15), every request carries a verified peer identity, and policy can bind identity→operation:

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata: { name: payments-api-authz, namespace: payments }
spec:
  selector: { matchLabels: { app: payments-api } }
  action: ALLOW
  rules:
  - from: [{ source: { principals:
        ["cluster.local/ns/checkout/sa/checkout"] } }]
    to:   [{ operation: { methods: ["POST"], paths: ["/v1/charges"] } }]
  - from: [{ source: { principals:
        ["cluster.local/ns/support/sa/support-portal"] } }]
    to:   [{ operation: { methods: ["GET"], paths: ["/v1/charges/*"] } }]
```

Read the shape: checkout may *create charges*; support may *read* them; nothing else, from anyone, including perfectly-authenticated neighbors. This is least privilege expressed over verified identities — the mesh's actual security payoff (mTLS without AuthorizationPolicies is an encrypted open door).

**Layer 3 — Application/entity-level authorization.** "Checkout may POST /charges" can't express "user Alice may charge *Alice's* card." Fine-grained, data-aware authorization stays in (or beside) the application — increasingly via externalized policy (OPA sidecars, dedicated authz services) so rules are testable and consistent (Chapter 19). Platform layers bound *which services converse*; the app bounds *which entities within*.

**North-south meets east-west.** Ingress gateways authenticate external clients (OIDC/JWT), then *propagate* verified end-user context inward so internal decisions can incorporate it — the pattern that stops "internal = trusted on behalf of anyone."

## Threat model & compromise scenarios

Run the canonical scenario against each layer: attacker exploits an SSRF in the (internet-facing, deliberately unprivileged) image-resize service.

- *Flat cluster*: scan everything, hit the database with scraped creds, reach cloud metadata, exfil. Minutes.
- *+ default-deny network*: resize-svc's egress allowlist is object-storage only. No scanning, no metadata service, no exfil channel. The connection *attempts* are themselves high-signal alerts (a pod calling things it has never called is the cleanest IDS you'll ever own).
- *+ mesh authz*: even the reachable object-store path permits only `PUT /thumbnails/*` as `resize-svc` — an identity with nearly nothing to abuse.
- *Residual*: abuse of resize-svc's own legitimate permissions (confused-deputy). That's Layer 3's and rate-limiting's territory — and detection's (Chapter 17).

Attacking the authorization layer itself: policy is Kubernetes objects → whoever writes NetworkPolicies/AuthorizationPolicies rewrites the city's locks → the policy-repo/GitOps/admission guardrails from Chapters 12–14 are the defense, again. (The recurring shape: every control's control plane is the real target.)

## Common mistakes

- mTLS enabled, authorization policies absent — "we encrypt our completely open doors"
- Default-allow with a few deny rules (backwards; you can't enumerate what to deny)
- Ingress-only network policy — free egress for exfiltration and staging
- Namespace = trust boundary in name only (no policies actually scoped to it)
- Authorization by network reachability alone at L3, ignoring identity (IP-based rules in a world of churning pod IPs)
- Rolling out default-deny cluster-wide in one change (breaking everything, generating a revert, poisoning the well politically — stage it namespace-by-namespace with observe-mode first)

## Design review questions

- From a shell in your least-trusted internet-facing pod: what can it reach (run the scan in staging), and what may it call as its identity?
- Which namespaces have default-deny today? For those that don't — dependency graph unknown, or priorities?
- Show the AuthorizationPolicy protecting your crown-jewel service. Who may call which operations?
- Who can change network/authz policies, and does that path have the same rigor as your deploy path?
- Does end-user context survive the trip from ingress to backend, or does "internal" mean "on behalf of anyone"?

## Implementation examples

Cilium: identity-aware policy (CiliumNetworkPolicy with L7/FQDN egress rules — allowlist by DNS name, not brittle IPs), [Hubble](https://github.com/cilium/hubble) for observing flows before enforcing; Istio: PeerAuthentication STRICT + per-service AuthorizationPolicies, dry-run annotations for staged rollout; [Linkerd](https://linkerd.io/): default-deny + Server/ServerAuthorization CRDs; OPA/[Envoy](https://www.envoyproxy.io/) `ext_authz` for L7 decisions with end-user context.

:::tip[Key Takeaways]

- Zero Trust, de-marketed: authenticate every request, authorize on identity not location, default-deny.
- Three layers — reachability (network policy), callability (mesh authz), entity rights (application) — and the middle one is where identity from Chapter 15 gets cashed in.
- Egress control is the cheapest kill-switch on real attack chains.
- Denied traffic is premium telemetry: a pod knocking on new doors is your earliest honest signal.
:::

## Architecture Conversation

**E:** Realistically — hundreds of services, unknown call graph — this feels like a two-year project we'll abandon in month three.

**A:** Because the mental model is "lock every door at once." What's the incremental version?

**E:** Observe first: Hubble/mesh telemetry to *learn* the actual call graph without enforcing. Then rank: default-deny around the five crown-jewel namespaces first — payments, auth, PII stores. Egress before ingress, since it's the exfil path and usually simpler to characterize. Then expand outward, namespace by namespace, dry-run before enforce.

**A:** And the political failure mode?

**E:** One big-bang rollout breaks checkout on a Friday, and "network policy" becomes a cursed phrase for two years. Staged, observed, per-namespace — with the flow data proving each policy matches reality before it enforces.

**A:** Good. Last thing: suppose full success — identity everywhere, default-deny, tight authz. An attacker compromises checkout itself, and does *nothing but what checkout is allowed to do*, slowly. Which of today's controls sees them?

**E:** ...None. Every action is authenticated, authorized, and legitimate-shaped. Prevention is out of moves — we'd need to notice *behavioral* change: new patterns inside allowed paths, drift from the workload's own baseline.

**A:** Which is why runtime trust doesn't end with authorization. Next chapter: what happens when the thing you verified starts *diverging* from what you verified.
