const ATLAS_COLS = 10;
const ATLAS_ROWS = 7;
const MAX_DECK = 40;
const MAX_COPIES = 3;
const RESOURCE_DECK_SIZE = 20;

const FOLDERS = ["Blood", "Heart", "Brain", "Soul", "Eye", "Multi"];

let allCards = null;
let myDeck = {};
let resourceCounts = {};
let activeTab = "Blood";
let searchQuery = "";
let activeFilters = new Set();

async function loadCards() {
  const grid = document.getElementById("grid");
  grid.innerHTML = '<div class="placeholder"><span class="spinner"></span> loading cards…</div>';

  try {
    const res = await fetch("/api/cards");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allCards = await res.json();
  } catch (e) {
    grid.innerHTML = `<div class="placeholder error">
      <strong>couldn't load cards</strong>
      <small>${e.message}</small>
    </div>`;
    return;
  }

  renderTabs();
  renderFilterRow();
  renderGrid();
  renderSidebar();
}

function renderTabs() {
  const el = document.getElementById("tabs");
  el.innerHTML = "";

  FOLDERS.forEach(folder => {
    const btn = document.createElement("button");
    const count = allCards.decks[folder]?.length ?? 0;
    btn.className = "tab" + (activeTab === folder ? " active" : "");
    btn.innerHTML = `${folder} <span class="tab-note">(${count})</span>`;
    btn.addEventListener("click", () => switchTab(folder));
    el.appendChild(btn);
  });

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.id = "search-input";
  searchInput.placeholder = "search cards…";
  searchInput.value = searchQuery;
  searchInput.addEventListener("input", e => {
    searchQuery = e.target.value;
    renderGrid();
  });
  el.appendChild(searchInput);

  const resTotal = Object.values(resourceCounts).reduce((s, c) => s + c, 0);
  const resBtn = document.createElement("button");
  resBtn.className = "tab res-tab" + (activeTab === "Resource" ? " active" : "");
  resBtn.innerHTML = `resource deck <span class="tab-note">(${resTotal}/${RESOURCE_DECK_SIZE})</span>`;
  resBtn.addEventListener("click", () => switchTab("Resource"));
  el.appendChild(resBtn);
}

function renderFilterRow() {
  const el = document.getElementById("filter-row");
  if (!el) return;
  el.innerHTML = "";

  const pills = [
    { code: "Bl", label: "Bl" },
    { code: "H", label: "H" },
    { code: "Br", label: "Br" },
    { code: "S", label: "S" },
    { code: "E", label: "E" },
  ];

  pills.forEach(({ code, label }) => {
    const btn = document.createElement("button");
    btn.className = "filter-pill filter-" + code + (activeFilters.has(code) ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      if (activeFilters.has(code)) activeFilters.delete(code);
      else activeFilters.add(code);
      renderFilterRow();
      renderGrid();
    });
    el.appendChild(btn);
  });
}

function switchTab(tab) {
  activeTab = tab;
  searchQuery = "";
  activeFilters.clear();
  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.value = "";
  renderTabs();
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

function matchesFilter(card) {
  const nameMatch = card.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
  const filterMatch = activeFilters.size === 0 || card.resources.some(r => activeFilters.has(r));
  return nameMatch && filterMatch;
}

function renderGrid() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  if (isResourceTab()) {
    renderResourceGrid(grid);
    return;
  }

  let cards;
  let showFolderTag = false;

  if (isSearchActive()) {
    cards = FOLDERS.flatMap(folder => allCards.decks[folder] ?? []).filter(matchesFilter);
    showFolderTag = true;
  } else {
    cards = allCards.decks[activeTab] ?? [];
  }

  if (!cards.length) {
    grid.innerHTML = '<div class="placeholder">no cards</div>';
    return;
  }

  const totalCards = Object.values(myDeck).reduce((s, e) => s + e.count, 0);

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

    if (showFolderTag) {
      const tag = document.createElement("span");
      tag.className = "folder-tag";
      tag.textContent = card.folder;
      slot.appendChild(tag);
    }

    slot.addEventListener("click", () => addCard(card));
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

    const slot = document.createElement("div");
    slot.className = "card-slot";

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

    slot.addEventListener("click", () => addResourceCard(card));
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
  else myDeck[card.url] = { url: card.url, name: card.name, folder: card.folder, resources: card.resources, count: 1 };

  renderGrid();
  renderSidebar();
}

function removeCard(cardUrl) {
  const entry = myDeck[cardUrl];
  if (!entry) return;
  if (entry.count > 1) entry.count--;
  else delete myDeck[cardUrl];
  if (!isResourceTab()) renderGrid();
  renderSidebar();
}

function addResourceCard(card) {
  const total = Object.values(resourceCounts).reduce((s, c) => s + c, 0);

  if (total >= RESOURCE_DECK_SIZE) {
    showWarning(`resource deck full — max ${RESOURCE_DECK_SIZE} cards`);
    return;
  }

  resourceCounts[card.url] = (resourceCounts[card.url] ?? 0) + 1;
  renderGrid();
  renderSidebar();
}

function removeResourceCard(cardUrl) {
  if ((resourceCounts[cardUrl] ?? 0) === 0) return;
  resourceCounts[cardUrl]--;
  if (resourceCounts[cardUrl] === 0) delete resourceCounts[cardUrl];
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

function renderSidebar() {
  if (isResourceTab()) {
    renderResourceSidebar();
  } else {
    renderDeckSidebar();
  }

  const tabs = document.querySelectorAll(".tab");
  const resTab = [...tabs].find(t => t.classList.contains("res-tab"));
  if (resTab) {
    const resTotal = Object.values(resourceCounts).reduce((s, c) => s + c, 0);
    resTab.innerHTML = `resource deck <span class="tab-note">(${resTotal}/${RESOURCE_DECK_SIZE})</span>`;
  }
}

function renderDeckSidebar() {
  const total = Object.values(myDeck).reduce((s, e) => s + e.count, 0);

  document.getElementById("sidebar-title").textContent = "your deck";

  const totalEl = document.getElementById("card-total");
  totalEl.textContent = `${total} / ${MAX_DECK} card${total !== 1 ? "s" : ""}`;
  totalEl.className = total >= MAX_DECK ? "at-max" : "";

  document.getElementById("export-btn").disabled = total === 0;
  document.getElementById("export-btn").style.display = "";
  document.getElementById("export-resource-btn").style.display = "none";

  const breakdown = document.getElementById("deck-breakdown");
  if (total > 0) {
    const counts = FOLDERS.map(folder => ({
      name: folder,
      count: Object.values(myDeck)
        .filter(e => e.folder === folder)
        .reduce((s, e) => s + e.count, 0),
    })).filter(d => d.count > 0);
    breakdown.innerHTML = counts
      .map(d => `<span class="breakdown-chip">${d.name} <strong>${d.count}</strong></span>`)
      .join("");
    breakdown.style.display = "flex";
  } else {
    breakdown.innerHTML = "";
    breakdown.style.display = "none";
  }

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

  document.getElementById("sidebar-title").textContent = "resource deck";

  const totalEl = document.getElementById("card-total");
  totalEl.textContent = `${resTotal} / ${RESOURCE_DECK_SIZE} cards`;
  totalEl.className = isComplete ? "complete" : "";

  document.getElementById("export-btn").style.display = "none";
  const resExportBtn = document.getElementById("export-resource-btn");
  resExportBtn.style.display = "";
  resExportBtn.disabled = !isComplete;

  const breakdown = document.getElementById("deck-breakdown");
  const total = Object.values(myDeck).reduce((s, e) => s + e.count, 0);
  if (total > 0) {
    const counts = FOLDERS.map(folder => ({
      name: folder,
      count: Object.values(myDeck)
        .filter(e => e.folder === folder)
        .reduce((s, e) => s + e.count, 0),
    })).filter(d => d.count > 0);
    breakdown.innerHTML = `<span class="breakdown-label">main deck:</span>` + counts
      .map(d => `<span class="breakdown-chip">${d.name} <strong>${d.count}</strong></span>`)
      .join("");
    breakdown.style.display = "flex";
  } else {
    breakdown.innerHTML = "";
    breakdown.style.display = "none";
  }

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

function buildAndDownloadAtlas(imageUrls, filename, backUrl = null) {
  const maxSlots = ATLAS_COLS * ATLAS_ROWS;
  const flat = imageUrls.slice();
  if (flat.length > maxSlots - 1) flat.length = maxSlots - 1;

  const imgs = flat.map(url => Object.assign(new Image(), { crossOrigin: "anonymous", src: url }));
  const backImg = backUrl ? Object.assign(new Image(), { crossOrigin: "anonymous", src: backUrl }) : null;

  const all = [...imgs, ...(backImg ? [backImg] : [])];
  Promise.all(
    all.map(i => i.complete
      ? Promise.resolve()
      : new Promise(r => { i.onload = r; i.onerror = r; })
    )
  ).then(() => {
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

    atlas.toBlob(blob => {
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: filename,
      });
      a.click();
    }, "image/png");
  });
}

function exportAtlas() {
  const flat = [];
  for (const entry of Object.values(myDeck)) {
    for (let i = 0; i < entry.count; i++) flat.push(entry.url);
  }
  if (!flat.length) return;
  buildAndDownloadAtlas(flat, "my-deck-atlas.png", allCards?.backs?.main ?? null);
}

function exportResourceAtlas() {
  const flat = [];
  const resourceCards = allCards?.resources ?? [];
  resourceCards.forEach(card => {
    const count = resourceCounts[card.url] ?? 0;
    for (let j = 0; j < count; j++) flat.push(card.url);
  });
  if (!flat.length) return;
  buildAndDownloadAtlas(flat, "resource-deck-atlas.png", allCards?.backs?.resource ?? null);
}

document.addEventListener("DOMContentLoaded", () => {
  loadCards();
  document.getElementById("export-btn").addEventListener("click", exportAtlas);
  document.getElementById("export-resource-btn").addEventListener("click", exportResourceAtlas);
  document.getElementById("refresh-btn").addEventListener("click", loadCards);
  document.getElementById("clear-btn").addEventListener("click", () => {
    if (isResourceTab()) {
      if (Object.keys(resourceCounts).length === 0) return;
      resourceCounts = {};
      renderGrid();
      renderSidebar();
    } else {
      if (Object.keys(myDeck).length === 0) return;
      myDeck = {};
      renderGrid();
      renderSidebar();
    }
  });
});
