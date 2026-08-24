/* Static header/footer markup must already be what app.js hydrates to.
   ---------------------------------------------------------------------------
   app.js replaces the page's chrome on load unless the markup already carries
   the current version marker. When the static HTML fell a version behind, every
   page painted the old header for a moment and then swapped it — a visible
   flash of a different design on every navigation, which is what this check
   exists to stop coming back.

   This is a source comparison, not a browser test: a flash is a timing artefact
   and measuring it visually is flaky, whereas the divergence that causes it is
   exact and cheap to assert. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = "storefront";
const app = readFileSync(join(SRC, "app.js"), "utf8");

function literal(name) {
  const open = `const ${name} = \``;
  const i = app.indexOf(open);
  if (i < 0) throw new Error(`${name} not found in app.js`);
  const start = i + open.length;
  const end = app.indexOf("`;", start);
  return app.slice(start, end);
}

const header = literal("SHARED_HEADER_HTML");
const version = header.match(/data-shared-chrome="(v\d+)"/)?.[1];
if (!version) throw new Error("SHARED_HEADER_HTML carries no data-shared-chrome marker");

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1; };

console.log(`\nSTATIC CHROME MATCHES app.js (${version})`);
console.log("-".repeat(64));

const pages = readdirSync(SRC).filter((f) => f.endsWith(".html"));
const stale = [];
const missing = [];

for (const page of pages) {
  const html = readFileSync(join(SRC, page), "utf8");
  const marker = html.match(/data-shared-chrome="(v\d+)"/);
  if (!marker) { missing.push(page); continue; }
  if (marker[1] !== version) stale.push(`${page} (${marker[1]})`);
}

if (missing.length) fail(`no chrome marker at all: ${missing.join(", ")}`);
else pass(`all ${pages.length} pages carry a chrome marker`);

if (stale.length) {
  fail(`stale chrome, so these pages will flash the old header before app.js swaps it:`);
  stale.forEach((s) => console.log(`          ${s}`));
  console.log(`\n        Fix: copy SHARED_HEADER_HTML from app.js into the static markup.`);
} else {
  pass(`every page already carries ${version}, so app.js has nothing to swap`);
}

/* Negative control: a check that cannot fail is not a check. */
console.log("\n  --- negative control ---");
const planted = `<header class="hdr" data-shared-chrome="v0">x</header>`;
const plantedVersion = planted.match(/data-shared-chrome="(v\d+)"/)?.[1];
if (plantedVersion && plantedVersion !== version) pass("a planted stale marker is detected");
else fail("the comparison cannot discriminate — it would pass on anything");

console.log(failures ? `\n${failures} FAILURE(S)\n` : "\nStatic chrome is in step with app.js.\n");
process.exit(failures ? 1 : 0);
