import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({headless:true});const origin=process.env.ATLAS_TEST_URL||'http://127.0.0.1:5174';
try {
for(const raw of ['{bad','null',JSON.stringify({version:1,mode:'pack',inventory:{},decks:{pack:null}})]) {
 const context=await browser.newContext();await context.addInitScript(raw=>{localStorage.setItem('atlas-modes-v1',raw);localStorage.setItem('stitch-collection','legacy');},raw);
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/?mode=pack');await expect(p.locator('#grid')).toContainText('No cards yet');expect(await p.evaluate(()=>localStorage.getItem('stitch-collection'))).toBe('legacy');expect(errors).toEqual([]);if(raw==='null'||raw==='{bad')expect(await p.evaluate(()=>localStorage.getItem('atlas-modes-v1'))).toBe(raw);await context.close();
}
const context=await browser.newContext();const p=await context.newPage();await p.goto(origin);await expect(p.locator('#results-count')).toHaveText('132 cards');const api=await(await p.request.get(origin+'/api/cards')).json();
const inventory=Object.fromEntries([...Object.values(api.decks).flat(),...api.resources].map(c=>[c.path,3]));
await p.evaluate(inventory=>localStorage.setItem('atlas-modes-v1',JSON.stringify({version:1,mode:'pack',inventory,decks:{normal:{},pack:{main:{fake:999},resource:{fake:999}}}})),inventory);
await p.reload();await expect(p.locator('#starter-decks')).toBeHidden();
await p.locator('[data-deck=Heart]').dispatchEvent('click');await expect(p.locator('#card-total')).toContainText('0 / 40');
await p.locator('#mode-toggle').click();await p.locator('#mode-menu [data-mode='+'normal'+']').click();await expect(p.locator('#starter-decks')).toBeVisible();
await p.locator('[data-deck=Heart]').click();await expect(p.locator('#card-total')).toContainText('40 / 40');await p.reload();await expect(p.locator('#card-total')).toContainText('40 / 40');
// Short landscape drawer must retain reachable presets and deck controls.
await p.setViewportSize({width:844,height:390});await p.locator('#deck-fab').click();await p.waitForTimeout(350);await p.screenshot({path:'test-results/modes/landscape-drawer.png'});
await p.locator('#clear-btn').scrollIntoViewIfNeeded();expect(await p.locator('#clear-btn').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})).toBe(true);await p.screenshot({path:'test-results/modes/landscape-controls.png'});
await context.close();console.log('PASS malformed/null storage, legacy preservation, unknown saved cards, pack starters absent even with full inventory, normal starter, preset reload, landscape drawer');
} finally {await browser.close();}
