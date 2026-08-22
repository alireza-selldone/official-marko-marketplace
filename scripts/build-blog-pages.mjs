/* Emit storefront/blog.html and storefront/article.html.

   Same reason build-pages.mjs exists: the chrome is lifted from index.html so
   the header, footer and drawers cannot drift away from the rest of the
   site. Run after changing index.html's chrome:  npm run build:pages
*/
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const OUT = join(ROOT, "storefront");

function chrome() {
  const src = readFileSync(join(OUT, "index.html"), "utf8");
  const rawHead = src.slice(src.indexOf("<head>"), src.indexOf("</head>"));
  const head = rawHead.replace(/[ \t]*<script type="module" src="home\.js"><\/script>\r?\n/, "");
  if (head === rawHead) throw new Error("home.js script tag not found in index.html head");
  const bodyStart = src.search(/  <body\b/);
  const mainStart = src.indexOf('<main id="main"');
  if (bodyStart < 0 || mainStart < 0) throw new Error("index.html body or main marker not found");
  const top = src
    .slice(bodyStart, mainStart)
    .replaceAll('href="#service"', 'href="index.html#service"');
  return { head, top, tail: src.slice(src.indexOf("      </main>")) };
}

const PAGES = [
  {
    file: "blog.html",
    script: "blog.js",
    title: "Buying Guides — Marko",
    desc: "Practical Marko guides for styling, fitting, and caring for an everyday wardrobe.",
    main: `<main id="main" tabindex="-1">

        <section class="pghead ink">
          <div class="wrap">
            <p class="eyebrow eyebrow--onink">Marko insights</p>
            <h1 class="h1">Buying Guides</h1>
            <p class="pghead__meta" data-blog-count></p>
          </div>
        </section>

        <section class="section">
          <div class="wrap">
            <nav class="chips" data-blog-cats aria-label="Filter by category"></nav>
            <p class="cap" data-blog-error hidden style="color:var(--alert)"></p>
            <div class="posts" data-blog-list>
              <span class="sr" role="status">Loading articles</span>
              <div class="sk-post-card" aria-hidden="true"><i class="skeleton-block sk-post-image"></i><i class="skeleton-block skeleton-line sk-line-xs"></i><i class="skeleton-block skeleton-line sk-line-85"></i><i class="skeleton-block skeleton-line sk-line-70"></i></div>
              <div class="sk-post-card" aria-hidden="true"><i class="skeleton-block sk-post-image"></i><i class="skeleton-block skeleton-line sk-line-xs"></i><i class="skeleton-block skeleton-line sk-line-85"></i><i class="skeleton-block skeleton-line sk-line-70"></i></div>
              <div class="sk-post-card" aria-hidden="true"><i class="skeleton-block sk-post-image"></i><i class="skeleton-block skeleton-line sk-line-xs"></i><i class="skeleton-block skeleton-line sk-line-85"></i><i class="skeleton-block skeleton-line sk-line-70"></i></div>
            </div>
            <div class="sempty" data-blog-empty hidden>
              <p class="h3" style="margin-bottom:6px">No articles yet</p>
              <p class="cap">New Marko buying guides will appear here.</p>
            </div>
          </div>
        </section>

`,
  },
  {
    file: "article.html",
    script: "article.js",
    title: "Buying Guides — Marko",
    desc: "A practical fashion and wardrobe guide from Marko.",
    main: `<main id="main" tabindex="-1">

        <article data-article>
          <section class="pghead ink">
            <div class="wrap">
              <div class="pgcol">
                <p class="eyebrow eyebrow--onink" data-article-cat>Marko guide</p>
                <h1 class="h1" data-article-title>&nbsp;</h1>
                <p class="pghead__meta" data-article-meta></p>
              </div>
            </div>
          </section>

          <section class="section">
            <div class="wrap">
              <p class="cap" data-article-error hidden style="color:var(--alert)"></p>
              <div class="artcover" data-article-cover hidden>
                <img src="" alt="" width="1600" height="900">
              </div>
              <div class="prose" data-article-body><span class="sr" role="status">Loading article</span><div class="sk-article" aria-hidden="true"><i class="skeleton-block skeleton-line sk-line-85"></i><i class="skeleton-block skeleton-line"></i><i class="skeleton-block skeleton-line sk-line-70"></i><i class="skeleton-block sk-article-image"></i><i class="skeleton-block skeleton-line"></i><i class="skeleton-block skeleton-line sk-line-85"></i><i class="skeleton-block skeleton-line sk-line-55"></i></div></div>
              <p style="margin-top:44px"><a class="btn btn--text" href="/blog">← All articles</a></p>
            </div>
          </section>
        </article>

`,
  },
];

const { head, top, tail } = chrome();
for (const page of PAGES) {
  const pageHead = head
    .replace(/<title>.*?<\/title>/, `<title>${page.title}</title>`)
    .replace(/(name="description"\s*\n\s*content=)"[^"]*"/, `$1"${page.desc}"`)
    .replace('<script type="module" src="app.js"></script>',
             `<script type="module" src="app.js"></script>\n    <script type="module" src="${page.script}"></script>`);
  const out = `<!doctype html>\n<html lang="en">\n${pageHead}</head>\n${top}${page.main}${tail}`;
  writeFileSync(join(OUT, page.file), out);
  console.log(`  ${page.file.padEnd(16)}${out.length.toLocaleString().padStart(7)} bytes`);
}
