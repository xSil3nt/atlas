import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import * as THREE from 'three';
const origin=process.env.ATLAS_TEST_URL || 'http://127.0.0.1:5174';
await mkdir('test-results/integration',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--use-gl=angle']});
const errors=[];
try {
const context=await browser.newContext({viewport:{width:1440,height:900}});
await context.addInitScript(()=>{
 if(!localStorage.getItem('legacy-seeded')) {
  localStorage.setItem('lifestitchr-packs-v2','{"legacy":"untouched"}');
  localStorage.setItem('stitch-collection','{"placeholder/0":7}');
  localStorage.setItem('stitch-sound','true');localStorage.setItem('legacy-seeded','yes');
 }
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const phase=name=>page.waitForFunction(n=>document.body.dataset.phase===n,name);
const openPacks=async()=>{if(await page.locator('.packs-link').isVisible())await page.locator('.packs-link').click();else {await page.locator('#mode-toggle').click();await page.locator('#mode-menu [data-mode=pack]').click();}};
const action=name=>page.getByRole('button',{name,exact:true}).click();
const count=n=>expect(page.locator('#card-count')).toContainText(`${n} / 12`);
const shot=async name=>{await page.waitForFunction(()=>[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width&&r.height&&r.top<innerHeight&&r.bottom>0;}).every(i=>i.complete));await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.filter(i=>i.complete&&i.naturalWidth).map(i=>i.decode().catch(()=>{}))));await page.screenshot({path:`test-results/integration/${name}.png`});};
await page.goto(origin);
const api=await (await page.request.get(origin+'/api/cards')).json();
const mainCount=Object.values(api.decks).flat().length;
await expect(page.locator('#results-count')).toHaveText(`${mainCount} cards`);
await page.locator('#grid .card-slot').first().click();await expect(page.locator('#card-total')).toContainText('1 / 40');
await page.getByRole('button',{name:/Resource Deck/}).click();await expect(page.locator('#results-count')).toHaveText(`${api.resources.length} cards`);
await page.locator('#grid .card-slot').first().click();
await page.evaluate(()=>window.originalAtlasHeader=document.querySelector('header'));
await shot('atlas-before');await openPacks();await phase('sealed');
await expect(page.locator('#sound,#odds,#collection,#modal,#save-warning')).toHaveCount(0);
expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k!=='atlas-modes-v1').sort())).toEqual(['legacy-seeded','lifestitchr-packs-v2','stitch-collection','stitch-sound']);
expect(await page.evaluate(()=>window.originalAtlasHeader===document.querySelector('header'))).toBe(true);
await expect(page.locator('header h1')).toHaveText('Lifestitchr Atlas');
await expect(page.locator('.packs-link')).toHaveClass(/active/);
await expect(page.locator('#sidebar')).toBeVisible();
expect(new URL(page.url()).pathname).toBe('/');
await shot('sealed');
const r=await page.locator('#scene').boundingBox();
const cam=new THREE.PerspectiveCamera(36,r.width/r.height,.1,60);cam.position.set(0,.05,7.5);cam.lookAt(0,0,0);cam.updateMatrixWorld();
const p=new THREE.Vector3(.85,1.7,.088).applyEuler(new THREE.Euler(-.07,-.2,-.095)).project(cam);
const seam={x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};
await page.mouse.move(seam.x,seam.y);await page.mouse.down();await page.mouse.move(seam.x-55,seam.y+5,{steps:12});await page.mouse.up();await phase('tearing');await shot('partial-tear');
await action('Finish tear');await phase('browsing');await count(1);await shot('first-card');
const cr=await page.locator('#scene').boundingBox(),x=cr.x+cr.width/2,y=cr.y+cr.height/2;
await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+24,y+5,{steps:20});await page.waitForTimeout(180);await page.mouse.up();await phase('browsing');await count(1);
await action('Inspect');await expect(page.locator('#back-inspect')).toBeFocused();await shot('inspection');await page.keyboard.press('Escape');await expect(page.locator('#inspect')).toBeFocused();
await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+105,y,{steps:25});await page.waitForTimeout(180);await page.mouse.up();await phase('browsing');await count(2);
await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-50,y,{steps:2});await page.mouse.up();await phase('browsing');await count(3);
await page.mouse.click(x,y);await phase('browsing');await count(4);
await page.getByRole('button',{name:/Resource Deck/}).click();await expect(page.locator('#grid-wrap')).toBeVisible();
await openPacks();await phase('browsing');await count(4);await expect(page.locator('#scene canvas')).toHaveCount(1);
await page.locator('body').click({position:{x:8,y:160}});await page.keyboard.press('ArrowRight');await phase('browsing');await count(5);
await action('Next card');await phase('browsing');await count(6);
await page.evaluate(()=>{for(let i=0;i<15;i++)document.querySelector('#primary').click();});await phase('browsing');await count(7);
await action('Reveal all');await phase('summary');await expect(page.locator('#result-grid button')).toHaveCount(12);await shot('results');
const result=page.locator('#result-grid button').first();await result.click();await action('Back');await expect(result).toBeFocused();
for(let n=0;n<2;n++) {
 await action('Open another');await phase('sealed');await action('Open pack');await phase('browsing');
 if(n===0){for(let i=1;i<=12;i++){await action(i===12?'See results':'Next card');await phase(i===12?'summary':'browsing');}}
 else {await action('Reveal all');await phase('summary');}
}
expect(await page.evaluate(()=>localStorage.getItem('lifestitchr-packs-v2'))).toBe('{"legacy":"untouched"}');
expect(await page.evaluate(()=>localStorage.getItem('stitch-collection'))).toBe('{"placeholder/0":7}');
expect(await page.evaluate(()=>localStorage.getItem('stitch-sound'))).toBe('true');
await page.locator('#mode-toggle').click();await page.locator('#mode-menu [data-mode='+'normal'+']').click();
await page.getByRole('button',{name:/Main Deck/}).click();
await expect(page.locator('#results-count')).toHaveText(`${mainCount} cards`);
await expect(page.locator('#card-total')).toContainText('1 / 40');
await page.getByRole('button',{name:/Resource Deck/}).click();await expect(page.locator('#card-total')).toContainText('1 / 20');
await page.getByRole('button',{name:/Main Deck/}).click();await expect(page.locator('#results-count')).toHaveText(`${mainCount} cards`);await shot('atlas-return');
await page.locator('#search-input').fill('Altar');
await openPacks();await phase('summary');
await page.locator('#mode-toggle').click();await page.locator('#mode-menu [data-mode='+'normal'+']').click();await expect(page.locator('#search-input')).toHaveValue('Altar');
await page.locator('#search-input').fill('');
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await shot('atlas-mobile');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
await openPacks();await phase('summary');await action('Open another');await phase('sealed');await shot('mobile-sealed');await action('Open pack');await phase('browsing');await shot('mobile-card');await action('Inspect');await shot('mobile-inspection');await action('Back');
await action('Reveal all');await phase('summary');await shot('mobile-results');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
await page.reload();await phase('sealed');
await page.setViewportSize({width:844,height:390});await action('Open pack');await phase('browsing');await shot('landscape');
await context.close();
const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const rp=await reduced.newPage();rp.on('pageerror',e=>errors.push(e.message));
await rp.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw Error('Storage blocked');}});});
await rp.route('https://raw.githubusercontent.com/**/*.png',route=>route.abort());
await rp.goto(origin+'/packs/');await rp.getByRole('button',{name:'Open pack',exact:true}).click();await expect(rp.locator('#inspect')).toBeVisible();await rp.getByRole('button',{name:'Inspect',exact:true}).click();await expect(rp.locator('#inspect-artist')).toContainText('Art:');await rp.screenshot({path:'test-results/integration/reduced-missing-art.png'});await rp.getByRole('button',{name:'Back',exact:true}).click();await rp.locator('[data-tab=All]').click();expect(await rp.locator('#grid .card-slot').count()).toBeGreaterThan(0);await expect(rp.locator('#storage-note')).toBeVisible();await reduced.close();
const failure=await browser.newPage();await failure.route('**/api/cards',route=>route.fulfill({status:502,body:'{}'}));await failure.goto(origin+'/packs/');await expect(failure.locator('#error')).toContainText('could not be reached');await expect(failure.locator('#primary')).toBeDisabled();await failure.close();
expect(errors).toEqual([]);
console.log(`PASS: ${mainCount} main cards + ${api.resources.length} resources available before/after packs; both decks retained; gestures, 3 packs, focus/inspection/results, mobile/landscape, fresh opener after reload, separate saved inventory, blocked storage, missing art, reduced motion and catalog failure.`);
} finally {await browser.close();}
