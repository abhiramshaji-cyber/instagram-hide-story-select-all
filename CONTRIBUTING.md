# Contributing

Issues and pull requests are welcome. This is a small project, so the bar is
simple: keep each change focused on one thing, and say why in the description.

## Getting set up

Install Tampermonkey, create a new script, and paste in `userscript.js`. There is
no build step and no test suite, because the only thing worth testing against is
Instagram's live Bloks UI.

## Before opening a pull request

- Run it against the real page on a real account.
- Say how many accounts you tested against and whether you saw rate limiting.
  A selector change is only believable with evidence, since the page is server
  driven and changes without notice.
- Keep `MAX_CLICKS` conservative. The limit exists to avoid tripping Instagram's
  rate limiting, not as a performance ceiling.

If Instagram changes the page and the script breaks, a pull request that explains
what changed is far more valuable than one that only fixes a selector.

Issues labelled `good first issue` are self contained and a good place to start.
