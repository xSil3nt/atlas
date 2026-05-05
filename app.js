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

document.addEventListener("DOMContentLoaded", loadCardsJson);
