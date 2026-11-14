export const rarities = ['Common', 'Peculiar', 'Exceptional', 'Ingenious'];
export const keyFor = path => path.replaceAll('\\', '/').normalize('NFC');
import { repoUrl } from '../../shared/cards-source.js';
export { CARDS_BASE, repoUrl } from '../../shared/cards-source.js';
export const CATALOG_URL = '/api/cards';
export function catalogFrom(metadata) {
  const records = metadata?.decks && Array.isArray(metadata.resources)
    ? [...Object.values(metadata.decks).flat(), ...metadata.resources]
    : metadata?.cards;
  if (!Array.isArray(records)) throw Error('The cards repo metadata must contain a cards array.');
  const keys = new Set();
  const cards = records.map(c => {
    if (!c || typeof c.path !== 'string' || !c.path || typeof c.name !== 'string')
      throw Error('Invalid card identity in the cards repo metadata.');
    const key = keyFor(c.path);
    if (keys.has(key)) throw Error(`Duplicate card path: ${key}`);
    keys.add(key);
    if (!rarities.includes(c.rarity)) throw Error(`Missing or invalid rarity in the cards repo for ${c.name}.`);
    if (!['main','corpse'].includes(c.deck)) throw Error(`Invalid deck in the cards repo for ${c.name}.`);
    const resource = c.deck === 'corpse';
    if (resource && (c.group !== 'Resource' || !['Common Corpse','Peculiar Corpse'].includes(c.type)))
      throw Error(`Invalid corpse classification in the cards repo for ${c.name}.`);
    return { ...c, key, path: key, back: metadata.backs?.[resource ? 'resource' : 'main'], resource, corpse: resource && c.type === 'Peculiar Corpse' };
  });
  for (const rarity of [...rarities, 'Peculiar Corpse']) {
    if (!poolFor(cards, rarity).length) throw Error(`No eligible cards for ${rarity} in the cards repo.`);
  }
  return cards;
}
function poolFor(cards, role) {
  return cards.filter(c => role === 'Peculiar Corpse' ? c.corpse : !c.resource && c.rarity === role);
}
export function rollRarities(random = Math.random) {
  const upgrade = () => random() < .2 ? 'Ingenious' : 'Exceptional';
  const commonOrPeculiar = random() < .5 ? 'Common' : 'Peculiar';
  // A Peculiar in the mixed Common slot uses the pack's third Peculiar slot.
  const peculiarOrRare = commonOrPeculiar === 'Peculiar' ? upgrade()
    : random() < .5 ? 'Peculiar' : upgrade();
  return [...Array(6).fill('Common'), commonOrPeculiar,
    'Peculiar', 'Peculiar', peculiarOrRare, upgrade(), 'Peculiar Corpse'];
}
export function makePack(cards, random = Math.random) {
  return rollRarities(random).map(slotRole => {
    const pool = poolFor(cards, slotRole);
    if (!pool.length) throw Error(`No cards assigned to ${slotRole}.`);
    return { ...pool[Math.floor(random() * pool.length)], slotRole };
  });
}
export const cardUrl = c => c.url || repoUrl(c.path);
export const backUrl = c => c.back || repoUrl(c.resource ? 'resback.png' : 'mainback.png');
