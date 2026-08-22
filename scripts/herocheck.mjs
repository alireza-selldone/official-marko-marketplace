/* Verify the responsive Marko marketplace hero and its three seller stories. */
import { chromium } from "playwright";

const BASE = (process.argv[2] || "http://localhost:8788").replace(/\/+$/, "");
const browser = await chromium.launch();
let failures = 0;
const fail = (message) => { failures++; console.log(`  FAIL  ${message}`); };
const pass = (message) => console.log(`  ok    ${message}`);

for (const [width, height] of [[1440, 900], [1024, 900], [820, 1000], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-market-hero-art] img", { timeout: 20000 });
  await page.waitForTimeout(300);

  const stories = [];
  const dots = page.locator("[data-market-hero-dots] button");
  for (let index = 0; index < await dots.count(); index++) {
    await dots.nth(index).click();
    await page.waitForTimeout(150);
    stories.push(await page.evaluate(() => ({
      story: document.querySelector("[data-market-hero]")?.dataset.story,
      title: document.querySelector("[data-hero-title]")?.textContent.trim(),
      current: [...document.querySelectorAll("[data-market-hero-dots] button")]
        .findIndex((button) => button.getAttribute("aria-current") === "true"),
      images: document.querySelectorAll("[data-market-hero-art] img").length,
    })));
  }

  const state = await page.evaluate(() => {
    const hero = document.querySelector("[data-market-hero]").getBoundingClientRect();
    const copy = document.querySelector(".market-hero__copy").getBoundingClientRect();
    const art = document.querySelector("[data-market-hero-art]").getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      hero: { top: hero.top, bottom: hero.bottom },
      copy: { top: copy.top, bottom: copy.bottom, width: copy.width },
      art: { top: art.top, bottom: art.bottom, width: art.width },
    };
  });

  console.log(`\n  ${width}px`);
  state.overflow === 0 ? pass("no horizontal overflow") : fail(`${state.overflow}px horizontal overflow`);
  stories.length === 3 && new Set(stories.map(({ story }) => story)).size === 3
    ? pass("market, Alio, and Merino stories are distinct") : fail("three distinct stories did not render");
  stories.every(({ current }, index) => current === index)
    ? pass("all story controls select correctly") : fail("story selection state is incorrect");
  stories.every(({ title, images }) => title.length > 10 && images >= 2)
    ? pass("each story has visible copy and product art") : fail("a story is missing copy or product art");
  const copyVisible = state.copy.top >= state.hero.top && state.copy.bottom <= state.hero.bottom;
  copyVisible ? pass("hero copy is fully visible") : fail("hero copy is clipped");
  if (width <= 760) {
    state.art.top >= state.copy.top ? pass("mobile art follows the copy flow") : fail("mobile art overlaps above the copy");
  } else {
    state.copy.width > 0 && state.art.width > 0 ? pass("desktop copy and product art both have space") : fail("desktop hero column collapsed");
  }
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)\n` : "\nHero checks passed.\n");
process.exit(failures ? 1 : 0);
