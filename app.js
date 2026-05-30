const ATLAS_COLS = 10;
const ATLAS_ROWS = 7;
const MAX_DECK = 40;
const MAX_COPIES = 3;
const RESOURCE_DECK_SIZE = 20;
const RESOURCE_MAX_PECULIAR = 3;

const FOLDERS = ["Blood", "Heart", "Brain", "Soul", "Eye", "Multi"];
const RESOURCES = ["Blood", "Heart", "Brain", "Soul", "Eye"];

const STARTER_DECKS = {
  Heart: [
    { name: "Ursa Major",        count: 2 },
    { name: "Wapiti",            count: 2 },
    { name: "Altar Familiar",    count: 3 },
    { name: "Graft",             count: 3 },
    { name: "Box of Limbs",      count: 3 },
    { name: "Ambush",            count: 3 },
    { name: "Gloomtongue",       count: 3 },
    { name: "Gravebind",         count: 3 },
    { name: "Gravesworn Brawler",count: 3 },
    { name: "Jumpstart",         count: 3 },
    { name: "Lycanhead",         count: 3 },
    { name: "Rabid Hunt",        count: 3 },
    { name: "Sky Tyrant",        count: 3 },
    { name: "Venerable Alpha",   count: 3 },
  ],
  Brain: [
    { name: "Cruel Ruin",             count: 2 },
    { name: "Defense Systems",        count: 2 },
    { name: "Altar Familiar",         count: 3 },
    { name: "Graft",                  count: 3 },
    { name: "Box of Limbs",           count: 3 },
    { name: "Brain Blast",            count: 3 },
    { name: "Cadaver Study",          count: 3 },
    { name: "Resupply",               count: 3 },
    { name: "Draw Upon the Well",     count: 3 },
    { name: "Defense Engineer",       count: 3 },
    { name: "The Amygdala",           count: 3 },
    { name: "Neuron Dealer",          count: 3 },
    { name: "Sigma Falls",            count: 3 },
    { name: "Warden of Lost Memories",count: 3 },
  ],
  Soul: [
    { name: "Scant Messenger",     count: 2 },
    { name: "Transient Malevolence",count: 2 },
    { name: "Altar Familiar",      count: 3 },
    { name: "Graft",               count: 3 },
    { name: "Box of Limbs",        count: 3 },
    { name: "Bearer of the Banner",count: 3 },
    { name: "Divine Blessing",     count: 3 },
    { name: "Entwined Shadows",    count: 3 },
    { name: "Little Newt",         count: 3 },
    { name: "Spirit Siphon",       count: 3 },
    { name: "Summoning Circle",    count: 3 },
    { name: "Symbol of Violence",  count: 3 },
    { name: "Tower Witch",         count: 3 },
    { name: "False Idol",          count: 3 },
  ],
  Eye: [
    { name: "Graveswap",           count: 2 },
    { name: "The Myriad",          count: 2 },
    { name: "Altar Familiar",      count: 3 },
    { name: "Graft",               count: 3 },
    { name: "Box of Limbs",        count: 3 },
    { name: "Eminence",            count: 3 },
    { name: "Eyeguy",              count: 3 },
    { name: "Focus Lens",          count: 3 },
    { name: "Follower of the Spiral",count: 3 },
    { name: "Grasp Possibility",   count: 3 },
    { name: "Peer Through the Veil",count: 3 },
    { name: "Vigil Horizon",       count: 3 },
    { name: "Death's Invitation",  count: 3 },
    { name: "The Singularity",     count: 3 },
  ],
};

let allCards = null;
let myDeck = {};
let resourceCounts = {};
let activeTab = "All";
let searchQuery = "";
let activeFilters = new Set();
let exclusiveFilter = false;

async function loadCards() {
  const grid = document.getElementById("grid");
  grid.innerHTML = '<div class="placeholder"><span class="spinner"></span> Loading cards…</div>';

  try {
    const res = await fetch("/api/cards");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allCards = await res.json();
  } catch (e) {
    grid.innerHTML = `<div class="placeholder error">
      <strong>Couldn't load cards</strong>
      <small>${e.message}</small>
    </div>`;
    return;
  }

  applyDeckFromUrl();
  renderFilterRow();
  renderGrid();
  renderSidebar();
}

function encodeDeck(deckObj) {
  const entries = Object.values(deckObj);
  if (!entries.length) return "";
  return btoa(entries.map(e => `${e.name}:${e.count}`).join(";"));
}

function encodeResourceCounts(counts, resourceCards) {
  const entries = resourceCards.filter(c => (counts[c.url] ?? 0) > 0);
  if (!entries.length) return "";
  return btoa(entries.map(c => `${c.name}:${counts[c.url]}`).join(";"));
}

function applyDeckFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const deckParam = params.get("deck");
  const resParam  = params.get("res");

  if (deckParam) {
    try {
      const allMainCards = FOLDERS.flatMap(folder => allCards.decks[folder] ?? []);
      myDeck = {};
      for (const part of atob(deckParam).split(";")) {
        const sep = part.lastIndexOf(":");
        if (sep === -1) continue;
        const name  = part.slice(0, sep);
        const count = parseInt(part.slice(sep + 1), 10);
        const card  = allMainCards.find(c => c.name === name);
        if (card && count > 0) myDeck[card.url] = { ...card, count };
      }
    } catch { /* malformed param */ }
  }

  if (resParam) {
    try {
      const resourceCards = allCards?.resources ?? [];
      resourceCounts = {};
      for (const part of atob(resParam).split(";")) {
        const sep = part.lastIndexOf(":");
        if (sep === -1) continue;
        const name  = part.slice(0, sep);
        const count = parseInt(part.slice(sep + 1), 10);
        const card  = resourceCards.find(c => c.name === name);
        if (card && count > 0) resourceCounts[card.url] = count;
      }
    } catch { /* malformed param */ }
  }
}

function renderNavTabs() {
  const deckTotal = Object.values(myDeck).reduce((s, e) => s + e.count, 0);
  const resTotal  = Object.values(resourceCounts).reduce((s, c) => s + c, 0);
  document.querySelectorAll(".nav-tab").forEach(btn => {
    const tab = btn.dataset.tab;
    btn.classList.toggle("active", tab === activeTab);
    if (tab === "All") {
      btn.innerHTML = `Main Deck <span class="nav-tab-note">${deckTotal}/${MAX_DECK}</span>`;
    } else if (tab === "Resource") {
      btn.innerHTML = `Resource Deck <span class="nav-tab-note">${resTotal}/${RESOURCE_DECK_SIZE}</span>`;
    }
  });
}

function renderFilterRow() {
  const el = document.getElementById("filter-row");
  if (!el) return;
  el.innerHTML = "";

  const pillGroup = document.createElement("div");
  pillGroup.className = "filter-pills";

  RESOURCES.forEach(resource => {
    const btn = document.createElement("button");
    btn.className = "filter-pill filter-" + resource + (activeFilters.has(resource) ? " active" : "");
    btn.textContent = resource;
    btn.addEventListener("click", () => {
      if (activeFilters.has(resource)) activeFilters.delete(resource);
      else activeFilters.add(resource);
      renderFilterRow();
      renderGrid();
    });
    pillGroup.appendChild(btn);
  });

  el.appendChild(pillGroup);

  const exclusiveLabel = document.createElement("label");
  exclusiveLabel.className = "exclusive-toggle";
  const exclusiveCheck = document.createElement("input");
  exclusiveCheck.type = "checkbox";
  exclusiveCheck.checked = exclusiveFilter;
  exclusiveCheck.addEventListener("change", e => {
    exclusiveFilter = e.target.checked;
    renderGrid();
  });
  exclusiveLabel.appendChild(exclusiveCheck);
  exclusiveLabel.append("exact");
  el.appendChild(exclusiveLabel);

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.id = "search-input";
  searchInput.placeholder = "search name, ability, artist…";
  searchInput.value = searchQuery;
  searchInput.addEventListener("input", e => {
    searchQuery = e.target.value;
    renderGrid();
  });
  el.appendChild(searchInput);
}

function loadStarterDeck(deckName) {
  const deck = STARTER_DECKS[deckName];
  if (!deck || !allCards) return;

  myDeck = {};
  const allMainCards = FOLDERS.flatMap(folder => allCards.decks[folder] ?? []);
  for (const { name, count } of deck) {
    const card = allMainCards.find(c => c.name === name);
    if (card) myDeck[card.url] = { ...card, count };
  }

  clearAtlasLink();
  if (activeTab !== "All") switchTab("All");
  else { renderGrid(); renderSidebar(); }
}

function switchTab(tab) {
  activeTab = tab;
  searchQuery = "";
  activeFilters.clear();
  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.value = "";
  renderNavTabs();
  renderFilterRow();
  renderGrid();
  renderSidebar();
}

function isResourceTab() {
  return activeTab === "Resource";
}

function isSearchActive() {
  return searchQuery.trim() !== "" || activeFilters.size > 0;
}

function cardSearchText(card) {
  return [
    card.name,
    card.type,
    card.artist,
    card.abilityText,
    ...(card.subtypes ?? []),
    ...(card.keywords ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function matchesFilter(card) {
  const query = searchQuery.toLowerCase().trim();
  const searchMatch = query === "" || cardSearchText(card).includes(query);
  let filterMatch = true;
  if (activeFilters.size > 0) {
    filterMatch = exclusiveFilter
      ? card.resources.length === activeFilters.size && card.resources.every(r => activeFilters.has(r))
      : card.resources.length > 0 && card.resources.every(r => activeFilters.has(r));
  }
  return searchMatch && filterMatch;
}

function renderGrid() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  if (isResourceTab()) {
    renderResourceGrid(grid);
    return;
  }

  const allMainCards = FOLDERS.flatMap(folder => allCards.decks[folder] ?? []);
  const cards = allMainCards.filter(matchesFilter);

  if (!cards.length) {
    grid.innerHTML = '<div class="placeholder">no cards found</div>';
    return;
  }

  cards.forEach(card => {
    const entry = myDeck[card.url];
    const count = entry?.count ?? 0;
    const isMaxed = count >= MAX_COPIES;

    const slot = document.createElement("div");
    slot.className = "card-slot" + (isMaxed ? " maxed" : "");

    const img = document.createElement("img");
    img.crossOrigin = "anonymous";
    img.src = card.url;
    slot.appendChild(img);

    if (count > 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = count;
      slot.appendChild(badge);
    }

    if (isMaxed) {
      const overlay = document.createElement("span");
      overlay.className = "max-overlay";
      overlay.textContent = "max";
      slot.appendChild(overlay);
    }

    slot.addEventListener("click", () => addCard(card));
    attachPreviewListeners(slot, card.url);
    grid.appendChild(slot);
  });
}

function renderResourceGrid(grid) {
  const cards = allCards?.resources ?? [];

  if (!cards.length) {
    grid.innerHTML = '<div class="placeholder">no resource cards</div>';
    return;
  }

  const filtered = isSearchActive() ? cards.filter(matchesFilter) : cards;

  if (!filtered.length) {
    grid.innerHTML = '<div class="placeholder">no matching cards</div>';
    return;
  }

  filtered.forEach(card => {
    const count = resourceCounts[card.url] ?? 0;
    const isPeculiar = card.resourceType === "peculiar";
    const isMaxed = isPeculiar && count >= RESOURCE_MAX_PECULIAR;

    const slot = document.createElement("div");
    slot.className = "card-slot" + (isMaxed ? " maxed" : "");

    const img = document.createElement("img");
    img.crossOrigin = "anonymous";
    img.src = card.url;
    slot.appendChild(img);

    if (count > 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = count;
      slot.appendChild(badge);
    }

    if (isMaxed) {
      const overlay = document.createElement("span");
      overlay.className = "max-overlay";
      overlay.textContent = "max";
      slot.appendChild(overlay);
    }

    slot.addEventListener("click", () => addResourceCard(card));
    attachPreviewListeners(slot, card.url);
    grid.appendChild(slot);
  });
}

function addCard(card) {
  const total = Object.values(myDeck).reduce((s, e) => s + e.count, 0);
  const entry = myDeck[card.url];
  const copies = entry?.count ?? 0;

  if (copies >= MAX_COPIES) {
    showWarning(`max ${MAX_COPIES} copies per card`);
    return;
  }
  if (total >= MAX_DECK) {
    showWarning(`deck full — max ${MAX_DECK} cards`);
    return;
  }

  if (entry) entry.count++;
  else myDeck[card.url] = { ...card, count: 1 };

  clearAtlasLink();
  renderGrid();
  renderSidebar();
}

function removeCard(cardUrl) {
  const entry = myDeck[cardUrl];
  if (!entry) return;
  if (entry.count > 1) entry.count--;
  else delete myDeck[cardUrl];
  clearAtlasLink();
  if (!isResourceTab()) renderGrid();
  renderSidebar();
}

function addResourceCard(card) {
  const total = Object.values(resourceCounts).reduce((s, c) => s + c, 0);
  const count = resourceCounts[card.url] ?? 0;

  if (card.resourceType === "peculiar" && count >= RESOURCE_MAX_PECULIAR) {
    showWarning(`max ${RESOURCE_MAX_PECULIAR} copies of a peculiar card`);
    return;
  }
  if (total >= RESOURCE_DECK_SIZE) {
    showWarning(`resource deck full — max ${RESOURCE_DECK_SIZE} cards`);
    return;
  }

  resourceCounts[card.url] = count + 1;
  clearAtlasLink();
  renderGrid();
  renderSidebar();
}

function removeResourceCard(cardUrl) {
  if ((resourceCounts[cardUrl] ?? 0) === 0) return;
  resourceCounts[cardUrl]--;
  if (resourceCounts[cardUrl] === 0) delete resourceCounts[cardUrl];
  clearAtlasLink();
  if (isResourceTab()) renderGrid();
  renderSidebar();
}

function showWarning(msg) {
  const el = document.getElementById("deck-warning");
  el.textContent = msg;
  el.classList.add("visible");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("visible"), 2200);
}

function deckResourceCost() {
  const totals = { Blood: 0, Heart: 0, Brain: 0, Soul: 0, Eye: 0 };
  for (const entry of Object.values(myDeck)) {
    if (!entry.cost) continue;
    for (const [res, n] of Object.entries(entry.cost)) {
      if (res in totals) totals[res] += n * entry.count;
    }
  }
  return totals;
}

function renderBreakdown(prefixLabel) {
  const breakdown = document.getElementById("deck-breakdown");
  const totals = deckResourceCost();
  const present = RESOURCES.filter(r => totals[r] > 0);

  if (!present.length) {
    breakdown.innerHTML = "";
    breakdown.style.display = "none";
    return;
  }

  const chips = present
    .map(r => `<span class="breakdown-chip"><span class="pip pip-${r}"></span>${totals[r]}</span>`)
    .join("");
  breakdown.innerHTML = (prefixLabel ? `<span class="breakdown-label">${prefixLabel}</span>` : "") + chips;
  breakdown.style.display = "flex";
}

function renderSidebar() {
  if (isResourceTab()) {
    renderResourceSidebar();
  } else {
    renderDeckSidebar();
  }

  renderNavTabs();
}

function renderDeckSidebar() {
  const total = Object.values(myDeck).reduce((s, e) => s + e.count, 0);

  document.getElementById("sidebar-title").textContent = "Your Deck";

  const totalEl = document.getElementById("card-total");
  totalEl.textContent = `${total} / ${MAX_DECK} card${total !== 1 ? "s" : ""}`;
  totalEl.className = total >= MAX_DECK ? "at-max" : "";

  document.getElementById("export-btn").disabled = total === 0;
  document.getElementById("export-btn").style.display = "";
  document.getElementById("export-resource-btn").style.display = "none";

  renderBreakdown();

  const list = document.getElementById("deck-list");
  list.innerHTML = "";
  Object.values(myDeck).forEach(entry => {
    list.appendChild(makeDeckRow(
      entry.url,
      entry.name,
      entry.count,
      () => removeCard(entry.url),
      () => addCard(entry),
    ));
  });
}

function renderResourceSidebar() {
  const resTotal = Object.values(resourceCounts).reduce((s, c) => s + c, 0);
  const isComplete = resTotal === RESOURCE_DECK_SIZE;

  document.getElementById("sidebar-title").textContent = "Resource Deck";

  const totalEl = document.getElementById("card-total");
  totalEl.textContent = `${resTotal} / ${RESOURCE_DECK_SIZE} cards`;
  totalEl.className = isComplete ? "complete" : "";

  document.getElementById("export-btn").style.display = "none";
  const resExportBtn = document.getElementById("export-resource-btn");
  resExportBtn.style.display = "";
  resExportBtn.disabled = !isComplete;

  renderBreakdown("main deck:");

  const list = document.getElementById("deck-list");
  list.innerHTML = "";
  const resourceCards = allCards?.resources ?? [];
  resourceCards.forEach(card => {
    const count = resourceCounts[card.url] ?? 0;
    if (count === 0) return;
    list.appendChild(makeDeckRow(
      card.url,
      card.name,
      count,
      () => removeResourceCard(card.url),
      () => addResourceCard(card),
    ));
  });
}

function makeDeckRow(imgSrc, label, count, onMinus, onPlus) {
  const row = document.createElement("div");
  row.className = "deck-row";

  const img = document.createElement("img");
  img.crossOrigin = "anonymous";
  img.src = imgSrc;

  const name = document.createElement("span");
  name.className = "deck-row-name";
  name.textContent = label;



  const minus = document.createElement("button");
  minus.textContent = "−";
  minus.addEventListener("click", onMinus);

  const countSpan = document.createElement("span");
  countSpan.className = "count";
  countSpan.textContent = count;

  const plus = document.createElement("button");
  plus.textContent = "+";
  plus.addEventListener("click", onPlus);

  const controls = document.createElement("div");
  controls.className = "deck-row-controls";
  controls.append(minus, countSpan, plus);

  row.append(img, name, controls);
  return row;
}

function buildAtlasBlob(imageUrls, backUrl = null) {
  return new Promise(resolve => {
    const maxSlots = ATLAS_COLS * ATLAS_ROWS;
    const flat = imageUrls.slice();
    if (flat.length > maxSlots - 1) flat.length = maxSlots - 1;

    const imgs = flat.map(url => Object.assign(new Image(), { crossOrigin: "anonymous", src: url }));
    const backImg = backUrl ? Object.assign(new Image(), { crossOrigin: "anonymous", src: backUrl }) : null;

    const all = [...imgs, ...(backImg ? [backImg] : [])];
    Promise.all(all.map(i => i.complete ? Promise.resolve() : new Promise(r => { i.onload = r; i.onerror = r; })))
      .then(() => {
        const cardW = imgs[0].naturalWidth;
        const cardH = imgs[0].naturalHeight;

        const atlas = document.createElement("canvas");
        atlas.width  = ATLAS_COLS * cardW;
        atlas.height = ATLAS_ROWS * cardH;
        const ctx = atlas.getContext("2d");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, atlas.width, atlas.height);

        imgs.forEach((img, i) => {
          ctx.drawImage(img, (i % ATLAS_COLS) * cardW, Math.floor(i / ATLAS_COLS) * cardH, cardW, cardH);
        });

        if (backImg) {
          const last = maxSlots - 1;
          ctx.drawImage(backImg, (last % ATLAS_COLS) * cardW, Math.floor(last / ATLAS_COLS) * cardH, cardW, cardH);
        }

        atlas.toBlob(resolve, "image/png");
      });
  });
}

function showAtlasLink(url) {
  const row = document.getElementById("atlas-link-row");
  document.getElementById("atlas-link-input").value = url;
  row.style.display = "flex";
}

function clearAtlasLink() {
  const row = document.getElementById("atlas-link-row");
  row.style.display = "none";
  document.getElementById("atlas-link-input").value = "";
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => copyTextFallback(text));
  }
  return copyTextFallback(text);
}

function copyTextFallback(text) {
  const ta = Object.assign(document.createElement("textarea"), {
    value: text,
    style: "position:fixed;opacity:0",
  });
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

let _imgbbKey = null;
async function getImgbbKey() {
  if (_imgbbKey) return _imgbbKey;
  const r = await fetch("/api/imgbb-key");
  if (!r.ok) throw new Error("key endpoint failed");
  ({ key: _imgbbKey } = await r.json());
  return _imgbbKey;
}

async function uploadAtlasAndCopyLink(imageUrls, backUrl, btnId) {
  const btn = document.getElementById(btnId);
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Uploading…";

  try {
    const [blob, key] = await Promise.all([
      buildAtlasBlob(imageUrls, backUrl),
      getImgbbKey(),
    ]);

    const base64 = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });

    const form = new URLSearchParams({ key, image: base64 });
    const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
    if (!res.ok) throw new Error(`imgbb HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("imgbb rejected upload");

    await copyText(data.data.url);
    showAtlasLink(data.data.url);
    btn.textContent = "Link copied!";
  } catch (e) {
    console.error(e);
    btn.textContent = "Upload failed";
  } finally {
    setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 2000);
  }
}

async function exportAtlas() {
  const flat = [];
  for (const entry of Object.values(myDeck)) {
    for (let i = 0; i < entry.count; i++) flat.push(entry.url);
  }
  if (!flat.length) return;
  await uploadAtlasAndCopyLink(flat, allCards?.backs?.main ?? null, "export-btn");
}

async function exportResourceAtlas() {
  const flat = [];
  const resourceCards = allCards?.resources ?? [];
  resourceCards.forEach(card => {
    const count = resourceCounts[card.url] ?? 0;
    for (let j = 0; j < count; j++) flat.push(card.url);
  });
  if (!flat.length) return;
  await uploadAtlasAndCopyLink(flat, allCards?.backs?.resource ?? null, "export-resource-btn");
}

// ---- card preview (Z + hover) ----

let hoveredImgSrc = null;
let mouseX = 0, mouseY = 0;
let zHeld = false;

const PREVIEW_SIZE_MIN = 20; // vh
const PREVIEW_SIZE_MAX = 90; // vh
const PREVIEW_SIZE_DEFAULT = 48; // vh
let previewSizeVh = PREVIEW_SIZE_DEFAULT;

const previewEl = document.createElement("div");
previewEl.id = "card-preview";
const previewImg = document.createElement("img");
previewEl.appendChild(previewImg);
document.body.appendChild(previewEl);

document.addEventListener("mousemove", e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (previewEl.classList.contains("visible")) positionPreview();
});

document.addEventListener("keydown", e => {
  if ((e.key === "z" || e.key === "Z") && !e.shiftKey && !zHeld) {
    zHeld = true;
    e.preventDefault();
    if (hoveredImgSrc) showPreview(hoveredImgSrc);
  }
});

document.addEventListener("keyup", e => {
  if (e.key === "z" || e.key === "Z") {
    zHeld = false;
    hidePreview();
  }
});

document.addEventListener("wheel", e => {
  if (!zHeld || !previewEl.classList.contains("visible")) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -3 : 3;
  previewSizeVh = Math.min(PREVIEW_SIZE_MAX, Math.max(PREVIEW_SIZE_MIN, previewSizeVh + delta));
  previewImg.style.height = previewSizeVh + "vh";
  positionPreview();
}, { passive: false });

function showPreview(src) {
  previewImg.src = src;
  previewImg.style.height = previewSizeVh + "vh";
  previewEl.classList.add("visible");
  positionPreview();
}

function hidePreview() {
  previewEl.classList.remove("visible");
}

function positionPreview() {
  const pw = previewEl.offsetWidth;
  const ph = previewEl.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const offset = 18;

  let x = mouseX + offset;
  if (x + pw > vw - 10) x = mouseX - pw - offset;

  let y = mouseY - ph / 2;
  if (y < 10) y = 10;
  if (y + ph > vh - 10) y = vh - ph - 10;

  previewEl.style.left = x + "px";
  previewEl.style.top  = y + "px";
}

function attachPreviewListeners(slot, imgSrc) {
  slot.addEventListener("mouseenter", e => {
    hoveredImgSrc = imgSrc;
    if (e.key === "Z") showPreview(imgSrc);
  });
  slot.addEventListener("mouseleave", () => {
    hoveredImgSrc = null;
    hidePreview();
  });
}

function copyDeckLink() {
  const url = new URL(window.location.href);
  url.search = "";

  const deckEncoded = encodeDeck(myDeck);
  if (deckEncoded) url.searchParams.set("deck", deckEncoded);

  const resourceCards = allCards?.resources ?? [];
  const resEncoded = encodeResourceCounts(resourceCounts, resourceCards);
  if (resEncoded) url.searchParams.set("res", resEncoded);

  copyText(url.toString());

  const btn = document.getElementById("share-btn");
  const orig = btn.textContent;
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

document.addEventListener("DOMContentLoaded", () => {
  loadCards();

  document.querySelectorAll(".nav-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll(".starter-deck-btn").forEach(btn => {
    btn.addEventListener("click", () => loadStarterDeck(btn.dataset.deck));
  });

  document.getElementById("share-btn").addEventListener("click", copyDeckLink);
  document.getElementById("export-btn").addEventListener("click", exportAtlas);
  document.getElementById("export-resource-btn").addEventListener("click", exportResourceAtlas);
  document.getElementById("atlas-link-copy").addEventListener("click", () => {
    const url = document.getElementById("atlas-link-input").value;
    if (!url) return;
    copyText(url);
    const btn = document.getElementById("atlas-link-copy");
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });

  document.getElementById("clear-btn").addEventListener("click", () => {
    if (isResourceTab()) {
      if (Object.keys(resourceCounts).length === 0) return;
      resourceCounts = {};
      clearAtlasLink();
      renderGrid();
      renderSidebar();
    } else {
      if (Object.keys(myDeck).length === 0) return;
      myDeck = {};
      clearAtlasLink();
      renderGrid();
      renderSidebar();
    }
  });
});
