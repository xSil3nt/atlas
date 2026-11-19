import { resolveModeUrl } from './shared/modes.js';
import { mountModeMenu } from './shared/mode-menu.js';
import { MODES, MAX_LIMITED_PACKS, STORAGE_KEY, identity, readState, limitDeck, grant, availableCopies } from './shared/inventory.js';
const ATLAS_COLS = 10;
const ATLAS_ROWS = 7;
const MAX_COPIES = 3;
const RESOURCE_MAX_PECULIAR = 3;

const FOLDERS = ["Blood", "Heart", "Brain", "Soul", "Eye", "Multi"];
const RESOURCES = ["Blood", "Heart", "Brain", "Soul", "Eye"];
const CARD_SORTS = { amount: "Amount", name: "Alphabetical", resource: "Resource", type: "Card type" };

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
    { name: "Scant Messenger",       count: 2 },
    { name: "Transient Malevolence", count: 2 },
    { name: "Altar Familiar",        count: 3 },
    { name: "Graft",                 count: 3 },
    { name: "Box of Limbs",          count: 3 },
    { name: "Bearer of the Banner",  count: 3 },
    { name: "Divine Blessing",       count: 3 },
    { name: "Entwined Shadows",      count: 3 },
    { name: "Little Newt",           count: 3 },
    { name: "Spirit Siphon",         count: 3 },
    { name: "Summoning Circle",      count: 3 },
    { name: "Symbol of Violence",    count: 3 },
    { name: "Tower Witch",           count: 3 },
    { name: "False Idol",            count: 3 },
  ],
  Eye: [
    { name: "Graveswap",           count: 2 },
    { name: "The Myriad",          count: 2 },
    { name: "Altar Familiar",      count: 3 },
    { name: "Graft",               count: 3 },
    { name: "Box of Limbs",        count: 3 },
    { name: "Dimensional Weave",  count: 3 },
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
let packsActive = false, packsController, packsLoading, catalogReady;
let myDeck = {};
let resourceCounts = {};
let activeTab = "All";
let searchQuery = "";
let searchGroups = null;
let costFilters = null;
let activeFilters = new Set();
let exclusiveFilter = false;
let deckDrawerOpen = false;

const modesEnabled = !!document.getElementById('atlas-modes');
const entry = resolveModeUrl(new URL(location.href));
if (entry.legacy) {
  const url = new URL(location.href); url.pathname = '/'; url.searchParams.set('mode', entry.mode);
  if (entry.openPacks) url.hash = 'packs';
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}
const modeMenu = mountModeMenu(document.getElementById('atlas-modes'), next => setMode(next));
let mode = entry.mode || 'normal', inventory = {}, packsOpened = 0, savedDecks = {normal: {}, pack: {}}, storageWarning = false, persistenceAvailable = true;
let cardSort = "amount";
modeMenu.update(mode, false);
function mainDeckSize() { return mode === 'pack' ? 25 : 40; }
function resourceDeckSize() { return mode === 'pack' ? 10 : 20; }
function owned(card) { return mode === 'pack' ? availableCopies(card, inventory) : Infinity; }
function mainLimit() { return mode === 'normal' ? MAX_COPIES : mainDeckSize(); }
function resourceLimit(card) { return mode === 'normal' && card.resourceType === 'peculiar' ? RESOURCE_MAX_PECULIAR : resourceDeckSize(); }
function snapshot() {
  return {main: Object.fromEntries(Object.values(myDeck).map(c => [identity(c), c.count])),
    resource: Object.fromEntries((allCards?.resources || []).map(c => [identity(c), resourceCounts[c.url] || 0]))};
}
function restoreDeck(value = {}) {
  value = value || {};
  const main = FOLDERS.flatMap(f => allCards.decks[f] || []);
  const allowed = mode === 'pack' ? inventory : null;
  const counts = limitDeck(main, value.main, allowed, mainDeckSize(), mainLimit);
  myDeck = Object.fromEntries(main.filter(c => counts[c.url]).map(c => [c.url, {...c, count: counts[c.url]}]));
  resourceCounts = limitDeck(allCards.resources || [], value.resource, allowed, resourceDeckSize(), resourceLimit);
}
function saveState() {
  if (!modesEnabled || !allCards) return;
  savedDecks[mode] = snapshot();
  if (!persistenceAvailable) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({version: 1, mode, inventory, packsOpened, decks: savedDecks})); }
  catch { warnStorage(); }
}
function warnStorage() {
  persistenceAvailable = false;
  if (storageWarning) return;
  storageWarning = true;
  showWarning('Browser storage unavailable or invalid. Changes may only last this visit.');
  const note = document.getElementById('storage-note');
  if (note) note.hidden = false;
}
function renderMode() {
  document.body.dataset.mode = mode;
  document.querySelector('.packs-link')?.toggleAttribute('hidden', mode !== 'pack' || packsOpened >= MAX_LIMITED_PACKS);
  document.getElementById('clear-packs-btn')?.toggleAttribute('hidden', mode !== 'pack');
  modeMenu.update(mode, !!allCards);
}
function setMode(next, openPack = true) {
  if (!modesEnabled || !allCards || !MODES.includes(next)) return;
  if (next !== mode) {
    savedDecks[mode] = snapshot(); mode = next; restoreDeck(savedDecks[mode]);
    clearAtlasLink(); hidePreview(); hoveredCard = null;
    renderMode(); renderGrid(); renderSidebar();
    const url = new URL(location.href); url.searchParams.delete('deck'); url.searchParams.delete('res');
    url.pathname = '/';
    if (mode !== 'normal') url.searchParams.set('mode', mode); else url.searchParams.delete('mode');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    saveState();
  }
  if (mode === 'pack' && openPack) showPacks();
  else if (mode !== 'pack' && packsActive) switchTab(activeTab);
}
function clearPacks() {
  if (mode !== 'pack') return;
  if (!window.confirm('This deletes all acquired cards from packs. It cannot be undone')) return;
  inventory = {}; packsOpened = 0; myDeck = {}; resourceCounts = {};
  savedDecks.pack = {};
  clearAtlasLink(); hidePreview(); hoveredCard = null;
  const url = new URL(location.href);
  url.searchParams.delete('deck'); url.searchParams.delete('res');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  saveState(); renderMode();
  packsController?.restart();
  renderGrid(); renderSidebar();
  showToast('Collection reset', 'info');
}

function acquireCards(cards) {
  if (packsOpened >= MAX_LIMITED_PACKS) return false;
  packsOpened++;
  inventory = grant(inventory, cards);
  renderMode();
  saveState(); renderStarters();
  renderGrid();
}
function renderStarters() {
  const section = document.getElementById('starter-decks');
  if (!section || !allCards) return;
  section.hidden = mode !== 'normal' || isResourceTab() || Object.keys(myDeck).length > 0;
  section.querySelectorAll('.starter-availability').forEach(label => { label.textContent = '›'; });
}

const LAYOUT_BREAKPOINTS = { compact: 1024, narrow: 600 };

function isMobileLayout() {
  return window.matchMedia(`(max-width: ${LAYOUT_BREAKPOINTS.compact}px)`).matches;
}

function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function showWarning(msg) {
  showToast(msg, "warning");
}

function updateDeckProgress(current, max) {
  const bar = document.getElementById("deck-progress");
  const fill = document.getElementById("deck-progress-fill");
  if (!bar || !fill) return;
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  fill.style.width = pct + "%";
  bar.setAttribute("aria-valuenow", String(current));
  bar.setAttribute("aria-valuemax", String(max));
  bar.classList.toggle("near-max", current >= max * 0.85 && current < max);
  bar.classList.toggle("complete", current >= max && max > 0);
}

function updateResultsCount(count) {
  const el = document.getElementById("results-count");
  if (!el) return;
  el.textContent = count > 0 ? `${count} card${count !== 1 ? "s" : ""}` : "";
}

function updateDeckEmpty(isEmpty) {
  const empty = document.getElementById("deck-empty");
  if (!empty) return;
  empty.classList.toggle("visible", isEmpty);
  empty.setAttribute("aria-hidden", isEmpty ? "false" : "true");
}

function updateDeckFab(count) {
  const fabCount = document.getElementById("deck-fab-count");
  if (!fabCount) return;
  fabCount.textContent = count;
  updateDrawerA11y();
}

function updateDrawerA11y() {
  const sidebar = document.getElementById("sidebar");
  const fab = document.getElementById("deck-fab");
  if (!sidebar || !fab) return;
  if (!isMobileLayout()) {
    sidebar.removeAttribute("aria-hidden");
    fab.hidden = true;
    fab.removeAttribute("aria-expanded");
    fab.setAttribute("aria-label", "Open deck panel");
    return;
  }
  fab.hidden = deckDrawerOpen;
  sidebar.setAttribute("aria-hidden", deckDrawerOpen ? "false" : "true");
  fab.setAttribute("aria-expanded", deckDrawerOpen ? "true" : "false");
  fab.setAttribute("aria-label", deckDrawerOpen ? "Close deck panel" : "Open deck panel");
}

function openDeckDrawer() {
  deckDrawerOpen = true;
  document.getElementById('sidebar').scrollTop = 0;
  document.getElementById("sidebar")?.classList.add("drawer-open");
  const backdrop = document.getElementById("drawer-backdrop");
  if (backdrop) {
    backdrop.hidden = false;
    backdrop.classList.add("visible");
  }
  updateDrawerA11y();
}

function closeDeckDrawer() {
  deckDrawerOpen = false;
  document.getElementById("sidebar")?.classList.remove("drawer-open");
  const backdrop = document.getElementById("drawer-backdrop");
  if (backdrop) {
    backdrop.classList.remove("visible");
    backdrop.hidden = true;
  }
  updateDrawerA11y();
}

function toggleDeckDrawer() {
  if (deckDrawerOpen) closeDeckDrawer();
  else openDeckDrawer();
}

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

  if (modesEnabled) {
    let loaded;
    try { loaded = readState(localStorage); } catch { loaded = {failed: true}; }
    if (loaded.failed) warnStorage();
    if (loaded.state) { inventory = loaded.state.inventory; packsOpened = loaded.state.packsOpened; savedDecks = loaded.state.decks; mode = loaded.state.mode; }
    if (entry.mode) mode = entry.mode;
    else if (new URLSearchParams(location.search).has('deck') || new URLSearchParams(location.search).has('res')) mode = 'normal';
    restoreDeck(savedDecks[mode]); renderMode();
  }
  applyDeckFromUrl();
  const before = JSON.stringify(snapshot());
  restoreDeck(snapshot());
  if (mode === 'pack' && before !== JSON.stringify(snapshot())) showWarning('Deck trimmed to your acquired copies and deck limits.');
  renderFilterRow();
  renderGrid();
  renderSidebar();
  return allCards;
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

function setPacksVisible(visible) {
  packsActive=visible;
  document.body.dataset.experience=visible?'packs':'cards';
  document.getElementById('packs-view').hidden=!visible;
  document.getElementById('filter-row').hidden=visible;
  document.getElementById('grid-wrap').hidden=visible;
  document.querySelector('.packs-link')?.classList.toggle('active',visible);
  document.querySelector('.packs-link')?.setAttribute('aria-current',visible?'page':'false');
  packsController?.setActive(visible);
  renderNavTabs();
}
async function showPacks() {
  if (modesEnabled && !allCards) await catalogReady;
  if (modesEnabled && mode !== 'pack') setMode('pack', false);
  if (packsOpened >= MAX_LIMITED_PACKS) { switchTab(activeTab); return; }
  closeDeckDrawer(); modeMenu.close(); hidePreview(); hoveredCard=null;
  setPacksVisible(true);
  if(location.hash!=='#packs')history.replaceState(null,'',location.pathname+location.search+'#packs');
  if(!packsLoading) {
    packsLoading=import('./packs/src/main.js').then(({mountPacks})=>{
      packsController=mountPacks(document.getElementById('packs-view'),catalogReady,acquireCards, () => packsOpened < MAX_LIMITED_PACKS, attachPreviewListeners);
      packsController.setActive(packsActive);
    }).catch(()=>{
      document.getElementById('packs-view').textContent='Packs could not load. Reload to try again.';
      packsLoading=null;
    });
  }
  await packsLoading;
}

function renderNavTabs() {
  document.querySelectorAll('.nav-tab[data-tab]').forEach(btn => {
    const selected = !packsActive && btn.dataset.tab === activeTab;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-current', selected ? 'page' : 'false');
    btn.textContent = btn.dataset.tab === 'All' ? 'Main Deck' : 'Resource Deck';
  });
}

let searchHelperEl = null;
let searchHelperDismissWired = false;

function ensureSearchHelper() {
  if (searchHelperEl) return searchHelperEl;
  searchHelperEl = document.createElement("div");
  searchHelperEl.id = "search-helper";
  searchHelperEl.innerHTML = `
    <div class="helper-section">
      <div class="helper-label">Search</div>
      <div class="helper-row"><code>lord</code> keyword "lord"</div>
      <div class="helper-row"><code>draw card</code> both words</div>
    </div>
    <div class="helper-section">
      <div class="helper-label">Operators</div>
      <div class="helper-row"><code>uwais OR eg</code> either artist</div>
      <div class="helper-row"><code>soar AND cadaverous</code> both words</div>
      <div class="helper-row"><code>"quick scheme"</code> exact phrase</div>
    </div>
    <div class="helper-section">
      <div class="helper-label">Cost</div>
      <div class="helper-row"><code>blood<2</code> blood cost less than 2</div>
      <div class="helper-row"><code>heart>=3</code> heart cost 3 or more</div>
    </div>
    <div class="helper-section">
      <div class="helper-label">Tips</div>
      <div class="helper-row"><code>eg</code> finds artist, not "regen"</div>
      <div class="helper-row"><code>bury</code> finds text or keywords</div>
    </div>
  `;
  searchHelperEl.style.display = "none";
  document.body.appendChild(searchHelperEl);
  return searchHelperEl;
}

function positionSearchHelper(input) {
  const helper = ensureSearchHelper();
  const rect = input.getBoundingClientRect();
  helper.style.position = "fixed";
  helper.style.top = (rect.bottom + 4) + "px";
  helper.style.right = (window.innerWidth - rect.right) + "px";
}

function showSearchHelper(input) {
  if (isTouchPreview()) return;
  const helper = ensureSearchHelper();
  positionSearchHelper(input);
  helper.style.display = "block";
  requestAnimationFrame(() => helper.classList.add("visible"));
}

function hideSearchHelper() {
  if (!searchHelperEl) return;
  searchHelperEl.classList.remove("visible");
  setTimeout(() => {
    if (!searchHelperEl.classList.contains("visible")) searchHelperEl.style.display = "none";
  }, 150);
}

function wireSearchHelperDismiss() {
  if (searchHelperDismissWired) return;
  searchHelperDismissWired = true;
  document.addEventListener("click", e => {
    if (!searchHelperEl?.classList.contains("visible")) return;
    const input = document.getElementById("search-input");
    if (input?.contains(e.target) || searchHelperEl.contains(e.target)) return;
    hideSearchHelper();
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
    btn.type = "button";
    btn.title = resource;
    btn.setAttribute("aria-label", `Filter ${resource}`);
    btn.innerHTML =
      `<img class="rtoken filter-pill-icon" src="tokens/${resource.toLowerCase()}.png" alt="">` +
      `<span class="filter-pill-label">${resource}</span>`;
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
  exclusiveLabel.title = "Exact resource match";
  const exclusiveText = document.createElement("span");
  exclusiveText.className = "exclusive-label";
  exclusiveText.textContent = "exact";
  exclusiveLabel.appendChild(exclusiveText);
  el.appendChild(exclusiveLabel);

  const searchWrap = document.createElement("div");
  searchWrap.className = "search-wrap";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.id = "search-input";
  searchInput.placeholder = "Search";
  searchInput.value = searchQuery;
  searchInput.addEventListener("input", e => {
    searchQuery = e.target.value;
    const parsed = parseQuery(searchQuery);
    searchGroups = parsed?.searchGroups ?? null;
    costFilters = parsed?.costFilters ?? null;
    renderGrid();
  });
  searchInput.addEventListener("focus", () => showSearchHelper(searchInput));
  searchInput.addEventListener("blur", hideSearchHelper);
  searchWrap.appendChild(searchInput);
  el.appendChild(searchWrap);

  el.insertAdjacentHTML("beforeend", `
    <div id="card-sort">
      <button id="card-sort-toggle" type="button" aria-haspopup="menu" aria-controls="card-sort-menu" aria-expanded="false">
        <span></span>
        <svg class="mode-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
      </button>
      <div id="card-sort-menu" role="menu" aria-label="Sort cards" hidden>
        ${Object.entries(CARD_SORTS).map(([value, label]) => `
          <button type="button" role="menuitemradio" tabindex="-1" data-sort="${value}">
            ${label}
          </button>
        `).join("")}
      </div>
    </div>
  `);
  wireCardSort(el.querySelector("#card-sort"));

  wireSearchHelperDismiss();
}

function wireCardSort(root) {
  const toggle = root.querySelector("#card-sort-toggle");
  const menu = root.querySelector("#card-sort-menu");
  const options = [...menu.querySelectorAll("[data-sort]")];

  function updateSelection() {
    toggle.firstElementChild.textContent = CARD_SORTS[cardSort];
    toggle.setAttribute("aria-label", `Sort cards: ${CARD_SORTS[cardSort]}`);
    options.forEach(option => option.setAttribute("aria-checked", String(option.dataset.sort === cardSort)));
  }

  function setOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) options.find(option => option.dataset.sort === cardSort).focus();
  }

  updateSelection();
  toggle.addEventListener("click", () => setOpen(menu.hidden));
  root.addEventListener("focusout", event => {
    if (!root.contains(event.relatedTarget)) setOpen(false);
  });
  menu.addEventListener("click", event => {
    const option = event.target.closest("[data-sort]");
    if (!option) return;
    cardSort = option.dataset.sort;
    updateSelection();
    toggle.focus();
    setOpen(false);
    renderGrid();
  });
  root.addEventListener("keydown", event => {
    const index = options.indexOf(document.activeElement);
    const last = options.length - 1;
    switch (event.key) {
      case "Escape":
        if (menu.hidden) return;
        toggle.focus();
        setOpen(false);
        break;
      case "ArrowDown":
      case "ArrowUp": {
        if (menu.hidden) setOpen(true);
        else options[(index + (event.key === "ArrowDown" ? 1 : last)) % options.length].focus();
        break;
      }
      case "Home":
      case "End":
        if (menu.hidden) return;
        options[event.key === "Home" ? 0 : last].focus();
        break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  });
}

function loadStarterDeck(deckName) {
  if (mode !== 'normal') return;
  if(packsActive)switchTab('All');
  const deck = STARTER_DECKS[deckName];
  if (!deck || !allCards) return;

  const starterCards = FOLDERS.flatMap(folder => allCards.decks[folder] ?? []);
  myDeck = {};
  const allMainCards = starterCards;
  for (const { name, count } of deck) {
    const card = allMainCards.find(c => c.name === name);
    if (card) myDeck[card.url] = { ...card, count };
  }

  clearAtlasLink();
  if (activeTab !== "All") switchTab("All");
  else { renderGrid(); renderSidebar(); }
  if (document.getElementById('starter-decks')) {
    const heading = document.getElementById('sidebar-title');
    heading.setAttribute('tabindex', '-1');
    heading.focus({preventScroll: true});
  }
}

function switchTab(tab) {
  const returning = packsActive && tab === activeTab;
  if(document.getElementById('packs-view'))setPacksVisible(false);
  if(location.hash==='#packs')history.replaceState(null,'',location.pathname+location.search);
  if(returning)return;

  activeTab = tab;
  searchQuery = "";
  searchGroups = null;
  costFilters = null;
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

function cardSearchData(card) {
  const text = [
    card.name,
    card.type,
    card.artist,
    card.abilityText,
    ...(card.subtypes ?? []),
    ...(card.keywords ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
  return { text, words: text.split(/[^a-z0-9]+/).filter(Boolean) };
}

// A bare term matches a card if any word starts with it (so "eg" hits the
// artist "eg" but not "regenerator", and "soar" still finds "Soaring").
// A quoted phrase keeps its spaces and matches as a plain substring.
function termMatches(term, data) {
  if (term.includes(" ")) return data.text.includes(term);
  return data.words.some(w => w.startsWith(term));
}

// Parse a query into OR-groups of AND-terms, plus cost filters.
// Uppercase OR / AND are operators; space between terms is an implicit AND.
// Cost filters: blood<2, heart>=3, brain=1, etc. (also bl, h, br, s, e shorthand)
// Returns {searchGroups, costFilters} or null if empty.
function parseQuery(raw) {
  const q = raw.trim();
  if (!q) return null;

  const costFilters = [];
  const resourceShorthand = { bl: "Blood", h: "Heart", br: "Brain", s: "Soul", e: "Eye" };

  // Extract cost filters: resource(op)number patterns
  const withoutCosts = q.replace(/([a-z]+)(<=|>=|=|<|>)(\d+)/gi, (match, res, op, num) => {
    const resource = resourceShorthand[res.toLowerCase()] || (res.charAt(0).toUpperCase() + res.slice(1).toLowerCase());
    costFilters.push({ resource, op, value: parseInt(num, 10) });
    return "";
  });

  const searchGroups = withoutCosts.split(/\s+OR\s+/)
    .map(group => {
      const terms = [];
      for (const m of group.matchAll(/"([^"]+)"|(\S+)/g)) {
        if (m[1] != null) terms.push(m[1].toLowerCase());
        else if (m[2] !== "AND") terms.push(m[2].toLowerCase());
      }
      return terms;
    })
    .filter(group => group.length > 0);

  if (searchGroups.length === 0 && costFilters.length === 0) return null;
  return { searchGroups, costFilters };
}

function matchesFilter(card) {
  let searchMatch = true;
  let costMatch = true;

  if (searchGroups && searchGroups.length) {
    const data = cardSearchData(card);
    searchMatch = searchGroups.some(group => group.every(term => termMatches(term, data)));
  }

  if (costFilters && costFilters.length) {
    costMatch = costFilters.every(filter => {
      const cardCost = card.cost?.[filter.resource] ?? 0;
      switch (filter.op) {
        case "<": return cardCost < filter.value;
        case ">": return cardCost > filter.value;
        case "<=": return cardCost <= filter.value;
        case ">=": return cardCost >= filter.value;
        case "=": return cardCost === filter.value;
        default: return true;
      }
    });
  }

  let filterMatch = true;
  if (activeFilters.size > 0) {
    filterMatch = exclusiveFilter
      ? card.resources.length === activeFilters.size && card.resources.every(r => activeFilters.has(r))
      : card.resources.length > 0 && card.resources.every(r => activeFilters.has(r));
  }
  return searchMatch && costMatch && filterMatch;
}

function resourceSortRank(card) {
  if (card.resources?.length > 1) return RESOURCES.length;
  const index = RESOURCES.indexOf(card.resources?.[0]);
  return index === -1 ? RESOURCES.length + 1 : index;
}

function sortLimitedCards(cards) {
  if (mode !== "pack") return;

  cards.sort((a, b) => {
    let order = 0;
    switch (cardSort) {
      case "amount": {
        const aCopies = owned(a);
        const bCopies = owned(b);
        order = aCopies === bCopies ? 0 : aCopies > bCopies ? -1 : 1;
        break;
      }
      case "resource": order = resourceSortRank(a) - resourceSortRank(b); break;
      case "type": order = (a.type ?? "").localeCompare(b.type ?? ""); break;
    }
    return order || a.name.localeCompare(b.name);
  });
}

function renderGrid() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  if (isResourceTab()) {
    renderResourceGrid(grid);
    return;
  }

  const allMainCards = FOLDERS.flatMap(folder => allCards.decks[folder] ?? []);
  const cards = allMainCards.filter(c => owned(c) > 0).filter(matchesFilter);
  sortLimitedCards(cards);

  updateResultsCount(cards.length);

  if (!cards.length) {
    grid.innerHTML = mode === 'pack' && !Object.keys(inventory).length ? '<div class="placeholder"><strong>No cards yet</strong><button class="open-owned-pack">Open a pack</button></div>' : '<div class="placeholder"><strong>No cards found</strong><small>Try adjusting your filters or search</small></div>';
    grid.querySelector('.open-owned-pack')?.addEventListener('click', showPacks);
    return;
  }

  cards.forEach(card => grid.appendChild(createMainCardSlot(card)));
}

function createMainCardSlot(card) {
  const entry = myDeck[card.url];
  const count = entry?.count ?? 0;
  const isMaxed = count >= Math.min(mainLimit(), owned(card));
  const slot = document.createElement("div");
  slot.className = "card-slot" + (isMaxed ? " maxed" : "");

  const img = document.createElement("img");
  img.crossOrigin = "anonymous";
  img.src = card.url;
  prepCardImage(img, card.name);
  slot.appendChild(img);
  if (mode === 'pack') {
    const ownedBadge = document.createElement('span'); ownedBadge.className = 'owned-badge';
    ownedBadge.textContent = Number.isFinite(owned(card)) ? `${owned(card)} owned` : 'Unlimited'; slot.appendChild(ownedBadge);
  }

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
  attachPreviewListeners(slot, card);
  return slot;
}

function renderResourceGrid(grid) {
  const cards = (allCards?.resources ?? []).filter(c => owned(c) > 0);

  if (!cards.length) {
    grid.innerHTML = mode === 'pack' && packsOpened < MAX_LIMITED_PACKS ? '<div class="placeholder"><strong>No resource cards acquired</strong><button class="open-owned-pack">Open a pack</button></div>' : '<div class="placeholder"><strong>No resource cards</strong></div>';
    grid.querySelector('.open-owned-pack')?.addEventListener('click', showPacks);
    updateResultsCount(0);
    return;
  }

  const filtered = isSearchActive() ? cards.filter(matchesFilter) : cards;
  sortLimitedCards(filtered);
  updateResultsCount(filtered.length);

  if (!filtered.length) {
    grid.innerHTML = '<div class="placeholder"><strong>No matching cards</strong><small>Try adjusting your filters or search</small></div>';
    return;
  }

  filtered.forEach(card => {
    const count = resourceCounts[card.url] ?? 0;
    const isMaxed = count >= Math.min(resourceLimit(card), owned(card));

    const slot = document.createElement("div");
    slot.className = "card-slot" + (isMaxed ? " maxed" : "");

    const img = document.createElement("img");
    img.crossOrigin = "anonymous";
    img.src = card.url;
    prepCardImage(img, card.name);
    slot.appendChild(img);
  if (mode === 'pack') {
    const ownedBadge = document.createElement('span'); ownedBadge.className = 'owned-badge';
    ownedBadge.textContent = Number.isFinite(owned(card)) ? `${owned(card)} owned` : 'Unlimited'; slot.appendChild(ownedBadge);
  }

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
    attachPreviewListeners(slot, card);
    grid.appendChild(slot);
  });
}

function addCard(card) {
  const total = Object.values(myDeck).reduce((s, e) => s + e.count, 0);
  const entry = myDeck[card.url];
  const copies = entry?.count ?? 0;

  if (copies >= owned(card)) { showWarning('All owned copies are in your deck.'); return; }
  if (copies >= mainLimit()) {
    showWarning(`max ${MAX_COPIES} copies per card`);
    return;
  }
  if (total >= mainDeckSize()) {
    showWarning(`deck full — max ${mainDeckSize()} cards`);
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

  if (count >= owned(card)) { showWarning('All owned copies are in your deck.'); return; }
  if (mode === 'normal' && card.resourceType === "peculiar" && count >= RESOURCE_MAX_PECULIAR) {
    showWarning(`max ${RESOURCE_MAX_PECULIAR} copies of a peculiar card`);
    return;
  }
  if (total >= resourceDeckSize()) {
    showWarning(`resource deck full — max ${resourceDeckSize()} cards`);
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

function resourceIcon(resource) {
  return `<img class="rtoken" src="tokens/${resource.toLowerCase()}.png" alt="${resource}" title="${resource}">`;
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
    .map(r => `<span class="breakdown-chip">${resourceIcon(r)}${totals[r]}</span>`)
    .join("");
  breakdown.innerHTML = (prefixLabel ? `<span class="breakdown-label">${prefixLabel}</span>` : "") + chips;
  breakdown.style.display = "flex";
}

function renderSidebar() {
  renderStarters();
  saveState();
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
  totalEl.textContent = `${total} / ${mainDeckSize()} card${total !== 1 ? "s" : ""}`;
  totalEl.className = total >= mainDeckSize() ? "at-max" : "";

  document.getElementById("export-btn").disabled = total === 0;
  document.getElementById("export-btn").hidden = false;
  document.getElementById("export-resource-btn").hidden = true;

  updateDeckProgress(total, mainDeckSize());
  updateDeckEmpty(total === 0);
  updateDeckFab(total);

  renderBreakdown();

  const list = document.getElementById("deck-list");
  list.innerHTML = "";
  Object.values(myDeck).forEach(entry => {
    list.appendChild(makeDeckRow(
      entry,
      entry.count,
      () => removeCard(entry.url),
      () => addCard(entry),
    ));
  });
}

function renderResourceSidebar() {
  const resTotal = Object.values(resourceCounts).reduce((s, c) => s + c, 0);
  const isComplete = resTotal === resourceDeckSize();

  document.getElementById("sidebar-title").textContent = "Resource Deck";

  const totalEl = document.getElementById("card-total");
  totalEl.textContent = `${resTotal} / ${resourceDeckSize()} cards`;
  totalEl.className = isComplete ? "complete" : "";

  document.getElementById("export-btn").hidden = true;
  const resExportBtn = document.getElementById("export-resource-btn");
  resExportBtn.hidden = false;
  resExportBtn.disabled = !isComplete;

  updateDeckProgress(resTotal, resourceDeckSize());
  updateDeckEmpty(resTotal === 0);
  updateDeckFab(resTotal);

  renderBreakdown("main deck:");

  const list = document.getElementById("deck-list");
  list.innerHTML = "";
  const resourceCards = allCards?.resources ?? [];
  resourceCards.forEach(card => {
    const count = resourceCounts[card.url] ?? 0;
    if (count === 0) return;
    list.appendChild(makeDeckRow(
      card,
      count,
      () => removeResourceCard(card.url),
      () => addResourceCard(card),
    ));
  });
}

function makeDeckRow(card, count, onMinus, onPlus) {
  const row = document.createElement("div");
  row.className = "deck-row";

  const img = document.createElement("img");
  img.crossOrigin = "anonymous";
  img.src = card.url;
  prepCardImage(img, card.name);

  const name = document.createElement("span");
  name.className = "deck-row-name";
  name.textContent = card.name;

  const minus = document.createElement("button");
  minus.textContent = "−";
  minus.setAttribute("aria-label", "Remove one copy");
  minus.addEventListener("click", onMinus);

  const countSpan = document.createElement("span");
  countSpan.className = "count";
  countSpan.textContent = count;

  const plus = document.createElement("button");
  plus.textContent = "+";
  plus.setAttribute("aria-label", "Add one copy");
  plus.addEventListener("click", onPlus);

  const controls = document.createElement("div");
  controls.className = "deck-row-controls";
  controls.append(minus, countSpan, plus);

  row.append(img, name, controls);
  attachPreviewListeners(row, card);
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
    showToast("Atlas link copied to clipboard", "success");
  } catch (e) {
    console.error(e);
    btn.textContent = "Upload failed";
    showToast("Upload failed — try again", "warning");
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

// ---- card preview (Z / Alt + hover on desktop, long-press modal on touch) ----

const LONG_PRESS_MS = 200;
const LONG_PRESS_MOVE_TOLERANCE = 14;

function isTouchPreview() {
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function prepCardImage(img, alt = "") {
  img.draggable = false;
  img.alt = alt;
  img.setAttribute("draggable", "false");
  img.addEventListener("dragstart", e => e.preventDefault());
}

function blockNativeImageMenu(el) {
  el.addEventListener("contextmenu", e => e.preventDefault());
}

let hoveredCard = null;
let mouseX = 0, mouseY = 0;
const previewKeysHeld = new Set(); // hold Z or Alt to preview the hovered card

const PREVIEW_SIZE_MIN = 20; // vh
const PREVIEW_SIZE_MAX = 90; // vh
const PREVIEW_SIZE_DEFAULT = 60; // vh
let previewSizeVh = PREVIEW_SIZE_DEFAULT;

const previewEl = document.createElement("div");
previewEl.id = "card-preview";
const previewCardFrame = document.createElement("div");
previewCardFrame.className = "preview-card-frame";
const previewImg = document.createElement("img");
const previewDetails = document.createElement("div");
previewDetails.className = "preview-details";
previewCardFrame.append(previewImg);
previewEl.append(previewCardFrame, previewDetails);
document.body.appendChild(previewEl);

const previewModal = document.createElement("div");
previewModal.id = "preview-modal";
previewModal.setAttribute("role", "dialog");
previewModal.setAttribute("aria-modal", "true");
previewModal.setAttribute("aria-hidden", "true");
previewModal.innerHTML = `
  <div class="preview-modal-backdrop"></div>
  <div class="preview-modal-panel">
    <button type="button" class="preview-modal-close" aria-label="Close preview">×</button>
    <div class="preview-modal-body">
      <div class="preview-modal-art" role="img" aria-label="Card art"></div>
      <div class="preview-details"></div>
    </div>
  </div>
`;
document.body.appendChild(previewModal);

const previewModalArt = previewModal.querySelector(".preview-modal-art");
const previewModalDetails = previewModal.querySelector(".preview-modal-body .preview-details");

blockNativeImageMenu(previewModal);
blockNativeImageMenu(previewModal.querySelector(".preview-modal-panel"));

function showMobilePreview(card) {
  const label = card.name ?? "Card preview";
  previewModalArt.style.backgroundImage = `url("${card.url}")`;
  previewModalArt.setAttribute("aria-label", label);
  previewModalDetails.innerHTML = renderCardDetails(card);
  previewModal.classList.add("open");
  previewModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function hideMobilePreview() {
  previewModal.classList.remove("open");
  previewModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

previewModal.querySelector(".preview-modal-backdrop").addEventListener("click", hideMobilePreview);
previewModal.querySelector(".preview-modal-close").addEventListener("click", hideMobilePreview);

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (previewModal.classList.contains("open")) hideMobilePreview();
  else if (deckDrawerOpen) closeDeckDrawer();
});

function previewKeyName(key) {
  if (key === "z" || key === "Z") return "z";
  if (key === "Alt") return "alt";
  return null;
}

document.addEventListener("mousemove", e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (previewEl.classList.contains("visible")) positionPreview();
});

document.addEventListener("keydown", e => {
  const key = previewKeyName(e.key);
  if (!key || e.shiftKey || previewKeysHeld.has(key)) return;
  previewKeysHeld.add(key);
  e.preventDefault();
  if (hoveredCard) showPreview(hoveredCard);
});

document.addEventListener("keyup", e => {
  const key = previewKeyName(e.key);
  if (!key) return;
  previewKeysHeld.delete(key);
  if (previewKeysHeld.size === 0) hidePreview();
});

// releasing a key while the window is unfocused (alt-tab) never fires keyup,
// which would leave the preview stuck open — clear it on blur
window.addEventListener("blur", () => {
  previewKeysHeld.clear();
  hidePreview();
});

document.addEventListener("wheel", e => {
  if (previewKeysHeld.size === 0 || !previewEl.classList.contains("visible")) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -3 : 3;
  previewSizeVh = Math.min(PREVIEW_SIZE_MAX, Math.max(PREVIEW_SIZE_MIN, previewSizeVh + delta));
  previewImg.style.height = previewSizeVh + "vh";
  positionPreview();
}, { passive: false });

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// metadata stores resource symbols as <blood>, <brain> etc. — render them as pips
const TAG_TO_RESOURCE = { blood: "Blood", brain: "Brain", soul: "Soul", eye: "Eye", heart: "Heart" };

function renderAbilityText(text) {
  return escapeHtml(text).replace(/&lt;(blood|brain|soul|eye|heart)&gt;/g, (_, tag) => {
    return resourceIcon(TAG_TO_RESOURCE[tag]);
  });
}

function renderCardDetails(card) {
  const parts = [`<div class="detail-name">${escapeHtml(card.name)}</div>`];

  let typeline = card.type ? escapeHtml(card.type) : "";
  if (card.subtypes?.length) {
    typeline += ` <span class="detail-sub">| ${escapeHtml(card.subtypes.join(" "))}</span>`;
  }
  if (typeline) parts.push(`<div class="detail-type">${typeline}</div>`);

  if (card.deck !== "corpse" && card.cost && Object.keys(card.cost).length) {
    const pips = RESOURCES
      .filter(r => card.cost[r])
      .map(r => `<span class="cost-pip">${resourceIcon(r)}${card.cost[r]}</span>`)
      .join("");
    if (pips) parts.push(`<div class="detail-cost">${pips}</div>`);
  }

  if (card.might != null && card.vigor != null) {
    parts.push(
      `<div class="detail-stats">` +
      `<span><small>Might:</small> <strong>${card.might}</strong></span>` +
      `<span><small>Vigor:</small> <strong>${card.vigor}</strong></span>` +
      `</div>`
    );
  }

  if (card.abilityText) {
    parts.push(`<div class="detail-ability">${renderAbilityText(card.abilityText)}</div>`);
  }

  const foot = [];
  if (card.artist) foot.push(`art by ${escapeHtml(card.artist)}`);
  if (card.id) foot.push(escapeHtml(card.id));
  if (foot.length) parts.push(`<div class="detail-foot">${foot.join(" · ")}</div>`);

  return parts.join("");
}

function showPreview(card) {
  const opening = !previewEl.classList.contains("visible");
  previewImg.src = card.url;
  previewImg.style.height = previewSizeVh + "vh";
  previewDetails.innerHTML = renderCardDetails(card);
  previewEl.classList.add("visible");
  if (opening) {
    previewEl.classList.remove("preview-expanded");
    previewDetails.addEventListener("transitionend", onPreviewPanelOpen, { once: true });
  } else {
    previewEl.classList.add("preview-expanded");
  }
  positionPreview();
}

function onPreviewPanelOpen(e) {
  if (e.propertyName !== "transform") return;
  previewEl.classList.add("preview-expanded");
  positionPreview();
}

function hidePreview() {
  previewEl.classList.remove("visible", "preview-expanded");
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

function attachPreviewListeners(slot, card) {
  blockNativeImageMenu(slot);

  slot.addEventListener("mouseenter", () => {
    hoveredCard = card;
    if (previewKeysHeld.size > 0) showPreview(card);
  });
  slot.addEventListener("mouseleave", e => {
    if (e.relatedTarget && slot.contains(e.relatedTarget)) return;
    if (hoveredCard === card) hoveredCard = null;
    if (previewKeysHeld.size === 0) hidePreview();
  });

  if (!isTouchPreview()) return;

  let pressTimer = null;
  let suppressClick = false;
  let touchStartX = 0;
  let touchStartY = 0;

  slot.addEventListener("touchstart", e => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    suppressClick = false;
    pressTimer = setTimeout(() => {
      suppressClick = true;
      showMobilePreview(card);
      if (navigator.vibrate) navigator.vibrate(12);
    }, LONG_PRESS_MS);
  }, { passive: true });

  slot.addEventListener("touchmove", e => {
    if (!pressTimer || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY) > LONG_PRESS_MOVE_TOLERANCE) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }, { passive: true });

  const endPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  slot.addEventListener("touchend", endPress);
  slot.addEventListener("touchcancel", endPress);

  slot.addEventListener("click", e => {
    if (!suppressClick) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    suppressClick = false;
  }, true);
}

function copyDeckLink() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.pathname = "/";
  url.searchParams.set("mode", mode);

  const deckEncoded = encodeDeck(myDeck);
  if (deckEncoded) url.searchParams.set("deck", deckEncoded);

  const resourceCards = allCards?.resources ?? [];
  const resEncoded = encodeResourceCounts(resourceCounts, resourceCards);
  if (resEncoded) url.searchParams.set("res", resEncoded);

  copyText(url.toString());
  showToast("Deck link copied to clipboard", "success");

  const btn = document.getElementById("share-btn");
  const orig = btn.textContent;
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

document.addEventListener("DOMContentLoaded", () => {
  catalogReady=loadCards();
  if(location.hash==='#packs' && document.getElementById('packs-view'))showPacks();

  document.querySelectorAll(".nav-tab[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelector('.packs-link')?.addEventListener('click', event => {
    event.preventDefault(); showPacks();
  });
  window.addEventListener('hashchange',()=>{
    if(!document.getElementById('packs-view'))return;
    if(location.hash==='#packs')showPacks();
    else if(packsActive)switchTab(activeTab);
  });

  document.querySelectorAll('.starter-deck-option').forEach(button => button.addEventListener('click', () => loadStarterDeck(button.dataset.deck)));

  document.getElementById("share-btn").addEventListener("click", copyDeckLink);
  document.getElementById("export-btn").addEventListener("click", exportAtlas);
  document.getElementById("export-resource-btn").addEventListener("click", exportResourceAtlas);
  document.getElementById("atlas-link-copy").addEventListener("click", () => {
    const url = document.getElementById("atlas-link-input").value;
    if (!url) return;
    copyText(url);
    showToast("Link copied to clipboard", "success");
    const btn = document.getElementById("atlas-link-copy");
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });

  document.getElementById('clear-packs-btn')?.addEventListener('click', clearPacks);

  document.getElementById("clear-btn").addEventListener("click", () => {
    if (isResourceTab()) {
      if (Object.keys(resourceCounts).length === 0) return;
      resourceCounts = {};
      clearAtlasLink();
      renderGrid();
      renderSidebar();
      showToast("Resource deck cleared", "info");
    } else {
      if (Object.keys(myDeck).length === 0) return;
      myDeck = {};
      clearAtlasLink();
      renderGrid();
      renderSidebar();
      showToast("Deck cleared", "info");
    }
  });

  document.getElementById("deck-fab")?.addEventListener("click", toggleDeckDrawer);
  document.getElementById("drawer-backdrop")?.addEventListener("click", closeDeckDrawer);
  document.getElementById("drawer-close")?.addEventListener("click", closeDeckDrawer);

  window.addEventListener("resize", () => {
    if (!isMobileLayout()) closeDeckDrawer();
    updateDrawerA11y();
  });

  updateDrawerA11y();
});
