# Secure Software Delivery Architecture

**A platform engineer's guide to trust, identity, and software supply chains — from a developer's Git commit to a running production workload.**

🔗 **Read it online → [securesoftwaredelivery.wckd14.xyz](https://securesoftwaredelivery.wckd14.xyz)**

[![Live site](https://img.shields.io/badge/read-online-ff7f66)](https://securesoftwaredelivery.wckd14.xyz)
[![License: CC BY 4.0](https://img.shields.io/badge/license-CC%20BY%204.0-blue)](./LICENSE)
[![Built with Starlight](https://img.shields.io/badge/built%20with-Astro%20Starlight-BC52EE)](https://starlight.astro.build)

---

## What this is

A 24-chapter handbook on securing the software supply chain end to end. It answers one question:

> When a container starts running in production, why should anyone believe it is the code the developer wrote?

Every chapter is one link in a **chain of custody** — `Developer → Git → Build → Artifact → Deployment → Runtime` — establishing identity, evidence, and independent verification at each boundary. The recent history of supply-chain compromises (SolarWinds, Codecov, Log4Shell, XZ Utils) is the running case study for why each link matters.

The handbook deliberately favors **durable architecture over specific tools**. Tools change every 18 months; the trust boundaries they enforce last a decade. Where tools appear (Cosign, SPIFFE, GitOps, OIDC, admission controllers, SBOMs, attestations…) they illustrate a principle rather than define it.

## Who it's for

Platform engineers, security engineers, SREs, and architects who design or operate the path software travels to production — and anyone who has to answer "how do we know this is safe to run?"

## What's inside

| Part | Focus |
| --- | --- |
| **I. Foundations** | Why secure software delivery exists, and the trust model that unifies the book |
| **II. Source Trust** | Git as the root of trust, and the repository governance that protects it |
| **III. Build Trust** | CI as a trust factory, and giving builds a verifiable identity |
| **IV. Artifact Trust** | The artifact lifecycle, provenance, SBOMs, signatures, and attestations |
| **V. Deployment Trust** | GitOps, deployment authorization, and admission controllers |
| **VI. Runtime Trust** | Workload identity, runtime authorization, and drift detection |
| **VII. Platform Security** | Secrets architecture, policy as code, threat modeling, and platform architecture |
| **VIII. Operations** | Incident response, maturity models, and running architecture reviews |
| **Closing** | The ten enduring principles — the whole handbook, distilled |

New to it? Start with **[How to Read This Handbook](https://securesoftwaredelivery.wckd14.xyz/introduction/)**.

## Local development

Built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build), deployed to Cloudflare Pages.

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # static output in dist/
npm run preview   # preview the production build
npm run assets    # regenerate the OG preview image and icons (public/)
```

### Project structure

```
src/
  content/docs/
    index.mdx                 # landing page (splash hero + card grid)
    introduction.md           # "How to Read This Handbook"
    foundations/              # Part I    (ch 1–2)
    source-trust/             # Part II   (ch 3–4)
    build-trust/              # Part III  (ch 5–6)
    artifact-trust/           # Part IV   (ch 7–11)
    deployment-trust/         # Part V    (ch 12–14)
    runtime-trust/            # Part VI   (ch 15–17)
    platform-security/        # Part VII  (ch 18–21)
    operations/               # Part VIII (ch 22–24)
    enduring-principles.md    # closing
  styles/custom.css           # the "chain of custody" theme
astro.config.mjs              # site config, sidebar, SEO head, plugins
scripts/generate-assets.mjs   # generates public/og.png + icon rasters
public/                       # favicon, OG image, robots.txt
```

### Content conventions

- **Frontmatter** on every file: `title`, `description` (used for SEO and page meta), and `sidebar.label` / `sidebar.order`.
- **Key Takeaways** are wrapped in a Starlight `:::tip[Key Takeaways]` aside.
- **Architecture Conversations** — the closing `## Architecture Conversation` of each chapter, using `**E:**` / `**A:**` speaker labels — are styled into a two-voice dialogue by `src/styles/custom.css`, no component required.
- **ASCII diagrams** are fenced code blocks rendered via Expressive Code with a dark "wire" border.

## Contributing

Spotted an error, a broken link, or something worth sharpening? Open an issue or a pull request — every page has an **Edit this page** link that drops you straight into the right source file. Corrections, clarifications, and new real-world case studies are all welcome.

## License

© wckd14. Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](./LICENSE).

You are free to share and adapt this material for any purpose, including commercially, as long as you give appropriate credit and link to the license. Attribution suggestion:

> "Secure Software Delivery Architecture" by wckd14, licensed under CC BY 4.0 — https://securesoftwaredelivery.wckd14.xyz
