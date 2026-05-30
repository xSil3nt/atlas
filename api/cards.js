// Card data now comes from a single metadata.json in the cards repo.
// We fetch it as a raw file (no GitHub tree API, no token, no rate limit) and
// stamp image URLs onto each entry.
//
// CARDS_REF points at the branch/tag holding the data. Flip this to "main"
// once the metadata-overhaul branch is merged.
const CARDS_REF = "metadata-overhaul";
const REPO = "xSil3nt/lifestitchr-cards";

function rawUrl(path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${REPO}/${CARDS_REF}/${encoded}`;
}

export default async function handler(req, res) {
  let meta;
  try {
    const r = await fetch(rawUrl("metadata.json"), { headers: { Accept: "application/json" } });
    if (!r.ok) {
      const body = await r.text();
      return res.status(502).json({ error: `metadata fetch ${r.status}`, detail: body });
    }
    meta = await r.json();
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  const decks = { Blood: [], Heart: [], Brain: [], Soul: [], Eye: [], Multi: [] };
  const resources = [];

  for (const card of meta) {
    const folder = card.path.split("/")[0];
    const enriched = { ...card, folder, url: rawUrl(card.path) };

    if (folder === "Resource") {
      const sub = card.path.split("/")[1];
      enriched.resourceType = sub === "Peculiar" ? "peculiar" : "common";
      resources.push(enriched);
    } else if (decks[folder]) {
      decks[folder].push(enriched);
    }
  }

  for (const key of Object.keys(decks)) {
    decks[key].sort((a, b) => a.name.localeCompare(b.name));
  }
  resources.sort((a, b) => {
    if (a.resourceType !== b.resourceType) return a.resourceType === "common" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const backs = { main: rawUrl("mainback.png"), resource: rawUrl("resback.png") };

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  return res.status(200).json({ decks, resources, backs });
}
