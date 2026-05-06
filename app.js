const ATLAS_COLS = 10;
const ATLAS_ROWS = 7;
const MAX_DECK = 40;
const MAX_COPIES = 3;
const RESOURCE_DECK_SIZE = 20;

let decks = [];
let resources = { faces: [], back: null };
let myDeck = [];
let resourceCounts = [];
let activeTab = 0;

async function loadCardsJson() {
  const grid = document.getElementById("grid");

  if (location.protocol === "file:") {
    grid.innerHTML = `<div class="placeholder error">
      <strong>open this via a local server, not file://</strong>
      <small>run: <code>python3 -m http.server</code> then open http://localhost:8000</small>
    </div>`;
    return;
  }

  grid.innerHTML = '<div class="placeholder"><span class="spinner"></span> loading cards…</div>';

  try {
    const res = await fetch("./cards.json");
    if (res.status === 404) {
      grid.innerHTML = `<div class="placeholder error">
        <strong>cards.json not found</strong>
        <small>run <code>python3 generate_cards.py</code> first</small>
      </div>`;
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    decks = data.decks ?? data; // backward compat with old array-only format
    resources = data.resources ?? { faces: [], back: null };
    resourceCounts = resources.faces.map(() => 0);
  } catch (e) {
    grid.innerHTML = `<div class="placeholder error">
      <strong>couldn't load cards.json</strong>
      <small>${e.message}</small>
    </div>`;
    return;
  }

  renderTabs();
  renderGrid(0);
}

function renderTabs() {
  const el = document.getElementById("tabs");
  el.innerHTML = "";
  const resIdx = decks.length;

  decks.forEach((deck, i) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (i === activeTab ? " active" : "");
    const note = deck.error ? "error" : `${deck.faces?.length ?? 0} cards`;
    btn.innerHTML = `${deck.name} <span class="tab-note">(${note})</span>`;
    btn.addEventListener("click", () => switchTab(i));
    el.appendChild(btn);
  });

  const resBtn = document.createElement("button");
  const resTotal = resourceCounts.reduce((s, c) => s + c, 0);
  resBtn.className = "tab res-tab" + (activeTab === resIdx ? " active" : "");
  resBtn.innerHTML = `resource deck <span class="tab-note">(${resTotal}/${RESOURCE_DECK_SIZE})</span>`;
  resBtn.addEventListener("click", () => switchTab(resIdx));
  el.appendChild(resBtn);
}

function switchTab(idx) {
  activeTab = idx;
  document.querySelectorAll(".tab").forEach((t, j) =>
    t.classList.toggle("active", j === idx)
  );
  renderGrid(idx);
}

function renderGrid(idx) {
  const grid = document.getElementById("grid");

  if (idx === decks.length) {
    grid.classList.add("resource-mode");
    renderResourceView(grid);
    return;
  }

  grid.classList.remove("resource-mode");
  grid.innerHTML = "";

  const deck = decks[idx];
  if (deck?.error) {
    grid.innerHTML = `<div class="placeholder error"><strong>failed to load this deck</strong><small>${deck.error}</small></div>`;
    return;
  }

  const faces = deck?.faces ?? [];
  if (!faces.length) {
    grid.innerHTML = '<div class="placeholder">no cards</div>';
    return;
  }

  const totalCards = myDeck.reduce((s, c) => s + c.count, 0);
  const deckFull = totalCards >= MAX_DECK;

  faces.forEach((dataUrl, cardIdx) => {
    const entry = myDeck.find(c => c.deckIdx === idx && c.cardIdx === cardIdx);
    const count = entry?.count ?? 0;
    const isMaxed = count >= MAX_COPIES;

    const slot = document.createElement("div");
    slot.className = "card-slot" + (isMaxed ? " maxed" : "");

    const img = document.createElement("img");
    img.src = dataUrl;
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

    slot.addEventListener("click", () => addCard(idx, cardIdx));
    grid.appendChild(slot);
  });
}

function renderResourceView(grid) {
  grid.innerHTML = "";

  const resTotal = resourceCounts.reduce((s, c) => s + c, 0);
  const isComplete = resTotal === RESOURCE_DECK_SIZE;
  const isOver = resTotal > RESOURCE_DECK_SIZE;

  const intro = document.createElement("div");
  intro.className = "resource-intro";

  const totalClass = isComplete ? "res-total complete" : isOver ? "res-total over" : "res-total";
  intro.innerHTML = `
    <p>pick your 20 resource cards — refer to your main deck in the sidebar to guide your split</p>
    <div class="resource-total-bar">
      <span class="${totalClass}">${resTotal} / ${RESOURCE_DECK_SIZE}</span>
      ${isComplete ? '<span class="res-ok">✓ ready to export</span>' : ''}
    </div>
  `;
  grid.appendChild(intro);

  if (!resources.faces.length) {
    const msg = document.createElement("div");
    msg.className = "placeholder" + (resources.error ? " error" : "");
    msg.textContent = resources.error
      ? `failed to load resource cards: ${resources.error}`
      : "no resource cards found — regenerate cards.json";
    grid.appendChild(msg);
    return;
  }

  const cards = document.createElement("div");
  cards.className = "resource-cards";

  resources.faces.forEach((dataUrl, i) => {
    const item = document.createElement("div");
    item.className = "res-card-item";

    const img = document.createElement("img");
    img.src = dataUrl;
    item.appendChild(img);

    const label = document.createElement("div");
    label.className = "res-deck-name";
    label.textContent = `resource ${i + 1}`;
    item.appendChild(label);

    const controls = document.createElement("div");
    controls.className = "res-controls";

    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.disabled = resourceCounts[i] === 0;
    minus.addEventListener("click", () => {
      if (resourceCounts[i] > 0) {
        resourceCounts[i]--;
        renderResourceView(grid);
        updateResourceTabLabel();
        renderSidebar();
      }
    });

    const countSpan = document.createElement("span");
    countSpan.className = "res-count";
    countSpan.textContent = resourceCounts[i];

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.disabled = resTotal >= RESOURCE_DECK_SIZE;
    plus.addEventListener("click", () => {
      const cur = resourceCounts.reduce((s, c) => s + c, 0);
      if (cur < RESOURCE_DECK_SIZE) {
        resourceCounts[i]++;
        renderResourceView(grid);
        updateResourceTabLabel();
        renderSidebar();
      }
    });

    controls.append(minus, countSpan, plus);
    item.appendChild(controls);
    cards.appendChild(item);
  });

  grid.appendChild(cards);

  const exportBtn = document.createElement("button");
  exportBtn.className = "res-export-btn";
  exportBtn.textContent = "export resource atlas";
  exportBtn.disabled = !isComplete;
  exportBtn.addEventListener("click", exportResourceAtlas);
  grid.appendChild(exportBtn);
}

function updateResourceTabLabel() {
  const tabs = document.querySelectorAll(".tab");
  const resIdx = decks.length;
  const resTotal = resourceCounts.reduce((s, c) => s + c, 0);
  if (tabs[resIdx]) {
    tabs[resIdx].innerHTML = `resource deck <span class="tab-note">(${resTotal}/${RESOURCE_DECK_SIZE})</span>`;
  }
}

function showWarning(msg) {
  const el = document.getElementById("deck-warning");
  el.textContent = msg;
  el.classList.add("visible");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("visible"), 2200);
}

function addCard(deckIdx, cardIdx) {
  const total = myDeck.reduce((s, c) => s + c.count, 0);
  const existing = myDeck.find(c => c.deckIdx === deckIdx && c.cardIdx === cardIdx);
  const copies = existing?.count ?? 0;

  if (copies >= MAX_COPIES) {
    showWarning(`max ${MAX_COPIES} copies per card`);
    return;
  }
  if (total >= MAX_DECK) {
    showWarning(`deck full — max ${MAX_DECK} cards`);
    return;
  }

  if (existing) existing.count++;
  else myDeck.push({ deckIdx, cardIdx, count: 1 });
  renderGrid(activeTab);
  renderSidebar();
}

function removeCard(deckIdx, cardIdx) {
  const i = myDeck.findIndex(c => c.deckIdx === deckIdx && c.cardIdx === cardIdx);
  if (i === -1) return;
  if (myDeck[i].count > 1) myDeck[i].count--;
  else myDeck.splice(i, 1);
  if (activeTab < decks.length) renderGrid(activeTab);
  renderSidebar();
}

function renderSidebar() {
  const list = document.getElementById("deck-list");
  const breakdown = document.getElementById("deck-breakdown");
  const total = myDeck.reduce((s, c) => s + c.count, 0);

  const totalEl = document.getElementById("card-total");
  totalEl.textContent = `${total} / ${MAX_DECK} card${total !== 1 ? "s" : ""}`;
  totalEl.className = total >= MAX_DECK ? "at-max" : "";

  document.getElementById("export-btn").disabled = total === 0;

  const resTotal = resourceCounts.reduce((s, c) => s + c, 0);
  document.getElementById("export-resource-btn").disabled = resTotal !== RESOURCE_DECK_SIZE;

  // Deck breakdown (helpful when building resource deck)
  if (total > 0) {
    const counts = decks.map((deck, di) => ({
      name: deck.name,
      count: myDeck.filter(c => c.deckIdx === di).reduce((s, c) => s + c.count, 0),
    })).filter(d => d.count > 0);

    breakdown.innerHTML = counts
      .map(d => `<span class="breakdown-chip">${d.name} <strong>${d.count}</strong></span>`)
      .join("");
    breakdown.style.display = "flex";
  } else {
    breakdown.innerHTML = "";
    breakdown.style.display = "none";
  }

  list.innerHTML = "";
  myDeck.forEach(({ deckIdx, cardIdx, count }) => {
    const dataUrl = decks[deckIdx]?.faces?.[cardIdx];
    if (!dataUrl) return;

    const row = document.createElement("div");
    row.className = "deck-row";

    const img = document.createElement("img");
    img.src = dataUrl;

    const name = document.createElement("span");
    name.className = "deck-row-name";
    name.textContent = `${decks[deckIdx].name} #${cardIdx + 1}`;

    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.addEventListener("click", () => removeCard(deckIdx, cardIdx));

    const countSpan = document.createElement("span");
    countSpan.className = "count";
    countSpan.textContent = count;

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.addEventListener("click", () => addCard(deckIdx, cardIdx));

    const controls = document.createElement("div");
    controls.className = "deck-row-controls";
    controls.append(minus, countSpan, plus);

    row.append(img, name, controls);
    list.appendChild(row);
  });
}

function buildAndDownloadAtlas(imageUrls, filename, backUrl = null) {
  const maxSlots = ATLAS_COLS * ATLAS_ROWS;
  const flat = imageUrls.slice();
  if (flat.length > maxSlots - 1) flat.length = maxSlots - 1;

  const imgs = flat.map(url => Object.assign(new Image(), { src: url }));
  const resolvedBack = backUrl ?? decks.find(d => d.back)?.back ?? null;
  const backImg = resolvedBack ? Object.assign(new Image(), { src: resolvedBack }) : null;

  const all = [...imgs, ...(resolvedBack ? [backImg] : [])];
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
  for (const { deckIdx, cardIdx, count } of myDeck) {
    const url = decks[deckIdx]?.faces?.[cardIdx];
    if (url) for (let i = 0; i < count; i++) flat.push(url);
  }
  if (!flat.length) return;
  buildAndDownloadAtlas(flat, "my-deck-atlas.png");
}

function exportResourceAtlas() {
  const flat = [];
  resources.faces.forEach((dataUrl, i) => {
    for (let j = 0; j < resourceCounts[i]; j++) flat.push(dataUrl);
  });
  if (!flat.length) return;
  buildAndDownloadAtlas(flat, "resource-deck-atlas.png", resources.back);
}

async function triggerRefresh() {
  const btn = document.getElementById("refresh-btn");
  const msg = document.getElementById("refresh-msg");

  btn.disabled = true;
  msg.style.color = "var(--muted)";
  msg.textContent = "triggering workflow…";

  try {
    const res = await fetch("/api/refresh", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      msg.textContent = "workflow started — takes ~30s, then reload the page";
      setTimeout(() => { btn.disabled = false; msg.textContent = ""; }, 60000);
    } else {
      throw new Error(data.error || res.status);
    }
  } catch (e) {
    msg.textContent = `failed: ${e.message}`;
    msg.style.color = "var(--danger)";
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadCardsJson();
  document.getElementById("export-btn").addEventListener("click", exportAtlas);
  document.getElementById("export-resource-btn").addEventListener("click", exportResourceAtlas);
  document.getElementById("refresh-btn").addEventListener("click", triggerRefresh);
  document.getElementById("clear-btn").addEventListener("click", () => {
    if (!myDeck.length) return;
    myDeck = [];
    if (activeTab < decks.length) renderGrid(activeTab);
    renderSidebar();
  });
});
