// ==UserScript==
// @name         Instagram Hide Story - Select All
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  Adds a Select All button to the hide story list. Bloks aware, resumable.
// @author       You
// @match        *://*.instagram.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CLICK_DELAY = 900;   // ms between clicks, jittered. Raise if you get blocked.
  const SCROLL_WAIT = 4000;  // ms per scroll pass. Do NOT lower.
  const IDLE_LIMIT  = 12;    // no growth passes before the list counts as fully loaded

  const SEL     = '[role="button"][aria-label="Toggle checkbox"]';
  const CHECKED = 'circle-check__filled';

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const list  = () => document.querySelectorAll(SEL);
  const checkedAt = i =>
    (list()[i]?.firstElementChild?.getAttribute('style') || '').includes(CHECKED);
  const left = () => [...list()].filter((_, i) => !checkedAt(i)).length;

  const scroller = () => [...document.querySelectorAll('div')]
    .filter(el => {
      const s = getComputedStyle(el);
      return /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 20;
    })
    .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];

  let running = false;
  let stop = false;
  let btn = null;

  const paint = txt => { if (btn) btn.textContent = txt; };

  function makeButton() {
    if (document.getElementById('__hsBtn')) return;
    btn = document.createElement('button');
    btn.id = '__hsBtn';
    btn.textContent = `Select all (${left()} left)`;
    Object.assign(btn.style, {
      position: 'fixed', top: '16px', right: '16px', zIndex: '2147483647',
      padding: '12px 18px', background: '#4a5df9', color: '#fff', border: 'none',
      borderRadius: '10px', font: '600 14px system-ui, sans-serif', cursor: 'pointer',
      boxShadow: '0 4px 16px rgba(0,0,0,.3)',
    });
    btn.onclick = () => {
      if (running) { stop = true; paint('Stopping...'); return; }
      run();
    };
    document.body.appendChild(btn);
    console.log('[HideStory] button injected.', list().length, 'rows,', left(), 'unselected');
  }

  async function run() {
    running = true; stop = false;
    let total = 0;

    for (let round = 1; !stop; round++) {
      // 1. click everything currently loaded, so progress starts immediately
      let fail = 0;
      for (let i = 0; i < list().length && !stop; i++) {
        if (checkedAt(i)) continue;
        list()[i].click();                              // pointer-events:none, so a
        await sleep(CLICK_DELAY + Math.random() * 600); // synthetic click is required
        if (checkedAt(i)) {
          total++; fail = 0;
          paint(`Selected ${total} — ${left()} left (click to stop)`);
        } else {
          fail++;
          paint(`Rejected ${fail}/4, backing off...`);
          await sleep(8000);
          if (fail >= 4) {
            paint(`Blocked — selected ${total}. Try again later.`);
            console.log('[HideStory] rate limited after', total);
            running = false; return;
          }
        }
      }
      if (stop) break;

      // 2. load more. Instagram returns ALREADY HIDDEN accounts first and then stalls
      //    hard before paginating the rest, so this has to be patient or the script
      //    looks finished when it has only seen rows it already handled.
      const before = list().length;
      let idle = 0;
      while (idle < IDLE_LIMIT && !stop) {
        const t = scroller();
        if (!t) break;
        const n0 = list().length, h0 = t.scrollHeight;
        t.scrollTop = t.scrollHeight;
        await sleep(SCROLL_WAIT);
        if (list().length === n0 && t.scrollHeight === h0) idle++; else idle = 0;
        paint(`Loading more... ${list().length} rows, ${left()} left (${idle}/${IDLE_LIMIT})`);
      }
      console.log(`[HideStory] round ${round}: ${before} -> ${list().length} rows, ${left()} left`);
      if (list().length === before && left() === 0) break;
    }

    running = false;
    paint(left() ? `Done — ${left()} left, click to resume` : `All selected`);
    console.log('[HideStory] finished. selected', total, 'this run.', left(), 'left');
  }

  // Instagram is a single page app, so a route change fires no page load. Poll instead of
  // relying on @match, otherwise reaching the page via the Settings menu never injects.
  setInterval(() => {
    const onPage = location.pathname.includes('hide_story_and_live_from');
    const existing = document.getElementById('__hsBtn');
    if (onPage && list().length && !existing) makeButton();
    if (!onPage && existing) { existing.remove(); btn = null; stop = true; }
    if (onPage && existing && !running) paint(`Select all (${left()} left)`);
  }, 1500);
})();
