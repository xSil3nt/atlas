import { searchFields, searchResources, searchTokenAt } from "./card-search.js";

const filters = [
  ["type", "Card type"],
  ["name", "Card name"],
  ["text", "Rules text"],
  ["keyword", "Keyword"],
  ["subtype", "Subtype"],
  ["rarity", "Rarity"],
  ["artist", "Artist"],
];

const comparisons = [
  ["=", "Exactly"],
  ["<", "Less than"],
  ["<=", "At most"],
  [">", "More than"],
  [">=", "At least"],
];

const operators = new Map([
  ["AND", "Require both"],
  ["OR", "Match either"],
  ["-", "Exclude a term or filter"],
  ["()", "Group conditions"],
  ['""', "Search an exact phrase"],
]);

const resourceNames = [...new Set(Object.values(searchResources))];
const quote = value => '"' + value.replace(/["\\]/g, "\\$&") + '"';
const formatValue = value => /[\s()"\\]/.test(value) ? quote(value) : value;

function catalogValues(cards, field) {
  const unique = new Map();
  for (const card of cards) {
    const entries = field === "abilityText"
      ? card.abilityText?.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/g) ?? []
      : [card[field]].flat();
    for (const entry of entries) {
      if (typeof entry !== "string") continue;
      const value = entry.trim().replace(/\s+/g, " ");
      if (value) unique.set(value.toLowerCase(), value);
    }
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b));
}

function getSuggestions(prefix, valuesFor, queryBefore, queryAfter, costLimit) {
  const negated = prefix.startsWith("-");
  const term = negated ? prefix.slice(1) : prefix;
  const scoped = term.match(/^([a-z]+):(.*)$/i);
  const field = scoped && scoped[1].toLowerCase();
  const exclude = negated ? "-" : "";
  if (term.startsWith('"')) {
    const phrase = term.replace(/^"|"$/g, "").replace(/\\(["\\])/g, "$1");
    return [{
      label: "Exact phrase",
      empty: "Type a phrase to search",
      options: phrase ? [{ label: phrase, detail: "Use this phrase", insert: exclude + quote(phrase) + " " }] : [],
    }];
  }
  if (field && Object.hasOwn(searchFields, field)) {
    const key = searchFields[field];
    const label = filters.find(([alias]) => searchFields[alias] === key)[1];
    const value = scoped[2].replace(/^"|"$/g, "").replace(/\\(["\\])/g, "$1");
    const needle = value.toLowerCase();
    const catalog = valuesFor(key);
    const values = key === "type" && catalog.some(type => /corpse$/i.test(type)) ? ["Corpse", ...catalog] : catalog;
    const options = values.filter(item => item.toLowerCase().includes(needle)).map(item => ({
      label: item,
      insert: exclude + field + ":" + formatValue(item) + " ",
    }));
    if (value && key !== "type" && !options.some(option => option.label.toLowerCase() === needle)) {
      options.unshift({ label: value, detail: "Search for this text", insert: exclude + field + ":" + quote(value) + " " });
    }
    return [{ label, options }];
  }

  const cost = term.match(/^([a-z]+)([<>=]*)(\d*)$/i);
  const resource = cost && searchResources[cost[1].toLowerCase()];
  if (resource && resourceNames.includes(resource)) {
    const base = exclude + cost[1].toLowerCase();
    const operator = cost[2];
    const number = cost[3];
    const options = comparisons.some(([value]) => value === operator)
      ? [...new Set([...(number ? [Number(number)] : []), ...Array.from({ length: costLimit + 1 }, (_, i) => i)])]
        .filter(value => String(value).startsWith(number))
        .map(value => ({ label: String(value), detail: resource + " cost", insert: base + operator + value + " " }))
      : comparisons.map(([value, label]) => ({ label, detail: resource + " " + value, insert: base + value }));
    return [{ label: resource + " cost", options }];
  }

  const options = filters.map(([alias, label]) => {
    const phrase = ["name", "text", "artist"].includes(alias);
    return { label, detail: alias + ":", insert: exclude + alias + ":" + (phrase ? '""' : ""), caretOffset: phrase ? -1 : 0 };
  });
  const costs = resourceNames.map(name => ({ label: name, insert: exclude + name.toLowerCase() }));
  const actions = [...operators]
    .filter(([symbol]) => !negated && ((symbol !== "AND" && symbol !== "OR") || queryBefore.trim()))
    .map(([symbol, label]) => ({
      label,
      detail: symbol,
      insert: symbol === "AND" || symbol === "OR" ? symbol + " " : symbol,
      caretOffset: symbol === "()" || symbol === '""' ? -1 : 0,
      append: true,
    }));
  if (!prefix && queryAfter.startsWith(")")) {
    actions.unshift({ label: "Finish group", detail: ")", insert: ") ", replaceClosing: true });
  }
  const needle = term.toLowerCase();
  const matchesPrefix = option => option.label.toLowerCase().startsWith(needle) || option.detail?.startsWith(needle);
  const matches = [...options, ...costs].some(matchesPrefix);
  const narrow = list => matches ? list.filter(matchesPrefix) : list;
  const append = list => list.map(option => ({ ...option, append: !!term && !matches }));
  return [
    { label: "Filter cards", options: append(narrow(options)) },
    { label: "Resource cost", options: append(narrow(costs)) },
    { label: "Combine search terms", options: actions },
  ];
}

export function mountSearchHelper(input, cards) {
  const controller = new AbortController();
  const { signal } = controller;
  const panel = document.createElement("div");
  panel.id = "search-helper";
  panel.hidden = true;
  panel.setAttribute("role", "listbox");
  panel.setAttribute("aria-label", "Search suggestions");
  document.body.appendChild(panel);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-label", "Search cards");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", panel.id);
  input.setAttribute("aria-expanded", "false");
  input.autocomplete = "off";
  const costLimit = Math.max(0, ...cards.flatMap(card => Object.values(card.cost ?? {})));
  const valuesByField = new Map();
  function valuesFor(field) {
    if (!valuesByField.has(field)) valuesByField.set(field, catalogValues(cards, field));
    return valuesByField.get(field);
  }
  let options = [];
  let token;
  let active = -1;

  function position() {
    if (panel.hidden) return;
    const rect = input.getBoundingClientRect();
    panel.style.top = (rect.bottom + 5) + "px";
    panel.style.left = Math.max(8, Math.min(rect.right - panel.offsetWidth, document.documentElement.clientWidth - panel.offsetWidth - 8)) + "px";
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    panel.style.maxHeight = Math.min(360, Math.max(60, viewportHeight - rect.bottom - 13)) + "px";
  }

  function highlight(index) {
    panel.querySelector('[aria-selected="true"]')?.setAttribute("aria-selected", "false");
    active = index;
    const row = panel.querySelector('[data-option="' + index + '"]');
    if (!row) {
      input.removeAttribute("aria-activedescendant");
      return;
    }
    row.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", row.id);
    row.scrollIntoView({ block: "nearest" });
  }

  function refresh() {
    const caret = input.selectionStart ?? input.value.length;
    token = searchTokenAt(input.value, caret);
    const groups = getSuggestions(token.prefix, valuesFor, input.value.slice(0, caret), input.value.slice(caret), costLimit);
    options = [];
    panel.replaceChildren();
    for (const { label, options: groupOptions } of groups) {
      if (!groupOptions.length) continue;
      const group = document.createElement("div");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", label);
      const heading = document.createElement("div");
      heading.className = "search-helper-heading";
      heading.setAttribute("aria-hidden", "true");
      heading.textContent = label;
      group.appendChild(heading);
      for (const option of groupOptions) {
        const row = document.createElement("div");
        row.className = "search-helper-option";
        row.dataset.option = options.length;
        row.id = panel.id + "-" + options.length;
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", "false");
        row.textContent = option.label;
        if (option.detail) {
          const detail = document.createElement("span");
          detail.textContent = option.detail;
          row.appendChild(detail);
        }
        group.appendChild(row);
        options.push(option);
      }
      panel.appendChild(group);
    }
    if (!options.length) {
      const empty = document.createElement("div");
      empty.className = "search-helper-heading";
      empty.textContent = groups[0]?.empty ?? "No matching values";
      panel.appendChild(empty);
    }
    highlight(-1);
    panel.scrollTop = 0;
    panel.hidden = false;
    position();
    input.setAttribute("aria-expanded", "true");
  }

  function close() {
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    highlight(-1);
  }

  function choose(index) {
    const option = options[index];
    if (!option) return;
    const start = option.append ? token.end : token.start;
    const before = input.value.slice(0, start);
    const separator = !option.replaceClosing && before && !/[\s(]$/.test(before) ? " " : "";
    const insert = separator + option.insert;
    input.focus();
    input.setRangeText(insert, start, token.end + Number(!!option.replaceClosing), "end");
    const caret = start + insert.length + (option.caretOffset ?? 0);
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  for (const event of ["focus", "click", "input"]) input.addEventListener(event, refresh, { signal });
  input.addEventListener("blur", close, { signal });
  input.addEventListener("keydown", event => {
    if (event.isComposing) return;
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || (event.key === "ArrowUp" && !panel.hidden)) {
      event.preventDefault();
      if (panel.hidden) refresh();
      if (options.length) {
        const index = active === -1 && event.key === "ArrowUp" ? options.length - 1 : active + (event.key === "ArrowDown" ? 1 : -1);
        highlight((index + options.length) % options.length);
      }
    } else if (event.key === "Enter" && !panel.hidden) {
      event.preventDefault();
      if (active >= 0) choose(active);
      else close();
    }
  }, { signal });
  input.addEventListener("keyup", event => {
    if (!panel.hidden && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) refresh();
  }, { signal });
  panel.addEventListener("pointerdown", event => {
    if (event.target.closest("[data-option]")) event.preventDefault();
  }, { signal });
  panel.addEventListener("click", event => {
    const row = event.target.closest("[data-option]");
    if (row) choose(Number(row.dataset.option));
  }, { signal });
  document.addEventListener("pointerdown", event => {
    if (!panel.contains(event.target) && event.target !== input) close();
  }, { signal });
  window.addEventListener("resize", position, { signal });
  window.visualViewport?.addEventListener("resize", position, { signal });
  return () => {
    controller.abort();
    panel.remove();
  };
}
