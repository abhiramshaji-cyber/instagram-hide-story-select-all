# Instagram Hide Story: Select All

A Tampermonkey userscript that selects every account on
`instagram.com/accounts/hide_story_and_live_from/`.

Verified against the live page with Playwright driving a headed Chrome on a real
logged in account (1748 followers in the list).

## Install

1. Install Tampermonkey.
2. Create a new script, paste `userscript.js`, save.
3. Open `instagram.com/accounts/hide_story_and_live_from/` **directly by URL**. It is a
   single page app, so reaching it by clicking through Settings does not fire a page load
   and Tampermonkey never runs.
4. Press **Ctrl+Shift+H** to start. Watch the console for progress.

There is no Done button to press. Every toggle immediately POSTs to
`/async/wbloks/fetch/` and persists server side, confirmed by selections surviving a
multi hour gap and a full page reload.

`MAX_CLICKS` defaults to 150 per session, deliberately. See Rate limiting below.

## Why the naive version selects nothing

The page is **Bloks**, Meta's server driven UI, not React. Three assumptions that
seem reasonable all turn out to be false.

### 1. There are no checkboxes

`document.querySelectorAll('input[type="checkbox"]').length` is **0**. Any script
built on native checkbox elements falls through immediately.

### 2. There are no SVG toggles either

The toggle is a plain div with a CSS `mask-image` pointing at a PNG sprite:

```html
<div tabindex="0" role="button" aria-label="Toggle checkbox"
     class="wbloks_1" style="pointer-events: none;">
  <div data-bloks-name="ig.components.Icon"
       style="mask-image: url(.../circle__outline__24-4x.png); ...">
</div>
```

So heuristics that look for `<circle>`, `<polyline>`, or a `path[d*="M12"]` inside
an `<svg>` match nothing on the list. Worse, `path[d*="M12"]` is a false positive
magnet: path data is full of numbers, so `M12` appears in most unrelated Instagram
icons anyway.

Measured on the live page: an SVG based selector would have clicked **0** of 1748 rows.

The real state signal is the child's `mask-image` filename:

| state | filename fragment |
|---|---|
| unchecked | `circle__outline__24` |
| checked | `circle-check__filled` |

Background color corroborates it (`rgb(219,219,219)` vs `rgb(74,93,249)`) but the
mask filename is the more stable check.

### 3. The list is not virtualized

Rows accumulate and are never unmounted: 48 on load, growing to 1748 after 37 scroll
passes, with `scrollHeight` only ever increasing. So the correct strategy is to scroll
fully to the bottom **first**, then click everything in one pass. No need to interleave
clicking and scrolling.

## The two traps that bite even after you fix the selector

### The node is replaced on every click

This is the one that costs the most time. Clicking a toggle makes Bloks re render the
row and **swap in a brand new DOM node**. The reference you clicked is detached
immediately:

```js
const t = document.querySelector(SEL);
t.click();
await sleep(2000);
document.contains(t);   // false
```

A loop that holds element references therefore sees the state never change, concludes
every click failed, and retries against detached nodes forever. The fix is to address
rows **by index** and re query the live NodeList on each access. Index is stable
precisely because the list only appends.

### The toggle has `pointer-events: none`

Real mouse events never reach the toggle: they land on the row wrapper above it, which
carries `pointer-events: auto; cursor: pointer`. A synthetic `element.click()` works
because it skips hit testing. Notably this means Playwright's `locator.click()`, which
does a real mouse click at coordinates, is the wrong tool here, while
`page.evaluate(el => el.click())` is correct.

### Hidden accounts sort first, then pagination stalls

This one only appears on a **resumed** run, and it silently makes the script look broken.

Instagram returns every account you have already hidden **first**, and then pauses for a
long time before paginating the remainder. On a resumed run with 1499 already hidden,
the observed sequence was:

```
on load           1499 rows, 0 unselected     <- long stall here
patient scrolling 1555 -> 1600 -> 1649 -> 1695 -> 1738 -> 1748
final             1748 rows, 249 unselected
```

An impatient stall detector (4 passes of 2s, as in v6) gives up *inside* that pause. The
script then iterates the 1499 rows it can see, finds them all checked, skips every one,
and reports `selected 0`. It looks like the existing selections are jamming it. They are
not: the remaining rows simply had not loaded yet.

The fix is patience, not cleverness: `SCROLL_WAIT = 4000` and `STUCK_LIMIT = 12`. The
scroll phase now idles for roughly 48 seconds before it will call the list complete, and
logs `idle n/12, be patient` so a slow load is not mistaken for a hang.

Note also that there is **no 1500 account cap**. 1499 hidden plus 249 remaining equals
the full 1748, so the earlier stop was rate limiting alone.

## Rate limiting

Every toggle fires its own POST:

```
https://www.instagram.com/async/wbloks/fetch/?appid=com.instagram.portable_settings.privacy.hide_story_from_sc
```

That is one request per account, and this limit is **real, not theoretical**. A v6 run at
500ms with no session cap got through roughly 1500 accounts before Instagram started
rejecting toggles, and the block lasted several hours.

So v7 is deliberately conservative:

* `MAX_CLICKS = 150` per session, well under the observed threshold
* `CLICK_DELAY = 1200`ms with jitter, up from 500ms
* every click is verified, with escalating backoff on failure
* aborts after 3 consecutive failures rather than grinding against a block

Roughly 150 accounts per session at about 3 minutes a session. Re run it a few times
across a day rather than trying to clear the whole list at once.

It is always safe to re run. Already selected rows are skipped, so a run interrupted by
a block resumes exactly where it stopped, and nothing is ever unselected.

## Verification performed

All measured against the live page on a real account.

| check | result |
|---|---|
| native checkboxes on page | 0 |
| rows an SVG based selector would click | 0 of 1748 |
| rows loaded by the scroll phase, first run | 1748, over 37 passes |
| node detached after click | confirmed, `document.contains` false |
| state flips vs clicks issued | 3 of 3, then 6 of 6, then 12 of 12 |
| POSTs observed vs clicks issued | 3 of 3 |
| persistence across hours and a reload | confirmed, no Done press needed |
| resumed run, patient scroll | 1499 stalled state recovered to 1748 |
| hidden vs remaining on resume | 1499 + 249 = 1748, so no account cap |
| v7 end to end with a 12 click budget | 1499 to 1511 checked, 249 to 237 left |
