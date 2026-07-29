// ==UserScript==
// @name         Instagram Hide Story - Select All
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  Selects every account on the hide story list. Bloks aware, resumable, paced.
// @author       You
// @match        *://*.instagram.com/accounts/hide_story_and_live_from/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---- tuning -------------------------------------------------------------
  const MAX_CLICKS  = 150;   // per session. Keeps you under Instagram's action limit.
  const CLICK_DELAY = 1200;  // ms between clicks, jittered
  const SCROLL_WAIT = 4000;  // ms per scroll pass. Do NOT lower this.
  const STUCK_LIMIT = 12;    // no growth passes before the list counts as fully loaded
  const AUTO_START  = false; // false = press Ctrl+Shift+H to run
  // -------------------------------------------------------------------------

  const SEL       = '[role="button"][aria-label="Toggle checkbox"]';
  const UNCHECKED = 'circle__outline__24';
  const CHECKED   = 'circle-check__filled';

  const sleep  = ms => new Promise(r => setTimeout(r, ms));
  const jitter = ms => ms + Math.floor(Math.random() * ms * 0.5);
  const log    = (...a) => console.log('%c[HideStory]', 'color:#4a5df9;font-weight:bold', ...a);

  const toggles     = () => document.querySelectorAll(SEL);
  const styleAt     = i => toggles()[i]?.firstElementChild?.getAttribute('style') || '';
  const isCheckedAt = i => styleAt(i).includes(CHECKED);
  const countUnchecked = () =>
    [...toggles()].filter(t =>
      (t.firstElementChild?.getAttribute('style') || '').includes(UNCHECKED)).length;

  // The list scroller is the TALLEST overflow container, not the last in document order.
  const getScroller = () =>
    [...document.querySelectorAll('div')]
      .filter(el => {
        const s = getComputedStyle(el);
        return /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 20;
      })
      .sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || null;

  // Instagram sorts ALREADY HIDDEN accounts first, then pauses for a long time before
  // paginating the rest. Impatient stall detection stops inside that pause and makes the
  // script think it is done when it has only seen the accounts it already hid.
  async function loadAll() {
    if (!getScroller()) { log('No scroll container. Is the list rendered?'); return false; }
    let stuck = 0, pass = 0;
    while (stuck < STUCK_LIMIT) {
      const sc = getScroller();
      const n0 = toggles().length, h0 = sc.scrollHeight;
      sc.scrollTop = sc.scrollHeight;
      await sleep(SCROLL_WAIT);
      const n1 = toggles().length;
      stuck = (n1 === n0 && sc.scrollHeight === h0) ? stuck + 1 : 0;
      if (++pass % 5 === 0 || n1 !== n0) {
        log(`scroll ${pass}: ${n1} rows, ${countUnchecked()} unselected` +
            (stuck ? ` (idle ${stuck}/${STUCK_LIMIT}, be patient)` : ''));
      }
    }
    log(`list fully loaded: ${toggles().length} rows, ${countUnchecked()} unselected`);
    return true;
  }

  // Bloks REPLACES the toggle node on every click, so a held element reference goes stale
  // instantly. Address rows by index and re query the live list. Index is stable because
  // the list only ever appends.
  async function selectAll() {
    const total = toggles().length;
    const todo  = Math.min(countUnchecked(), MAX_CLICKS);
    let done = 0, failed = 0;
    log(`selecting ${todo} accounts (budget ${MAX_CLICKS}/session)...`);

    for (let i = 0; i < total && done < MAX_CLICKS; i++) {
      if (isCheckedAt(i)) continue;

      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        toggles()[i].click();             // pointer-events:none, so a synthetic .click()
        await sleep(jitter(CLICK_DELAY)); // is required, not a real mouse event
        ok = isCheckedAt(i);
        if (!ok) { log(`row ${i} did not take (try ${attempt}), backing off`); await sleep(6000 * attempt); }
      }

      if (ok) { done++; failed = 0; } else { failed++; }
      if (failed >= 3) {
        log(`STOPPED at ${done}. Instagram is rate limiting. Wait a few hours and re run.`);
        return done;
      }
      if (done % 25 === 0 && ok) log(`${done}/${todo} selected`);
    }
    return done;
  }

  async function run() {
    log('starting...');
    if (!(await loadAll())) return;
    const n = await selectAll();
    const left = countUnchecked();
    log(`FINISHED. selected ${n} this session. ${left} still unselected.`);
    if (left) log(`Re run later to continue. Already selected rows are skipped.`);
    else log(`All done. Nothing left to select.`);
  }

  if (AUTO_START) {
    sleep(3000).then(run);
  } else {
    log('ready. Press Ctrl+Shift+H to start.');
    addEventListener('keydown', e => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyH') run();
    });
  }
})();
