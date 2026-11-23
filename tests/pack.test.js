import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { rollRarities, makePack, catalogFrom, cardUrl, backUrl, CATALOG_URL } from "../packs/src/pack.js";
test("fixed slots and 50/50 boundaries", () => {
  const low = rollRarities(() => 0);
  assert.equal(low.length, 12);
  assert.deepEqual(low.slice(0, 6), Array(6).fill("Common"));
  assert.equal(low[6], "Common");
  assert.equal(low[9], "Peculiar");
  assert.equal(low[10], "Ingenious");
  assert.equal(low[11], "Peculiar Corpse");
  const high = rollRarities(() => 0.99);
  assert.equal(high[6], "Peculiar");
  assert.equal(high[9], "Exceptional");
  assert.equal(high[10], "Exceptional");
  const sequence = [0.5, 0.19, 0.2];
  assert.equal(rollRarities(() => sequence.shift())[9], "Ingenious");
});
test("a Peculiar in the Common/Peculiar slot forces the Peculiar/rare slot to rare", () => {
  for (const rareRoll of [0, 0.19, 0.2, 0.99]) {
    const sequence = [0.5, rareRoll, 0.99];
    const pack = rollRarities(() => sequence.shift());
    assert.equal(pack[6], "Peculiar");
    assert.equal(pack[9], rareRoll < 0.2 ? "Ingenious" : "Exceptional");
    assert.equal(pack.filter(r => r === "Peculiar").length, 3);
  }
});
test("independent exceptional upgrades and expected rates", () => {
  let seed = 724;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let common = 0,
    peculiar = 0,
    exceptional = 0,
    ingenious = 0;
  for (let i = 0; i < 100000; i++) {
    const p = rollRarities(random);
    assert.ok(p.filter(r => r === "Peculiar").length <= 3);
    common += p[6] === "Common";
    peculiar += p[9] === "Peculiar";
    exceptional += p.filter((r) => r === "Exceptional").length;
    ingenious += p.filter((r) => r === "Ingenious").length;
  }
  assert.ok(Math.abs(common / 100000 - 0.5) < 0.01);
  assert.ok(Math.abs(peculiar / 100000 - 0.25) < 0.01);
  assert.ok(Math.abs(exceptional / 100000 - 1.4) < 0.02);
  assert.ok(Math.abs(ingenious / 100000 - 0.35) < 0.01);
});
// Snapshot of the public cards repo main/metadata.json, fetched 14 November 2026.
// Runtime always fetches the repository, never this test fixture or the old submodule.
const metadata=JSON.parse(readFileSync(new URL('./fixtures/cards-metadata.json',import.meta.url)));
const catalog=catalogFrom(metadata);
test('catalog reads official schema and keeps unique paths, deck and rarity fields',()=> {
 assert.equal(catalog.length,metadata.cards.length);
 assert.equal(new Set(catalog.map(c=>c.key)).size,catalog.length);
 for(const c of catalog) {
  const source=metadata.cards.find(s=>s.path===c.key);
  assert.equal(c.rarity,source.rarity); assert.equal(c.deck,source.deck);assert.equal(c.group,source.group);
  assert.equal(c.resource,c.deck==='corpse');
 }
});
test('all pack slots use official rarities and metadata corpse eligibility',()=> {
 for(let i=0;i<100;i++) {
  const p=makePack(catalog);assert.equal(p.length,12);
  p.forEach((c,i)=> {
   assert.equal(c.rarity,metadata.cards.find(s=>s.path===c.key).rarity);
   if(i===11) {assert.equal(c.type,'Peculiar Corpse');assert.equal(c.deck,'corpse');}
   else {assert.equal(c.rarity,c.slotRole);assert.equal(c.deck,'main');}
  });
 }
 const missing=structuredClone(metadata);delete missing.cards[0].rarity;
 assert.throws(()=>catalogFrom(missing),/rarity/);
 assert.throws(()=>catalogFrom({cards:[...metadata.cards,metadata.cards[0]]}),/Duplicate/);
 assert.throws(()=>catalogFrom([]),/cards array/);
});
test('metadata, fronts and backs use the same live cards repository as Atlas',()=> {
 assert.equal(CATALOG_URL,'/api/cards');
 assert.equal(cardUrl({path:"Blood/Death's Invitation.png"}),"https://raw.githubusercontent.com/xSil3nt/lifestitchr-cards/main/Blood/Death's%20Invitation.png");
 assert.ok(backUrl({resource:true}).endsWith('/main/resback.png'));
 assert.ok(backUrl({resource:false}).endsWith('/main/mainback.png'));

});


test('packs consume the complete Atlas API catalog and its image URLs', async () => {
 const {buildCardCatalog} = await import('../api/cards.js');
 const response=buildCardCatalog(metadata,path=>'https://example.test/'+encodeURIComponent(path));
 assert.deepEqual(Object.values(response.decks).flat().find(c=>c.name==="Vitaleum Phalanx").subtypes,
  ["Stranger", "Reptilian", "Beast"]);
 assert.deepEqual(response.resources.find(c=>c.name==="Fuel for the Tide").subtypes,
  ["Eye & Heart Donor"]);
 const shared=catalogFrom(response);
 assert.equal(shared.length,catalog.length);
 assert.deepEqual(new Set(shared.map(c=>c.key)),new Set(catalog.map(c=>c.key)));
 for(const c of shared) {
  assert.equal(cardUrl(c), 'https://example.test/'+encodeURIComponent(c.path));
  assert.equal(backUrl(c),response.backs[c.resource?'resource':'main']);
 }
});
