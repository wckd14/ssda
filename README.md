# Secure Software Delivery Architecture — Handbook Site

The full handbook, built as an [Astro](https://astro.build) + [Starlight](https://starlight.astro.build) documentation site with a custom "chain of custody" theme (`src/styles/custom.css`).

## Quick start

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # static output in dist/
npm run preview   # preview the production build
```

## Structure

```
src/content/docs/
  index.mdx                 # landing page (splash hero + card grid)
  introduction.md           # "How to Read This Handbook"
  foundations/              # Part I   (ch 1–2)
  source-trust/             # Part II  (ch 3–4)
  build-trust/              # Part III (ch 5–6)
  artifact-trust/           # Part IV  (ch 7–11)
  deployment-trust/         # Part V   (ch 12–14)
  runtime-trust/            # Part VI  (ch 15–17)
  platform-security/        # Part VII (ch 18–21)
  operations/               # Part VIII(ch 22–24)
  enduring-principles.md    # closing
astro.config.mjs            # sidebar wired to the 8 parts
```

## What was adapted for the web

- **Frontmatter** on every file: `title`, `description` (used for SEO + page meta), and `sidebar.label` / `sidebar.order`.
- **Key Takeaways** in each chapter are wrapped in a Starlight `:::tip[Key Takeaways]` aside so they render as a styled callout out of the box.
- **Architecture Conversations** — the closing `## Architecture Conversation` section of every chapter, using `**E:**` / `**A:**` speaker labels — is styled by `src/styles/custom.css` (`h2#architecture-conversation ~ p` alternating by speaker) into a two-voice dialogue, no MDX component required.
- **ASCII diagrams** are fenced code blocks rendered via Starlight's Expressive Code, restyled with a dark "wire" border to match the theme.

## Theme

`astro.config.mjs` wires in `customCss: ['./src/styles/custom.css']`. The theme:

- Signal-teal accent (`--sl-color-accent`) for verified evidence, amber/teal speaker colors for the **E:**/**A:** dialogue.
- `JetBrains Mono` for headings, tables, and code; `Inter` for body text.
- Dark "ledger" neutral scale with light-mode equivalents (`:root[data-theme='light']`).

Everything is overridable via Starlight's CSS custom properties (`--sl-color-*`, `--sl-font`, etc.) in `src/styles/custom.css`.
