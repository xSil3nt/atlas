import './style.css';
import { PackScene } from './scene.js';
import { catalogFrom, makePack, cardUrl, CATALOG_URL, repoUrl } from './pack.js';
import { preloadCards } from './textures.js';
export function mountPacks(root, sharedCatalog, onAcquire = () => {}, canOpen = () => true) {
const $ = s => root.querySelector(s);
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
root.innerHTML = `
<section class="pack-stage" aria-label="Pack opener"><div id="scene"></div><div id="error" role="alert" hidden></div>
<section id="results" aria-label="Pack results" hidden><div id="result-grid" class="card-grid"></div></section>
<div class="actions"><button id="primary" hidden disabled>Open another</button><button id="reveal-all" class="text-button" hidden>Skip</button></div>
<div id="announcement" class="sr-only" aria-live="polite"></div></section>
<dialog id="inspection" aria-labelledby="inspect-name"><div class="modal-head"><button id="back-inspect" aria-label="Back" class="text-button">← Back</button><button id="close-inspect" class="icon-button" aria-label="Close inspection">×</button></div><div class="inspect-layout"><div><img id="inspect-image" class="inspect" alt=""></div><div class="inspect-copy"><h1 id="inspect-name"></h1><p id="inspect-meta"></p><p id="inspect-type"></p><p id="inspect-rules"></p><p id="inspect-artist"></p></div></div></dialog>
`;
const granted = new WeakSet();
let engine, catalog = [], draft, focusOrigin, active = true, pausedAt, generation = 0;
function image(c,extra='') { return `<img src="${escape(cardUrl(c))}" alt="${escape(c.name)}" ${extra}>`; }
function tile(c) { return `<button class="result-card" data-rarity="${escape(c.rarity)}" data-key="${escape(c.key)}">${image(c,'loading="lazy"')}<span class="card-name">${escape(c.name)}</span><span>${escape(c.rarity)}</span></button>`; }
function results() {
  $('#result-grid').innerHTML=engine.pack.map(c=>tile(c)).join('');
}
function state({phase,index,total}) {
  document.body.dataset.phase=phase;
  if(phase==='sealed') $('#result-grid').replaceChildren();
  const browsing=phase==='browsing', summary=phase==='summary';
  if ((browsing || summary) && engine?.pack && !granted.has(engine.pack)) {
    granted.add(engine.pack);
    onAcquire(engine.pack);
  }
  $('#primary').disabled=!summary || !canOpen();
  $('#primary').hidden=!summary || !canOpen();
  $('#reveal-all').hidden=!browsing;
  $('#results').hidden=!summary; $('#scene').hidden=summary;
  const c=engine?.pack?.[index] || draft?.[index];
  if(phase==='sealed') $('#announcement').textContent='New pack ready. Drag the top seal to open.';
  if(browsing) $('#announcement').textContent=`${c?.name}. ${c?.rarity || ''}. Card ${index+1} of ${total}.`;
  if(summary) { results(); $('#announcement').textContent='Pack complete. Select a card to inspect.'; }
}
function showError(message) { $('#error').hidden=false; $('#error').textContent=message; $('#primary').disabled=true; }
async function start() {
  const session = ++generation;
  try {
    let metadata = await sharedCatalog;
    if(!metadata) {
      const response=await fetch(CATALOG_URL, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
      if(!response.ok) throw Error('The cards repo could not be reached. Check your connection and reload.');
      metadata=await response.json();
    }
    if (session !== generation) return;
    catalog=catalogFrom(metadata);
    draft=makePack(catalog);
    await preloadCards(draft);
    if (session !== generation) return;
    engine=new PackScene($('#scene'),{
      canOpen,
      makePack: fresh => fresh ? (draft=makePack(catalog)) : draft,
      onState: next => { if (session === generation) state(next); },
      onError: message => { if (session === generation) showError(message); },
    });
    if(!active) { pausedAt=performance.now(); engine.renderer.setAnimationLoop(null); }
  } catch(e) { if (session !== generation) return; console.error(e); showError(e.message || 'The scene needs WebGL 2. Enable browser graphics acceleration and reload.'); }
}
$('#primary').onclick=()=>engine?.primary();
$('#reveal-all').onclick=()=>engine?.revealAll();
function inspect(c) {
  if(!c) return;
  engine?.cancelDrag(); focusOrigin=document.activeElement;
  $('.inspect-layout>div:first-child').dataset.rarity=c.rarity;
  $('#inspect-name').textContent=c.name;
  $('#inspect-meta').textContent=`${c.rarity} · ${c.id}`;
  $('#inspect-type').textContent=[c.type,...(c.subtypes||[]),...(c.resources||[])].join(' · ');
  $('#inspect-rules').textContent=c.abilityText || 'No additional rules.';
  $('#inspect-artist').textContent=`Art: ${c.artist || '-'}`;
  const img=document.createElement('img');
  img.id='inspect-image'; img.className='inspect'; img.width=375; img.height=523;
  img.alt=c.name; img.src=cardUrl(c);
  $('#inspect-image').replaceWith(img);
  $('#inspection').showModal(); $('#back-inspect').focus();
}
$('#back-inspect').onclick=$('#close-inspect').onclick=()=>$('#inspection').close();
$('#inspection').addEventListener('close',()=>focusOrigin?.focus());
root.addEventListener('click',e=>{const b=e.target.closest('[data-key]');if(b)inspect(catalog.find(c=>c.key===b.dataset.key));});
root.addEventListener('error',e=>{
  if(e.target.tagName!=='IMG' || e.target.dataset.failed) return;
  e.target.dataset.failed='true';
  e.target.alt=`${e.target.alt} — artwork unavailable`;
  e.target.src=repoUrl('mainback.png');
},true);
document.addEventListener('keydown',e=>{
  if(!active || e.repeat || $('#inspection').open || ['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName))return;
  if(['Space','ArrowRight'].includes(e.code)){e.preventDefault();engine?.primary();}
});
start();
window.addEventListener('pagehide',()=>engine?.dispose(),{once:true});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
if(import.meta.hot)import.meta.hot.dispose(()=>engine?.dispose());
return {restart() {
  // Discard the old scene so an in-flight tear or advance cannot regrant cleared cards.
  generation++;
  engine?.cancelDrag(); engine?.dispose(); engine = null;
  $('#scene').replaceChildren();
  if ($('#inspection').open) $('#inspection').close();
  $('#result-grid').replaceChildren(); $('#error').hidden = true;
  state({phase:'loading', index:0, total:12});
  return start();
}, setActive(value) {
  if(active===value)return;
  active=value;
  if(!engine)return;
  engine.cancelDrag();
  if(!active) { pausedAt=performance.now(); engine.renderer.setAnimationLoop(null); }
  else {
    const gap=performance.now()-(pausedAt||performance.now());
    engine.jobs.forEach(job=>job.start+=gap);
    engine.cards.forEach(card=>{if(card.userData.revealedAt)card.userData.revealedAt+=gap;});
    engine.last=performance.now();engine.resize();engine.renderer.setAnimationLoop(engine.frame);
  }
}};
}
