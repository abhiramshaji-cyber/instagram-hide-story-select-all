// ==UserScript==
// @name         Instagram Hide Story - Select All
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Scrolls the Bloks list to the bottom, then selects every account with pacing and rate limit detection.
// @author       You
// @match        *://*.instagram.com/accounts/hide_story_and_live_from/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SEL       = '[role="button"][aria-label="Toggle checkbox"]';
  const UNCHECKED = 'circle__outline__24';
  const CHECKED   = 'circle-check__filled';

  const CLICK_DELAY  = 500;   // ms between clicks, jittered
  const SCROLL_WAIT  = 2000;  // ms to wait for a page of rows to load
  const STUCK_LIMIT  = 4;     // consecutive no growth scrolls before we call it done

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const jitter = ms => ms + Math.floor(Math.random() * ms * 0.5);
  const log = (...a) => console.log('%c[HideStory]', 'color:#4a5df9;font-weight:bold', ...a);

  const toggles   = () => [...document.querySelectorAll(SEL)];
  const styleOf   = t => t.firstElementChild?.getAttribute('style') || '';
  const isUnchecked = t => styleOf(t).includes(UNCHECKED);
  const isChecked   = t => styleOf(t).includes(CHECKED);

  // The list scroller is the tallest overflow container, NOT the last in document order.
  function getScroller() {
    return [...document.querySelectorAll('div')]
      .filter(el => {
        const s = getComputedStyle(el);
        return /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 20;
      })
      .sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || null;
  }

  async function loadAll() {
    const sc = getScroller();
    if (!sc) { log('No scroll container found. Is the list rendered?'); return null; }

    let stuck = 0, pass = 0;
    while (stuck < STUCK_LIMIT) {
      const n0 = toggles().length, h0 = sc.scrollHeight;
      sc.scrollTop = sc.scrollHeight;
      await sleep(SCROLL_WAIT);
      const n1 = toggles().length;
      pass++;
      log(`scroll pass ${pass}: ${n0} -> ${n1} rows`);
      stuck = (n1 === n0 && sc.scrollHeight === h0) ? stuck + 1 : 0;
    }
    log(`list fully loaded: ${toggles().length} accounts`);
    return sc;
  }

  // IMPORTANT: Bloks REPLACES the toggle node on every click, so a held element
  // reference goes stale immediately. We address rows by index and re query the
  // live list each time. Index is stable because the list only ever appends.
  async function selectAll() {
    const total = toggles().length;
    let done = 0, skipped = 0;
    log(`selecting across ${total} accounts...`);

    for (let i = 0; i < total; i++) {
      if (isChecked(toggles()[i])) continue;

      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        toggles()[i].click();             // element is pointer-events:none, so a synthetic
        await sleep(jitter(CLICK_DELAY)); // .click() is required, not a real mouse event
        ok = isChecked(toggles()[i]);
        if (!ok) {
          log(`row ${i} did not take (attempt ${attempt}), backing off`);
          await sleep(5000 * attempt);
        }
      }

      if (ok) { done++; } else { skipped++; }

      if (skipped >= 5) {
        log(`STOPPING at ${done}/${total}. Instagram is likely rate limiting. ` +
            `Wait a while and re run: already selected accounts are skipped.`);
        return done;
      }
      if (done && done % 25 === 0) log(`${done}/${total} selected`);
    }
    return done;
  }

  (async () => {
    log('starting in 3s...');
    await sleep(3000);
    if (!(await loadAll())) return;
    const n = await selectAll();
    const remaining = toggles().filter(isUnchecked).length;
    log(`FINISHED. selected ${n}, still unchecked: ${remaining}`);
  })();
})();
