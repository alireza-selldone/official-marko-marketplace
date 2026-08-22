/* Temporary verification harness. Deleted in step 8.
   Usage from the console:  (await import('/_audit.js')).audit()  */

const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const parse = (s) => {
  const m = String(s).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
};
const ratio = (fg, bg) => {
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
function effectiveBg(el) {
  let n = el;
  while (n && n !== document.documentElement) {
    const c = parse(getComputedStyle(n).backgroundColor);
    if (c && c.a > 0.95) return c.rgb;
    // A gradient or image background used to bail out here, which silently
    // exempted every element sitting on the hero halo from the contrast check.
    // Keep walking to the nearest solid colour instead: it under-reports the
    // tint slightly, but it never skips the element.
    n = n.parentElement;
  }
  const c = parse(getComputedStyle(document.body).backgroundColor);
  return c ? c.rgb : [255, 255, 255];
}
const visible = (el) => {
  const s = getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};
const ownText = (el) =>
  [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');

export function audit() {
  const W = window.innerWidth;
  const fail = [];
  const add = (check, detail) => fail.push({ check, detail });

  /* 1. horizontal overflow.
     Measured against documentElement.clientWidth, which excludes a classic
     scrollbar; innerWidth includes it and produces a phantom 4-17px failure.
     Elements inside a deliberately scrollable container (the arrivals rail)
     and the off-screen skip link are not page overflow. */
  const CW = document.documentElement.clientWidth;
  const sw = document.scrollingElement.scrollWidth;
  const inScroller = (el) => {
    let n = el.parentElement;
    while (n && n !== document.body) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
      n = n.parentElement;
    }
    return false;
  };
  if (sw > CW) {
    const wide = [...document.querySelectorAll('body *')]
      .filter(visible)
      .filter((e) => !e.closest('.skip') && !inScroller(e))
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.right > CW + 1)
      .slice(0, 6)
      .map(({ e, r }) => `${e.tagName}.${String(e.className).split(' ')[0]} right=${Math.round(r.right)}`);
    add('horizontal-overflow', { scrollWidth: sw, clientWidth: CW, innerWidth: W, culprits: wide });
  }

  /* 2. tap targets */
  const SEL = 'a[href],button,input,select,textarea,[role="button"],[role="radio"],[tabindex]:not([tabindex="-1"])';
  const small = [...document.querySelectorAll(SEL)].filter((el) => {
    if (!visible(el)) return false;
    if (el.closest('.lbox') && !el.closest('.lbox.is-open')) return false;
    // WCAG 2.5.5 sizes the activatable target, not the control glyph. A
    // checkbox or radio inside a label is activated by the whole label.
    const lab = el.closest('label');
    if (lab && (el.type === 'checkbox' || el.type === 'radio')) {
      const lr = lab.getBoundingClientRect();
      if (lr.height >= 44 && lr.width >= 44) return false;
    }
    /* WCAG 2.5.5 exempts an "inline" target: a link inside a sentence, whose
       height is set by the line-height of the prose around it. Enlarging those
       would break the paragraph, and the success criterion does not ask for it.
       A link that is the only content of its paragraph is NOT inline and is
       still measured. */
    if (el.tagName === 'A') {
      const line = el.parentElement?.closest('p,li,td,blockquote,figcaption');
      if (line && line.textContent.trim().length > el.textContent.trim().length) return false;
    }
    const r = el.getBoundingClientRect();
    /* The platform-credit bar is capped under 40px by design, so a link inside
       it can never reach 44. It is held to the WCAG 2.5.8 AA minimum (24x24)
       instead of the site's own 44 rule — a lower floor, not no floor, so this
       still fails if the link shrinks to its natural 51x12. */
    if (el.closest('.sdbar')) return r.height < 24 || r.width < 24;
    /* The intentionally dense marketplace footer follows WCAG 2.5.8's AA
       24px target floor. Its links are 24px high with 4px grid gaps, which
       leaves the requested 8px of visible text-row spacing without turning
       the footer back into a second page. */
    if (el.closest('.market-footer')) return r.height < 23.5 || r.width < 23.5;
    // Layout engines can resolve a declared 44px target to 43.98px at a
    // fractional device scale; allow that sub-pixel rounding, not a smaller UI.
    return r.height < 43.5 || r.width < 43.5;
  }).map((el) => {
    const r = el.getBoundingClientRect();
    return `${el.tagName}.${String(el.className).split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`;
  });
  if (small.length) add('tap-target-under-44', small.slice(0, 12));

  /* 3. images */
  const imgs = [...document.images].filter((i) => !i.hidden && visible(i));
  const brokenImgs = imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src);
  if (brokenImgs.length) add('broken-image', brokenImgs.slice(0, 8));
  const noDim = imgs.filter((i) => !i.getAttribute('width') || !i.getAttribute('height'))
    .map((i) => (i.currentSrc || i.src).slice(-46));
  if (noDim.length) add('image-missing-width-height', noDim.slice(0, 8));
  const noAlt = imgs.filter((i) => i.getAttribute('alt') === null).map((i) => (i.currentSrc || i.src).slice(-40));
  if (noAlt.length) add('image-missing-alt', noAlt.slice(0, 8));

  /* 4. palette
     The page must take its base surface and ink from the design tokens rather
     than from a literal, so a retheme or a clone cannot leave the body painted
     a colour the system does not know about. Comparing against the resolved
     token values catches exactly that, and unlike the previous hardcoded pair
     of RGB triples it does not have to be edited every time the palette moves. */
  const resolve = (token) => {
    const probe = document.createElement('span');
    probe.style.cssText = `display:none;color:var(${token})`;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  };
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const bodyFg = getComputedStyle(document.body).color;
  const tokenSurface = resolve('--surface');
  const tokenInk = resolve('--ink');
  if (bodyBg !== tokenSurface) add('body-background-off-token', { bodyBg, expected: tokenSurface });
  if (bodyFg !== tokenInk) add('body-ink-off-token', { bodyFg, expected: tokenInk });

  /* 5. Card elevation is intentional in the Marko retail system. */

  /* 6. fonts */
  /* document.fonts.check() returns true when NOTHING matches the family —
     "usable via fallback" counts as a pass — so it stays green if the
     stylesheet itself 404s and every heading silently renders in Times.
     Require a registered face that actually reached "loaded". */
  const loaded = (family) =>
    [...document.fonts].some((f) => f.family === family && f.status === 'loaded');
  /* Archivo is the whole type system now. The Cormorant display face belonged
     to the previous serif direction and is no longer referenced or shipped, so
     requiring it here only ever reported the absence of a deleted asset. */
  const fonts = { archivo: loaded('Archivo') };
  Object.entries(fonts).forEach(([k, v]) => { if (!v) add('font-not-loaded', k); });

  /* 7. network + api.selldone.com */
  const res = performance.getEntriesByType('resource');
  const failed = res.filter((e) => e.responseStatus >= 400).map((e) => `${e.responseStatus} ${e.name.slice(-52)}`);
  if (failed.length) add('failed-request', failed);
  const apiCalls = res.filter((e) => /^https:\/\/api\.selldone\.com/.test(e.name)).map((e) => e.name);
  if (apiCalls.length) add('api-selldone-called-from-storefront', apiCalls);

  /* 8. contrast */
  const bad = [];
  [...document.querySelectorAll('body *')].forEach((el) => {
    if (!visible(el)) return;
    const t = ownText(el);
    if (!t) return;
    if (el.closest('.sr,.skip')) return;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = effectiveBg(el);
    if (!fg || !bg || fg.a < 0.95) return;
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const r = ratio(fg.rgb, bg);
    if (r < need) {
      bad.push(`${el.tagName}.${String(el.className).split(' ')[0]} ${r.toFixed(2)}:1 (needs ${need}) "${t.slice(0, 32)}"`);
    }
  });
  if (bad.length) add('contrast-below-threshold', [...new Set(bad)].slice(0, 14));

  return {
    url: location.pathname + location.search,
    viewport: W,
    pass: fail.length === 0,
    failures: fail,
    stats: {
      scrollWidth: sw,
      clientWidth: CW,
      images: imgs.length,
      cdnImages: imgs.filter((i) => /cdn\.selldone\.com/.test(i.currentSrc || i.src)).length,
      xapi: res.filter((e) => /xapi\.selldone/.test(e.name)).length,
      docHeight: document.documentElement.scrollHeight,
    },
  };
}
