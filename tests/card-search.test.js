import assert from "node:assert/strict";
import test from "node:test";
import { compileCardSearch, searchTokenAt } from "../shared/card-search.js";

const creation = {
  name: "Ersatz Titan",
  type: "Creation?",
  subtypes: ["Titan", "Abomination"],
  rarity: "Ingenious",
  abilityText: "Draw a card.",
  cost: { Blood: 6 },
};
const scheme = {
  name: "Brain Blast",
  type: "Scheme",
  abilityText: "Bury it OR damage a chosen creation.",
  artist: "Eg",
  keywords: ["Quick"],
  cost: { Brain: 2 },
};
const names = query => [creation, scheme].filter(compileCardSearch(query)).map(card => card.name);

test("broad searches include rules text while card-type searches use the type line", () => {
  assert.deepEqual(names("creation"), [creation.name, scheme.name]);
  assert.deepEqual(names("t:creation"), [creation.name]);
  assert.deepEqual(names("type:scheme creation"), [scheme.name]);
  assert.deepEqual(names('o:"chosen creation" n:brain'), [scheme.name]);
  assert.deepEqual(names('text:"it OR damage"'), [scheme.name]);
  assert.deepEqual(names("rarity:ingenious subtype:titan"), [creation.name]);
  assert.deepEqual(names("artist:eg trait:quick"), [scheme.name]);
  assert.deepEqual(names("keyword:quick"), []);
});

test("grouping, exclusions and cost operators combine with field filters", () => {
  assert.deepEqual(names("(t:creation OR t:scheme) -trait:quick"), [creation.name]);
  assert.deepEqual(names("-(t:creation OR name:missing)"), [scheme.name]);
  assert.deepEqual(names("t:creation bl>=6 OR t:scheme br=2"), [creation.name, scheme.name]);
  assert.deepEqual(names("t:creation bl<6 OR t:scheme br=2"), [scheme.name]);
  assert.deepEqual(names('t:scheme AND "brain blast"'), [scheme.name]);
  assert.deepEqual(names("eg"), [scheme.name]);
});

test("autocomplete finds the complete token at the caret, including quoted values", () => {
  const query = 't:scheme text:"chosen creation" br>=2';
  assert.deepEqual(searchTokenAt(query, 21), {
    start: 9, end: 31, prefix: 'text:"chosen',
  });
  assert.deepEqual(searchTokenAt('t:scheme (', 10), { start: 10, end: 10, prefix: "" });
  assert.equal(compileCardSearch('text:""'), null);
  assert.equal(compileCardSearch('text:"say \\"hello\\""')({ abilityText: 'Say "hello" twice.' }), true);
});
