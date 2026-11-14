// Only this versioned Atlas key is used; historical pack data is left untouched.
import { MODE_IDS as MODES } from './modes.js';
export { MODES };
export const MAX_LIMITED_PACKS = 6;
export const STORAGE_KEY = 'atlas-modes-v1';
export const identity = card => String(card.path || '').replaceAll('\\', '/').normalize('NFC');
export const counts = value => Object.fromEntries(Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
  .filter(([key, n]) => key && Number.isSafeInteger(n) && n > 0).map(([key, n]) => [key, Math.min(n, 1000000)]));
export function readState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { state: null };
    const state = JSON.parse(raw);
    if (state?.version !== 1 || typeof state.mode !== 'string' || !state.inventory || !state.decks || typeof state.decks !== 'object' || Array.isArray(state.decks)) throw Error('Invalid saved state');
    const decks = Object.fromEntries(MODES.map(mode => [mode, {main: counts(state.decks[mode]?.main), resource: counts(state.decks[mode]?.resource)}]));
    return { state: { version: 1, mode: MODES.includes(state.mode) ? state.mode : 'normal', inventory: counts(state.inventory), packsOpened: Math.min(MAX_LIMITED_PACKS, Math.max(0, Number.isSafeInteger(state.packsOpened) ? state.packsOpened : Math.ceil(Object.values(counts(state.inventory)).reduce((a, b) => a + b, 0) / 12))), decks } };
  } catch { return { state: null, failed: true }; }
}
export const availableCopies = (card, inventory) => card.resourceType === 'common' ? Infinity : inventory[identity(card)] || 0;
export function limitDeck(cards, requested, inventory, maxSize, copyLimit) {
  const result = {}, valid = counts(requested); let remaining = maxSize;
  for (const card of cards) {
    const key = identity(card);
    const count = Math.min(valid[key] || 0, copyLimit(card), inventory ? availableCopies(card, inventory) : Infinity, remaining);
    if (count > 0) { result[card.url] = count; remaining -= count; }
  }
  return result;
}
export function grant(inventory, cards) {
  const next = { ...inventory };
  for (const card of cards) { const key = identity(card); if (key) next[key] = Math.min((next[key] || 0) + 1, 1000000); }
  return next;
}
