/* Verify the responsive full-bleed Marko carousel and its equal-height slides. */
import { chromium } from "playwright";

const BASE = (process.argv[2] || "http://localhost:8788").replace(/\/+$/, "");
const browser = await chromium.launch();
let failures = 0;
const fail = (message) => { failures++; console.log(`  FAIL  ${message}`); };
const pass = (message) => console.log(`  ok    ${message}`);

for (const [width, height] of [[1440, 900], [1024, 900], [820, 1000], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${BASE}/?hero=1&qa=herocheck`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    document.querySelectorAll("[data-market-hero-dots] button").length === 3 &&
    document.querySelector("[data-market-hero-art] img")?.complete,
  null, { timeout: 60000 });
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
      titleLines: document.querySelectorAll("[data-hero-title] span").length,
      image: document.querySelector("[data-market-hero-art] img")?.getAttribute("src"),
      naturalSize: [document.querySelector("[data-market-hero-art] img")?.naturalWidth, document.querySelector("[data-market-hero-art] img")?.naturalHeight],
      height: document.querySelector("[data-market-hero]")?.getBoundingClientRect().height,
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
  const expectedStories = ["performance", "home-cinema", "kids-play"];
  stories.length === 3 && stories.every(({ story }, index) => story === expectedStories[index])
    ? pass("performance, home-cinema, and kids-play stories are distinct") : fail("three expected stories did not render");
  stories.every(({ current }, index) => current === index)
    ? pass("all story controls select correctly") : fail("story selection state is incorrect");
  stories.every(({ title, images, titleLines }) => title.length > 10 && images === 1 && titleLines === 3)
    ? pass("each story has one full-bleed image and a three-line title") : fail("a story is missing its image or three-line copy");
  const expectedImages = [
    "assets/hero/marko-mens-performance-hd-v4.webp",
    "assets/hero/marko-premium-tv-hd-v4.webp",
    "assets/hero/marko-kids-play-hd-v4.webp",
  ];
  stories.every(({ image }, storyIndex) => image === expectedImages[storyIndex])
    ? pass("each story loads its own hero asset") : fail("a story loaded the wrong hero asset");
  /* The contract is that the three slides are interchangeable on one stage, not
     that the stage is any particular number of pixels. Asserting equality plus
     a floor lets the hero be redesigned without weakening the check; pinning a
     literal height only ever measured the previous design. */
  const heights = stories.map(({ height }) => Math.round(height));
  const MIN_STAGE = 400;
  new Set(heights).size === 1 && heights[0] >= MIN_STAGE
    ? pass(`all three slides share one ${heights[0]}px stage`)
    : fail(`slide stage heights differ or are too short (${heights.join(", ")})`);
  stories.every(({ naturalSize }) => naturalSize[0] >= 1920 && naturalSize[1] >= 1080)
    ? pass("every slide is at least 1920×1080")
    : fail(`a slide is below 1920×1080 (${stories.map(({ naturalSize }) => naturalSize.join("x")).join(", ")})`);
  const copyVisible = state.copy.top >= state.hero.top && state.copy.bottom <= state.hero.bottom;
  copyVisible ? pass("hero copy is fully visible") : fail("hero copy is clipped");
  state.art.top === state.hero.top && state.art.bottom === state.hero.bottom && state.art.width > 0
    ? pass("the image stage covers the complete hero section") : fail("the full-bleed image does not cover the hero");
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)\n` : "\nHero checks passed.\n");
process.exit(failures ? 1 : 0);
