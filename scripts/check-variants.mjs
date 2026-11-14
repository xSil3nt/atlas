import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const origin=process.env.ATLAS_TEST_URL||'http://127.0.0.1:5174';const browser=await chromium.launch({headless:true});await mkdir('test-results/variants',{recursive:true});
try{
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin+'/?mode=normal',{waitUntil:'domcontentloaded'});await expect(page.locator('#results-count')).toHaveText('132 cards');
await expect(page.locator('.mode-option-name')).toHaveText(['Normal','Pack mode','Anarchy']);
await page.evaluate(()=>window.originalHeader=document.querySelector('header'));
await page.locator('#grid .card-slot').first().click();
for(const [mode,count,total] of [['anarchy',4,132]]){
 await page.locator('#mode-toggle').click();await page.locator('#mode-menu [data-mode='+mode+']').click();await expect(page.locator('#card-total')).toContainText('0 / 40');await expect(page.locator('#results-count')).toHaveText(`${total} card${total===1?'':'s'}`);await expect(page.locator('#starter-decks')).toBeHidden();
 for(let i=0;i<4;i++)await page.locator('#grid .card-slot').first().click();await expect(page.locator('#card-total')).toContainText(`${count} / 40`);
 expect(await page.evaluate(()=>window.originalHeader===document.querySelector('header'))).toBe(true);
}
await page.locator('#mode-toggle').click();await page.locator('#mode-menu [data-mode='+'normal'+']').click();await expect(page.locator('#card-total')).toContainText('1 / 40');
await page.locator('#mode-toggle').click();await page.locator('#mode-menu [data-mode='+'anarchy'+']').click();await expect(page.locator('#card-total')).toContainText('4 / 40');await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('#mode-menu [data-mode='+'anarchy'+']')).toHaveAttribute('aria-checked','true');await expect(page.locator('#card-total')).toContainText('4 / 40');
await page.locator('[data-tab=Resource]').click();
const api=await(await page.request.get(origin+'/api/cards')).json();const peculiar=api.resources.find(c=>c.resourceType==='peculiar');
const resource=page.locator('#grid .card-slot').filter({has:page.getByAltText(peculiar.name,{exact:true})});for(let i=0;i<4;i++)await resource.click();await expect(page.locator('#card-total')).toContainText('4 / 20');
await page.locator('[data-tab=All]').click();
await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.sharedDeck=value;}}}));
await page.locator('#share-btn').click();const shared=await page.evaluate(()=>window.sharedDeck);expect(new URL(shared).searchParams.get('mode')).toBe('anarchy');expect(new URL(shared).pathname).toBe('/');
await page.goto(shared,{waitUntil:'domcontentloaded'});await expect(page.locator('#mode-menu [data-mode='+'anarchy'+']')).toHaveAttribute('aria-checked','true');await expect(page.locator('#card-total')).toContainText('4 / 40');await page.locator('[data-tab=Resource]').click();await expect(page.locator('#card-total')).toContainText('4 / 20');await page.locator('[data-tab=All]').click();
await page.screenshot({path:'test-results/variants/desktop.png'});
await page.locator('#mode-toggle').click();await page.locator('#mode-menu [data-mode='+'pack'+']').click();await page.waitForFunction(()=>document.body.dataset.phase==='sealed');await page.locator('[data-tab=All]').click();await expect(page.locator('#grid')).toContainText('No cards yet');await expect(page.locator('#starter-decks')).toBeHidden();
for(const [mode,total] of [['anarchy',132]]){
 await page.goto(origin+'/'+mode,{waitUntil:'domcontentloaded'});await expect(page.locator('#mode-menu [data-mode='+mode+']')).toHaveAttribute('aria-checked','true');await expect(page.locator('#results-count')).toHaveText(`${total} card${total===1?'':'s'}`);
 await page.goto(origin+'/'+mode+'.html',{waitUntil:'domcontentloaded'});await expect(page.locator('#mode-menu [data-mode='+mode+']')).toHaveAttribute('aria-checked','true');
}
for(const width of [320,390,844,1440]){
 await page.setViewportSize({width,height:844});await page.waitForTimeout(350);await page.locator('#mode-toggle').click();await page.locator('#mode-menu [data-mode='+'normal'+']').click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width===390)await page.screenshot({path:'test-results/variants/mobile.png'});
}
expect(errors).toEqual([]);console.log('PASS unified dropdown: three modes, in-place shell identity, variant rules, isolated/persisted decks, pack gate, clean and .html legacy links, 320–1440px layouts');
}finally{await browser.close();}
