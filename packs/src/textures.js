import * as THREE from 'three';
import { cardUrl, backUrl } from './pack.js';
const cache = new Map();
const loader = new THREE.TextureLoader();
const configure = t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
export async function preloadCards(cards) {
  const urls = new Set(cards.flatMap(c => [cardUrl(c), backUrl(c)]));
  // Retain only the current pack and two shared backs; materials are replaced before next render.
  for (const [url, texture] of cache) if (!urls.has(url)) { texture.dispose(); cache.delete(url); }
  await Promise.all([...urls].map(async url => {
    if (cache.has(url)) return;
    try { cache.set(url, configure(await loader.loadAsync(url))); }
    catch { cache.set(url, unavailableTexture()); }
  }));
}
function canvas(w, h, draw) {
  const el = document.createElement('canvas'); el.width = w; el.height = h;
  draw(el.getContext('2d'), w, h); return configure(new THREE.CanvasTexture(el));
}
function unavailableTexture() {
  return canvas(375, 523, (ctx,w,h) => {
    ctx.fillStyle = '#e5d9c2'; ctx.fillRect(0,0,w,h); ctx.fillStyle='#24251e';
    ctx.font='22px Georgia'; ctx.textAlign='center'; ctx.fillText('Artwork unavailable', w/2,h/2);
  });
}
export function cardTexture(card, back = false) { return cache.get(back ? backUrl(card) : cardUrl(card)) || null; }
export function packTexture() {
  // Keep the team's placeholder atlas active until artists replace this PNG.
  return configure(loader.load(import.meta.env.BASE_URL + 'textures/pack.png'));
}
export function tableTexture() {
  return canvas(256,256,(ctx,w,h) => {
    ctx.fillStyle='#0a0c12'; ctx.fillRect(0,0,w,h);
    let seed=7919;
    for(let i=0;i<3500;i++) { seed=(seed*16807)%2147483647; ctx.fillStyle= i%2 ? '#ffffff03':'#00000004'; ctx.fillRect(seed%w,Math.floor(seed/w)%h,1,1); }
  });
}
export function disposeTextures() { for (const t of cache.values()) t.dispose(); cache.clear(); }
