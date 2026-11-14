import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const origin=process.env.ATLAS_TEST_URL||'http://127.0.0.1:5174';
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--use-gl=angle']});
await mkdir('test-results/reset',{recursive:true});
try {
for(const blocked of [false,true]) {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 if(blocked)await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}}));
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));let confirm=false;
 p.on('dialog',d=>confirm?d.accept():d.dismiss());
 const phase=n=>p.waitForFunction(n=>document.body.dataset.phase===n,n);
 const main=()=>p.locator('[data-tab=All]').click();
 const inventory=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('atlas-modes-v1')).inventory);
 await p.goto(origin);await expect(p.locator('#results-count')).toHaveText('132 cards');
 await expect(p.locator('.packs-link')).toBeHidden();await expect(p.locator('#clear-packs-btn')).toBeHidden();await expect(p.locator('.nav-tab-note')).toHaveCount(0);
 await p.locator('#grid .card-slot').first().click();await p.locator('[data-tab=Resource]').click();await p.locator('#grid .card-slot').first().click();
 await p.locator('#mode-toggle').click();await p.locator('#mode-menu [data-mode='+'pack'+']').click();await phase('sealed');await expect(p.locator('.packs-link')).toBeVisible();await expect(p.locator('#clear-packs-btn')).toBeVisible();
 await p.locator('#primary').click();await phase('browsing');await main();await p.locator('#grid .card-slot').first().click();await p.locator('[data-tab=Resource]').click();await p.locator('#grid .card-slot').first().click();
 await p.locator('.packs-link').click();await p.locator('#reveal-all').click();await phase('summary');
 await p.locator('#clear-packs-btn').click();await expect(p.locator('#result-grid button')).toHaveCount(12);if(!blocked)expect(Object.values(await inventory()).reduce((a,b)=>a+b,0)).toBe(12);
 confirm=true;await p.locator('#clear-packs-btn').click();await phase('sealed');await expect(p.locator('#result-grid button')).toHaveCount(0);await expect(p.locator('#scene canvas')).toHaveCount(1);
 if(!blocked)expect(await inventory()).toEqual({});
 await main();await expect(p.locator('#grid')).toContainText('No cards yet');await expect(p.locator('#card-total')).toContainText('0 / 40');await p.locator('[data-tab=Resource]').click();await expect(p.locator('#grid .card-slot')).toHaveCount(0);await expect(p.locator('#card-total')).toContainText('0 / 20');
 await p.locator('#mode-toggle').click();await p.locator('#mode-menu [data-mode='+'normal'+']').click();await expect(p.locator('#card-total')).toContainText('1 / 20');await main();await expect(p.locator('#card-total')).toContainText('1 / 40');await expect(p.locator('#results-count')).toHaveText('132 cards');
 if(!blocked) {
  await p.screenshot({path:'test-results/reset/normal.png'});
  await p.locator('#mode-toggle').click();await p.locator('#mode-menu [data-mode='+'pack'+']').click();await phase('sealed');await p.locator('#primary').click();await p.locator('#clear-packs-btn').click();await phase('sealed');await p.waitForTimeout(1600);expect(await inventory()).toEqual({});
  await p.locator('#primary').click();await phase('browsing');expect(Object.values(await inventory()).reduce((a,b)=>a+b,0)).toBe(12);
  await p.setViewportSize({width:390,height:844});await p.locator('#deck-fab').click();await p.waitForTimeout(350);await p.screenshot({path:'test-results/reset/mobile-controls.png'});await p.locator('#clear-packs-btn').click();await phase('sealed');await p.locator('#drawer-close').click();
  await p.reload();await phase('sealed');expect(await inventory()).toEqual({});await main();await expect(p.locator('#grid')).toContainText('No cards yet');
 }
 expect(errors).toEqual([]);await context.close();
 console.log(`PASS clear packs ${blocked?'blocked storage':'persistent'}: cancel, confirm, main/resource reset, normal decks retained, fresh opener${blocked?'':', in-flight tear canceled, reopening grants once, mobile, reload and lean navigation'}`);
}
}finally{await browser.close();}
