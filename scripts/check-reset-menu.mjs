import {chromium,expect} from '@playwright/test';
const b=await chromium.launch();
try {
 const p=await b.newPage();await p.goto('http://127.0.0.1:5174');
 const api=await(await p.request.get('http://127.0.0.1:5174/api/cards')).json();const card=Object.values(api.decks).flat()[0];
 await p.evaluate(card=>localStorage.setItem('atlas-modes-v1',JSON.stringify({version:1,mode:'pack',inventory:{[card.path]:6},decks:{pack:{main:{[card.path]:4}}}})),card);
 await p.goto('http://127.0.0.1:5174/?mode=pack');await expect(p.locator('#card-total')).toContainText('4 / 40');
 let accept=false;p.on('dialog',d=>accept?d.accept():d.dismiss());
 for(const width of [1440,390]) {
  await p.setViewportSize({width,height:844});await p.locator('#mode-toggle').click();await p.keyboard.press('End');await expect(p.locator('#clear-packs-btn')).toBeFocused();
  await p.keyboard.press('Enter');expect(await p.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('atlas-modes-v1')).inventory)[0])).toBe(6);
 }
 accept=true;await p.locator('#mode-toggle').click();await p.locator('#clear-packs-btn').click();
 expect(await p.evaluate(()=>JSON.parse(localStorage.getItem('atlas-modes-v1')).inventory)).toEqual({});await expect(p.locator('#card-total')).toContainText('0 / 40');
 for(const mode of ['normal','anarchy']) {await p.locator('#mode-toggle').click();await p.locator(`#mode-menu [data-mode=${mode}]`).click();await p.locator('#mode-toggle').click();await expect(p.locator('#clear-packs-btn')).toBeHidden();await p.keyboard.press('Escape');}
 console.log('PASS reset menu visibility, keyboard navigation, cancellation and confirmed reset on desktop and phone');
} finally {await b.close();}

