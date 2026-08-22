/* Marko buying guide listing. Category filtering is server-side via ?category=<id>, which
   the list endpoint documents; the chips below reflect the real category list
   and its real per-category counts. */
import { loadBlog } from "./shop-data.js";
import { esc } from "./app.js";

const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

function cardHTML(p) {
  // Extensionless: Cloudflare's html_handling strips ".html" and 307s, so
  // linking article.html would cost a redirect on every click.
  const href = p.slug ? `article?slug=${encodeURIComponent(p.slug)}` : `article?id=${p.blogId}`;
  return `<a class="post" href="${href}">
    <div class="post__art">
      ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" width="800" height="450">` : ""}
    </div>
    <div class="post__txt">
      <p class="post__meta">
        ${p.category ? `<span class="post__cat">${esc(p.category.name)}</span>` : ""}
        ${p.date ? `<time datetime="${esc(p.date)}">${fmtDate(p.date)}</time>` : ""}
      </p>
      <h2 class="post__title">${esc(p.title)}</h2>
      <p class="post__ex">${esc(p.excerpt)}</p>
    </div>
  </a>`;
}

function render(state) {
  const list = document.querySelector("[data-blog-list]");
  const empty = document.querySelector("[data-blog-empty]");
  const count = document.querySelector("[data-blog-count]");
  const chips = document.querySelector("[data-blog-cats]");

  const shown = state.active
    ? state.posts.filter((p) => p.category?.id === state.active)
    : state.posts;

  count.textContent = state.total === 1 ? "1 article" : `${state.total} articles`;

  chips.innerHTML =
    `<button class="chip${state.active ? "" : " is-on"}" type="button" data-cat="">All<span>${state.posts.length}</span></button>` +
    state.cats.map((c) =>
      `<button class="chip${state.active === c.id ? " is-on" : ""}" type="button" data-cat="${c.id}">${esc(c.name)}<span>${c.count}</span></button>`
    ).join("");

  chips.querySelectorAll("[data-cat]").forEach((b) =>
    b.addEventListener("click", () => {
      const v = b.dataset.cat;
      state.active = v ? Number(v) : null;
      const url = new URL(location.href);
      if (state.active) url.searchParams.set("cat", state.active);
      else url.searchParams.delete("cat");
      history.replaceState(null, "", url);
      render(state);
    }));

  // The empty state stays in the code even though posts exist: the next shop
  // built from this repo starts with none.
  list.innerHTML = shown.map(cardHTML).join("");
  empty.hidden = shown.length > 0;
}

document.addEventListener("DOMContentLoaded", async () => {
  const err = document.querySelector("[data-blog-error]");
  try {
    const { posts, cats, total } = await loadBlog();
    const wanted = Number(new URLSearchParams(location.search).get("cat")) || null;
    render({ posts, cats, total, active: cats.some((c) => c.id === wanted) ? wanted : null });
  } catch (e) {
    err.hidden = false;
    err.textContent = "The buying guides could not be loaded from Selldone. Refresh to try again.";
    document.querySelector("[data-blog-empty]").hidden = true;
    console.error("[fashioni] blog load failed", e);
  }
});
