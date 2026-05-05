const ATLAS_COLS = 10;
const ATLAS_ROWS = 7;

let decks = [];
let myDeck = [];
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
    decks = await res.json();
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
  decks.forEach((deck, i) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (i === activeTab ? " active" : "");
    const note = deck.error ? "error" : `${deck.faces?.length ?? 0} cards`;
    btn.innerHTML = `${deck.name} <span style="font-size:0.7em;opacity:0.6">(${note})</span>`;
    btn.addEventListener("click", () => {
      activeTab = i;
      document.querySelectorAll(".tab").forEach((t, j) =>
        t.classList.toggle("active", j === i)
      );
      renderGrid(i);
    });
    el.appendChild(btn);
  });
}

function renderGrid(idx) {
  const grid = document.getElementById("grid");
  const deck = decks[idx];
  grid.innerHTML = "";

  if (deck?.error) {
    grid.innerHTML = `<div class="placeholder error"><strong>failed to load this deck</strong><small>${deck.error}</small></div>`;
    return;
  }

  const faces = deck?.faces ?? [];
  if (!faces.length) {
    grid.innerHTML = '<div class="placeholder">no cards</div>';
    return;
  }

  faces.forEach((dataUrl, cardIdx) => {
    const entry = myDeck.find(c => c.deckIdx === idx && c.cardIdx === cardIdx);
    const count = entry?.count ?? 0;

    const slot = document.createElement("div");
    slot.className = "card-slot";

    const img = document.createElement("img");
    img.src = dataUrl;
    slot.appendChild(img);

    if (count > 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = count;
      slot.appendChild(badge);
    }

    slot.addEventListener("click", () => addCard(idx, cardIdx));
    grid.appendChild(slot);
  });
}

function addCard(deckIdx, cardIdx) {
  const existing = myDeck.find(c => c.deckIdx === deckIdx && c.cardIdx === cardIdx);
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
  renderGrid(activeTab);
  renderSidebar();
}

function renderSidebar() {
  const list = document.getElementById("deck-list");
  const total = myDeck.reduce((s, c) => s + c.count, 0);

  document.getElementById("card-total").textContent =
    `${total} card${total !== 1 ? "s" : ""}`;
  document.getElementById("export-btn").disabled = total === 0;

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

function exportAtlas() {
  const flat = [];
  for (const { deckIdx, cardIdx, count } of myDeck) {
    const url = decks[deckIdx]?.faces?.[cardIdx];
    if (url) {
      for (let i = 0; i < count; i++) flat.push(url);
    }
  }
  if (!flat.length) return;

  const maxSlots = ATLAS_COLS * ATLAS_ROWS;
  if (flat.length > maxSlots - 1) flat.length = maxSlots - 1;

  const imgs = flat.map(url => Object.assign(new Image(), { src: url }));
  const backUrl = decks.find(d => d.back)?.back ?? null;
  const backImg = backUrl ? Object.assign(new Image(), { src: backUrl }) : null;

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
        download: "my-deck-atlas.png",
      });
      a.click();
    }, "image/png");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadCardsJson();
  document.getElementById("export-btn").addEventListener("click", exportAtlas);
  document.getElementById("clear-btn").addEventListener("click", () => {
    if (!myDeck.length) return;
    myDeck = [];
    renderGrid(activeTab);
    renderSidebar();
  });
});
