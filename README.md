# Instagram Hide Story: Select All

A Tampermonkey userscript that selects every account on
`instagram.com/accounts/hide_story_and_live_from/`.

Verified against the live page with Playwright driving a headed Chrome on a real
logged in account (1748 followers in the list). All test selections were reverted.

## Install

1. Install Tampermonkey.
2. Create a new script, paste `userscript.js`, save.
3. Open the hide story page. The script starts itself after 3 seconds.
4. Watch the console for progress.

After it finishes, click Instagram's own **Done** button to commit.

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

## Rate limiting

Every toggle fires its own POST:

```
https://www.instagram.com/async/wbloks/fetch/?appid=com.instagram.portable_settings.privacy.hide_story_from_sc
```

That is one request per account. Across ~1700 accounts, hammering that endpoint is a
realistic way to get action blocked. The script paces itself at roughly 500ms with
jitter, verifies each click actually took, backs off on failure, and aborts after 5
failures.

It is safe to re run. Already selected rows are skipped, so a run interrupted by a
block resumes where it stopped.

## Verification performed

| check | result |
|---|---|
| native checkboxes on page | 0 |
| rows an SVG based selector would click | 0 of 1748 |
| rows loaded by the scroll phase | 1748, over 37 passes |
| state flips vs clicks issued | 3 of 3, then 6 of 6 |
| POSTs observed vs clicks issued | 3 of 3 |
| node detached after click | confirmed |
| test selections reverted | yes, back to 0 checked |
