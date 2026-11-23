export const searchFields = {
  t: "type", type: "type",
  n: "name", name: "name",
  o: "abilityText", oracle: "abilityText", text: "abilityText",
  a: "artist", artist: "artist",
  k: "keywords", keyword: "keywords",
  subtype: "subtypes", r: "rarity", rarity: "rarity",
};

export const searchResources = {
  blood: "Blood", bl: "Blood", heart: "Heart", h: "Heart",
  brain: "Brain", br: "Brain", soul: "Soul", s: "Soul", eye: "Eye", e: "Eye",
};

const tokenize = /-?(?:[a-z]+:)?"(?:\\["\\]|[^"])*(?:"|$)|-?\(|\)|[^\s()"]+/gi;
const fieldTerm = /^([a-z]+):(.+)$/;
const costTerm = /^([a-z]+)(<=|>=|=|<|>)(\d+)$/;

function words(text) {
  return text.split(/[^a-z0-9]+/);
}

function matchesCardType(card, query) {
  const type = (card.type ?? "").toLowerCase();
  return type === query || words(type).includes(query);
}

function matchCost(card, resource, operator, value) {
  const cost = card.cost?.[resource] ?? 0;
  switch (operator) {
    case "<": return cost < value;
    case ">": return cost > value;
    case "<=": return cost <= value;
    case ">=": return cost >= value;
    case "=": return cost === value;
  }
}

function compileTerm(token) {
  const negated = token.startsWith("-");
  const term = (negated ? token.slice(1) : token).toLowerCase();
  if (!term) return null;

  const cost = term.match(costTerm);
  const scoped = term.match(fieldTerm);
  const field = scoped && Object.hasOwn(searchFields, scoped[1]) ? searchFields[scoped[1]] : null;
  const rawValue = field ? scoped[2] : term;
  const value = rawValue.replace(/^"|"$/g, "").replace(/\\(["\\])/g, "$1");
  if (!value || (!field && term.endsWith(":") && Object.hasOwn(searchFields, term.slice(0, -1)))) return null;

  let matches;
  if (cost && Object.hasOwn(searchResources, cost[1])) {
    matches = card => matchCost(card, searchResources[cost[1]], cost[2], Number(cost[3]));
  } else if (field === "type") {
    matches = card => matchesCardType(card, value);
  } else if (field) {
    const phrase = value.replace(/\s+/g, " ");
    matches = card => [card[field]].flat().some(entry => String(entry ?? "").toLowerCase().replace(/\s+/g, " ").includes(phrase));
  } else {
    matches = card => {
      const text = [card.name, card.type, card.artist, card.abilityText, ...(card.subtypes ?? []), ...(card.keywords ?? [])]
        .filter(Boolean).join(" ").toLowerCase();
      return value.includes(" ") ? text.includes(value) : words(text).some(word => word.startsWith(value));
    };
  }
  return negated ? card => !matches(card) : matches;
}

export function searchTokenAt(query, caret) {
  for (const match of query.matchAll(tokenize)) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > caret) break;
    if (caret <= end && !["(", "-(", ")"].includes(match[0])) {
      return { start, end, prefix: query.slice(start, caret) };
    }
  }
  return { start: caret, end: caret, prefix: "" };
}

export function compileCardSearch(query) {
  const tokens = (query.match(tokenize) ?? []).values();

  // AND (including a space between terms) binds more tightly than OR.
  function readGroup() {
    const alternatives = [];
    let terms = [];
    for (const token of tokens) {
      if (token === ")") break;
      if (token === "AND") continue;
      if (token === "OR") {
        if (terms.length) alternatives.push(terms);
        terms = [];
        continue;
      }
      const group = token === "(" || token === "-(";
      const matches = group ? readGroup() : compileTerm(token);
      if (matches) terms.push(token === "-(" ? card => !matches(card) : matches);
    }
    if (terms.length) alternatives.push(terms);
    if (!alternatives.length) return null;
    return card => alternatives.some(group => group.every(matches => matches(card)));
  }

  return readGroup();
}
