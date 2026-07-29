// Paste into the DevTools console on instagram.com/accounts/hide_story_and_live_from/
// Selects everything, no session cap. Type __stop = true to abort.
(async () => {
  const SEL = '[role="button"][aria-label="Toggle checkbox"]';
  const CHECKED = 'circle-check__filled';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const list = () => document.querySelectorAll(SEL);
  const checkedAt = i =>
    (list()[i]?.firstElementChild?.getAttribute('style') || '').includes(CHECKED);
  const left = () => [...list()].filter((_, i) => !checkedAt(i)).length;
  // While this spinner exists more rows are inbound, no matter how long growth stalled.
  const isLoading = () => !!document.querySelector('svg[aria-label="Loading..."]');
  const scroller = () => [...document.querySelectorAll('div')]
    .filter(el => {
      const s = getComputedStyle(el);
      return /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 20;
    })
    .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];

  window.__stop = false;
  console.log(`START: ${list().length} rows loaded, ${left()} unselected`);
  if (!list().length) return console.log('NO TOGGLES FOUND. Wrong page, or list not rendered yet.');

  let total = 0;
  for (let round = 1; !window.__stop; round++) {
    // 1. click everything currently loaded
    let fail = 0;
    for (let i = 0; i < list().length && !window.__stop; i++) {
      if (checkedAt(i)) continue;
      list()[i].click();
      await sleep(900 + Math.random() * 600);
      if (checkedAt(i)) {
        total++; fail = 0;
        if (total % 20 === 0) console.log(`${total} selected, ${left()} left`);
      } else {
        fail++;
        console.log(`row ${i} rejected (${fail}/4), backing off 8s`);
        await sleep(8000);
        if (fail >= 4) {
          console.log(`BLOCKED. selected ${total} this run, ${left()} left. Re run in a few hours.`);
          window.__stop = true;
        }
      }
    }
    if (window.__stop) break;

    // 2. load more rows. Instagram stalls hard right after the already hidden block,
    //    so this has to be patient or it looks finished when it is not.
    const before = list().length;
    let idle = 0;
    while (idle < 12) {
      const t = scroller();
      if (!t) break;
      const n0 = list().length, h0 = t.scrollHeight;
      t.scrollTop = t.scrollHeight;
      await sleep(4000);
      const grew = list().length !== n0 || t.scrollHeight !== h0;
      idle = (grew || isLoading()) ? 0 : idle + 1;
    }
    console.log(`round ${round}: rows ${before} -> ${list().length}, ${left()} unselected`);
    if (list().length === before && left() === 0 && !isLoading()) break;
  }
  console.log(`FINISHED. selected ${total} this run. ${list().length} rows, ${left()} still unselected.`);
})();
