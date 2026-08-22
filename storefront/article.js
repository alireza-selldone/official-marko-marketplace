/* Single article. Accepts ?slug= or ?id=, where id is the shop-blog id the
   detail route calls blog_id — not the article id. */
import { loadArticle, loadBlogCategories } from "./shop-data.js";
import { esc } from "./app.js";

const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

/* The body is HTML authored in Selldone's editor. It ships with an inline
   <figure> repeating the cover image, which would show the same picture twice
   on the page — drop it here rather than editing the merchant's content. */
function cleanBody(html, coverSrc) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  doc.querySelectorAll("figure img").forEach((img) => {
    if (coverSrc && img.getAttribute("src") === coverSrc) {
      img.closest(".medium-insert-images, figure")?.remove();
    }
  });
  doc.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
  return doc.body.innerHTML;
}

document.addEventListener("DOMContentLoaded", async () => {
  const q = new URLSearchParams(location.search);
  const slug = q.get("slug");
  const blogId = Number(q.get("id")) || null;
  const err = document.querySelector("[data-article-error]");

  const fail = (msg) => {
    err.hidden = false;
    err.textContent = msg;
    document.querySelector("[data-article-title]").textContent = "Article not found";
    document.title = "Article not found — Marko";
  };

  if (!slug && !blogId) return fail("No article was requested. Choose one from the buying guides.");

  let a;
  try {
    a = await loadArticle({ blogId, slug });
  } catch (e) {
    console.error("[fashioni] article load failed", e);
    return fail("This article could not be loaded from Selldone. Refresh to try again.");
  }
  if (!a) return fail("That article does not exist, or is no longer published.");

  document.title = `${a.title} — Marko`;
  document.querySelector("[data-article-title]").textContent = a.title;

  const meta = [fmtDate(a.date), a.author].filter(Boolean).join(" · ");
  document.querySelector("[data-article-meta]").textContent = meta;

  if (a.image) {
    const cover = document.querySelector("[data-article-cover]");
    const img = cover.querySelector("img");
    img.src = a.image;
    img.alt = a.title;
    cover.hidden = false;
  }

  document.querySelector("[data-article-body]").innerHTML = cleanBody(a.body, a.image);

  // The category name lives on the listing, not the detail payload.
  if (a.categoryId) {
    try {
      const cats = await loadBlogCategories();
      const c = cats.find((x) => x.id === a.categoryId);
      if (c) {
        const el = document.querySelector("[data-article-cat]");
        el.innerHTML = `<a href="blog.html?cat=${c.id}">${esc(c.name)}</a>`;
      }
    } catch { /* the eyebrow keeps its default "Journal" */ }
  }
});
