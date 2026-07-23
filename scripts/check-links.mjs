// Checks every external (http/https) link in src/content/docs for dead or
// redirected URLs. Manual/local tool — not wired into `npm run build` or CI
// (the existing lychee CI job already checks the *built* site's links).
//
// Run:  node scripts/check-links.mjs
//
// For each unique URL found in the markdown source: fetches it with a
// browser-like User-Agent (some sites 403 plain bot requests), follows
// redirects, and reports:
//   OK        - 2xx, final URL matches the one in the docs
//   REDIRECT  - request succeeded but landed on a different URL (informational
//               — could be a benign canonical redirect, or content that moved)
//   BROKEN    - non-2xx status or the request failed/timed out
//
// Exits non-zero only on BROKEN links, so it's safe to use as a pre-commit
// gate; REDIRECT is a warning to eyeball, since some redirects are fine
// (trailing slash, http->https) and some mean the linked content moved.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const docsDir = path.join(root, 'src/content/docs');

const CONCURRENCY = 8;
const TIMEOUT_MS = 15_000;
const RETRIES = 1;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

// ---- find every .md/.mdx file under src/content/docs ----------------------
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.mdx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

// ---- extract markdown links, skipping fenced code blocks ------------------
const LINK_RE = /\]\((https?:\/\/[^)\s]+)\)/g;

function extractLinks(content, relPath) {
  const links = [];
  let inFence = false;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const match of line.matchAll(LINK_RE)) {
      links.push({ url: match[1], file: relPath, line: i + 1 });
    }
  }
  return links;
}

// ---- normalize a URL for "is this actually the same place" comparison -----
function normalize(url) {
  try {
    const u = new URL(url);
    u.protocol = 'https:';
    u.hash = '';
    if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return url;
  }
}

// ---- fetch one URL with timeout + one retry --------------------------------
async function checkUrl(url) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
      clearTimeout(timer);
      if (!res.ok) {
        if (attempt < RETRIES) continue;
        return { status: 'BROKEN', detail: `HTTP ${res.status}` };
      }
      if (normalize(res.url) !== normalize(url)) {
        return { status: 'REDIRECT', detail: res.url };
      }
      return { status: 'OK' };
    } catch (err) {
      clearTimeout(timer);
      if (attempt < RETRIES) continue;
      return { status: 'BROKEN', detail: err.name === 'AbortError' ? 'timed out' : err.message };
    }
  }
}

// ---- a tiny concurrency-limited map ----------------------------------------
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---- main -------------------------------------------------------------------
const files = await walk(docsDir);
const allLinks = [];
for (const file of files) {
  const content = await readFile(file, 'utf8');
  allLinks.push(...extractLinks(content, path.relative(root, file)));
}

const byUrl = new Map();
for (const link of allLinks) {
  if (!byUrl.has(link.url)) byUrl.set(link.url, []);
  byUrl.get(link.url).push(link);
}

const uniqueUrls = [...byUrl.keys()];
console.log(`Checking ${uniqueUrls.length} unique external link(s) from ${allLinks.length} reference(s) in ${files.length} file(s)...\n`);

const results = await mapLimit(uniqueUrls, CONCURRENCY, checkUrl);

const broken = [];
const redirected = [];
let okCount = 0;

uniqueUrls.forEach((url, i) => {
  const result = results[i];
  if (result.status === 'OK') okCount++;
  else if (result.status === 'REDIRECT') redirected.push({ url, ...result });
  else broken.push({ url, ...result });
});

function printGroup(title, items) {
  if (items.length === 0) return;
  console.log(`${title} (${items.length})`);
  for (const { url, detail } of items) {
    console.log(`  ${url}`);
    if (detail) console.log(`    -> ${detail}`);
    for (const ref of byUrl.get(url)) console.log(`    ${ref.file}:${ref.line}`);
  }
  console.log('');
}

printGroup('BROKEN', broken);
printGroup('REDIRECTED', redirected);

console.log(`${okCount} OK, ${redirected.length} redirected, ${broken.length} broken`);

if (broken.length > 0) process.exitCode = 1;
