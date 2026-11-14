# Lifestitchr Atlas

Card browser, deckbuilder and pack opener.

## Run locally

Requires Node 22.12 or newer.

```sh
npm ci
npm run dev
```

`npm run build` writes to `dist`. Use `npm run preview` to serve the build locally.
The catalog and artwork load from `xSil3nt/lifestitchr-cards` on GitHub.

## Modes

- Constructed: all cards, standard copy limits.
- Limited: opened cards, limited to copies you own.
- Anarchy: all cards, unrestricted copies within deck size limits.

Each mode keeps separate main and resource decks. Constructed offers starter decks
when the main deck is empty. Links use `?mode=normal`, `?mode=pack` or
`?mode=anarchy`; `#packs` opens the pack viewport. Old Packs and Anarchy URLs
redirect into the same page.

## Packs

A pack grants twelve cards when the first card is revealed, including duplicates.
Inventory and decks are stored in this browser under `atlas-modes-v1`.
Reloading keeps your cards but starts a new sealed pack. Browser tabs do not
sync, and blocked browser storage cannot save progress.

Clear deck empties the selected deck. Clear packs resets inventory and both
pack-mode decks after confirmation. Other modes keep their decks.

See [art/README.md](art/README.md) for the pack texture layout.

## Checks

```sh
npm test
npm run build
```

Browser checks use a running local server. Set `ATLAS_TEST_URL` to its origin
(default: `http://127.0.0.1:5174`). Run `check:menu`, `check:variants`,
`check:modes`, `check:reset` and `check:ui` with `npm run`.
`check:exit` and `check:rarity` cover renderer behavior; `check:build` checks
a production preview. Screenshots go in `test-results/`.

The opener requires WebGL 2 and network access to the artwork.
