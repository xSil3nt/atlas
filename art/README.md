# Pack artwork

The runtime texture is `public/textures/pack.png`.

This is the canonical artwork for the Atlas pack opener. The files in `art/`
are blank canvases and layout guides, not additional runtime textures.
`dist/textures/pack.png` is generated from the public asset on each build.
The sibling `gamble/` project delegates to Atlas; obsolete pack textures,
duplicated templates and earlier atlas PNG backups have been removed.
Replace only Atlas's `public/textures/pack.png` when updating the live artwork.

Edit `art/pack-blank.png` at 2048 × 1536. Use `pack-guide.png` or
`pack-guide-colors.png` as a guide layer, then hide it before export.
Replace the runtime PNG and refresh. Rebuild before deploying.

| Face | X pixels (end exclusive) |
| --- | --- |
| Front | 0–1024 |
| Back | 1024–2048 |

Keep both faces upright; do not mirror the back. The folds extend the border
pixels of each face, so no side artwork is needed. The top 100 pixels cover
the tear strip; the bottom 75 cover the crimp. Keep text away from these bands
and the face edges. Export an opaque PNG at the original size or an exact
multiple, without cropping or padding. The renderer supplies lighting and
reflections.

UV dimensions are in `packs/src/dimensions.js`. Card images and rarities come
from `xSil3nt/lifestitchr-cards` on `main`.
