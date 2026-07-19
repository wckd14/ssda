// Generate llms.txt and llms-full.txt for LLM discoverability (see llmstxt.org).
// Runs as part of `npm run build` so the files always match current content.
//
//   /llms.txt       curated index: title, summary, and a linked list of every
//                   chapter with its description — a map for a model to fetch.
//   /llms-full.txt  the entire handbook as one plain-text document, in reading
//                   order — the whole thing ingestible in a single request.
//
// Output goes to public/, which Astro copies to the site root at build time.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SITE = 'https://securesoftwaredelivery.wckd14.xyz';
const TITLE = 'Secure Software Delivery Architecture';
const SUMMARY =
  "A platform engineer's guide to trust, identity, and software supply chains — the architecture behind how mature organizations ship software safely, from a developer's Git commit to a running production workload.";
const DETAILS =
  'A 24-chapter handbook that treats software delivery as a chain of custody: Developer → Git → Build → Artifact → Deployment → Runtime, with identity, evidence, and independent verification at every boundary. It favors durable architecture over specific tools.';

const docs = (p = '') => fileURLToPath(new URL(`../src/content/docs/${p}`, import.meta.url));
const pub = (p) => fileURLToPath(new URL(`../public/${p}`, import.meta.url));

// Sidebar order: a standalone page (file) or a directory of chapters.
const SECTIONS = [
  { label: 'Start Here', file: 'introduction.md' },
  { label: 'Foundations', dir: 'foundations' },
  { label: 'Source Trust', dir: 'source-trust' },
  { label: 'Build Trust', dir: 'build-trust' },
  { label: 'Artifact Trust', dir: 'artifact-trust' },
  { label: 'Deployment Trust', dir: 'deployment-trust' },
  { label: 'Runtime Trust', dir: 'runtime-trust' },
  { label: 'Platform Security', dir: 'platform-security' },
  { label: 'Operations', dir: 'operations' },
  { label: 'Closing', file: 'enduring-principles.md' },
];

function splitFrontmatter(raw) {
  if (!raw.startsWith('---')) return { data: {}, body: raw.trim() };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: raw.trim() };
  const fm = raw.slice(3, end);
  const body = raw.slice(end + 4).trim();
  const data = {};
  for (const line of fm.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    let [, key, val] = m;
    val = val.trim().replace(/^["'](.*)["']$/, '$1');
    if (val !== '') data[key] = val;
    else data[key] = ''; // nested block (e.g. sidebar:) — handled below
  }
  const order = fm.match(/^\s+order:\s*(\d+)/m);
  if (order) data.order = Number(order[1]);
  return { data, body };
}

// src/content/docs path -> public URL path
function urlFor(relPath) {
  const slug = relPath.replace(/\.mdx?$/, '');
  return `${SITE}/${slug}/`;
}

async function loadFile(relPath) {
  const raw = await readFile(docs(relPath), 'utf8');
  const { data, body } = splitFrontmatter(raw);
  return {
    relPath,
    url: urlFor(relPath),
    title: data.title ?? relPath,
    description: data.description ?? '',
    order: data.order ?? 0,
    body,
  };
}

async function loadSection(section) {
  if (section.file) return { label: section.label, pages: [await loadFile(section.file)] };
  const entries = (await readdir(docs(section.dir))).filter((f) => /\.mdx?$/.test(f));
  const pages = await Promise.all(entries.map((f) => loadFile(`${section.dir}/${f}`)));
  pages.sort((a, b) => a.order - b.order || a.relPath.localeCompare(b.relPath));
  return { label: section.label, pages };
}

const sections = [];
for (const s of SECTIONS) sections.push(await loadSection(s));

// ---- llms.txt (index) -----------------------------------------------------
let index = `# ${TITLE}\n\n> ${SUMMARY}\n\n${DETAILS}\n`;
for (const section of sections) {
  index += `\n## ${section.label}\n`;
  for (const p of section.pages) {
    index += `- [${p.title}](${p.url})${p.description ? `: ${p.description}` : ''}\n`;
  }
}
await writeFile(pub('llms.txt'), index);
console.log('wrote public/llms.txt');

// ---- llms-full.txt (full corpus) ------------------------------------------
let full = `# ${TITLE}\n\n> ${SUMMARY}\n\n${DETAILS}\n\nSource: ${SITE}\nLicense: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) — by wckd14\n`;
for (const section of sections) {
  for (const p of section.pages) {
    full += `\n\n${'='.repeat(72)}\n# ${p.title}\n`;
    if (p.description) full += `${p.description}\n`;
    full += `Source: ${p.url}\n${'='.repeat(72)}\n\n${p.body}\n`;
  }
}
await writeFile(pub('llms-full.txt'), full);
console.log('wrote public/llms-full.txt');
