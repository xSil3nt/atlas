// Card data now comes from a single metadata.json in the cards repo.
// We fetch it as a raw file (no GitHub tree API, no token, no rate limit) and
// stamp image URLs onto each entry.
//
// CARDS_REF points at the branch/tag holding the data.
const MAIN_GROUPS = ["Blood", "Heart", "Brain", "Soul", "Eye", "Multi"];
const CORPSE_TYPES = { "Common Corpse": "common", "Peculiar Corpse": "peculiar" };

// Only the old array format derives classification from folders. Keep this
// adapter while the cards repository and Atlas are deployed independently.
function legacyCard(card) {
  if (typeof card?.path !== "string") return card;
  const [group, subtype] = card.path.split("/");
  const corpse = group === "Resource";
  return {
    ...card,
    deck: corpse ? "corpse" : "main",
    group,
    ...(corpse ? { type: subtype === "Peculiar" ? "Peculiar Corpse" : "Common Corpse" } : {}),
  };
}

function buildCardCatalog(metadata, imageUrl) {
  const cards = Array.isArray(metadata) ? metadata.map(legacyCard) : metadata?.cards;
  if (!Array.isArray(cards)) throw new Error("metadata must contain a cards array");

  const decks = Object.fromEntries(MAIN_GROUPS.map(group => [group, []]));
  const resources = [];

  for (const [index, card] of cards.entries()) {
    const invalid = reason => {
      throw new Error(`Invalid metadata card ${index + 1}: ${reason}`);
    };
    if (!card || typeof card.name !== "string" || !card.name.trim()) invalid("missing name");
    if (typeof card.path !== "string" || !card.path.trim()) invalid("missing image path");

    // folder is a compatibility alias for Atlas's existing response shape.
    const enriched = { ...card, folder: card.group, url: imageUrl(card.path) };
    if (card.deck === "corpse") {
      if (card.group !== "Resource") invalid("corpse group must be Resource");
      if (!Object.hasOwn(CORPSE_TYPES, card.type)) invalid("unknown corpse type");
      // Copy limits follow the printed corpse type, independently of rarity.
      enriched.resourceType = CORPSE_TYPES[card.type];
      resources.push(enriched);
    } else if (card.deck === "main") {
      if (!MAIN_GROUPS.includes(card.group)) invalid("unknown main group");
      decks[card.group].push(enriched);
    } else {
      invalid("deck must be main or corpse");
    }
  }

  for (const cards of Object.values(decks)) cards.sort((a, b) => a.name.localeCompare(b.name));
  resources.sort((a, b) => {
    if (a.resourceType !== b.resourceType) return a.resourceType === "common" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    decks,
    resources,
    backs: { main: imageUrl("mainback.png"), resource: imageUrl("resback.png") },
  };
}

const CARDS_REF = "main";
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

  let catalog;
  try {
    catalog = buildCardCatalog(meta, rawUrl);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  return res.status(200).json(catalog);
}
