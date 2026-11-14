import { MODE_DETAILS } from './modes.js';
const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
export function mountModeMenu(root, onChange) {
  root.innerHTML = `<button id="mode-toggle" type="button" aria-haspopup="menu" aria-controls="mode-menu" aria-expanded="false" disabled><span id="mode-icon"></span><span id="mode-name">Constructed</span><svg class="mode-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button><div id="mode-menu" role="menu" aria-label="Atlas mode" hidden>${MODE_DETAILS.map(mode => `<button type="button" role="menuitemradio" aria-checked="false" data-mode="${mode.id}" tabindex="-1"><span class="mode-option-icon">${icon(mode.icon)}</span><span class="mode-option-copy"><span class="mode-option-name">${mode.name}</span><span class="mode-option-detail">${mode.detail}</span></span><span class="mode-check" aria-hidden="true"></span></button>`).join('')}<div class="mode-menu-footer" hidden><button id="clear-packs-btn" type="button" role="menuitem" tabindex="-1" hidden><span class="mode-reset-icon">${icon('M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7')}</span><span>Reset collection</span></button></div></div>`;
  const toggle = root.querySelector('#mode-toggle'), menu = root.querySelector('#mode-menu');
  const options = [...menu.querySelectorAll('[data-mode]')];
  const reset = menu.querySelector('#clear-packs-btn');
  let current = 'normal';
  function close(restore = false) { menu.hidden = true; toggle.setAttribute('aria-expanded','false'); if (restore) toggle.focus(); }
  function open() { menu.hidden = false; toggle.setAttribute('aria-expanded','true'); options.find(b => b.dataset.mode === current)?.focus(); }
  reset.addEventListener('click', () => close(true));
  toggle.addEventListener('click', () => menu.hidden ? open() : close());
  toggle.addEventListener('keydown', event => { if (['ArrowDown','ArrowUp'].includes(event.key)) {event.preventDefault(); event.stopPropagation(); open();} });
  menu.addEventListener('click', event => {const button=event.target.closest('[data-mode]');if(button){close(true);onChange(button.dataset.mode);} });
  root.addEventListener('keydown', event => {
    if (menu.hidden) return;
    if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();close(true);return;}
    if (event.key === 'Tab') {close();return;}
    const items = [...options, ...(current === 'pack' ? [reset] : [])];
    let index=items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') index=(index+1)%items.length;
    else if(event.key === 'ArrowUp') index=(index+items.length-1)%items.length;
    else if(event.key === 'Home') index=0;
    else if(event.key === 'End') index=items.length-1;
    else if(event.key.length===1 && /[a-z]/i.test(event.key)) index=items.findIndex(b=>b.textContent.toLowerCase().startsWith(event.key.toLowerCase()));
    else return;
    event.preventDefault();items[index]?.focus();
  });
  document.addEventListener('pointerdown', event => {if(!root.contains(event.target))close();});
  root.addEventListener('focusout', event => {if(!root.contains(event.relatedTarget))close();});
  return {update(id, ready) {
    current=id;reset.hidden=id!=='pack';reset.parentElement.hidden=id!=='pack';const mode=MODE_DETAILS.find(m=>m.id===id)||MODE_DETAILS[0];
    root.querySelector('#mode-name').textContent=mode.name;root.querySelector('#mode-icon').innerHTML=icon(mode.icon);
    toggle.setAttribute('aria-label',`Atlas mode: ${mode.name}`);toggle.disabled=!ready;
    options.forEach(button=>button.setAttribute('aria-checked',String(button.dataset.mode===id)));
  },close};
}
