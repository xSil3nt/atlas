import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
const origin=process.env.ATLAS_TEST_URL || 'http://127.0.0.1:4174';
for(const route of ['/', '/anarchy.html']) {
 await page.goto(origin+route,{waitUntil:'domcontentloaded'});await page.waitForSelector('#grid .card-slot');
 await expect(page.locator('#results-count')).toHaveText('132 cards');
 const first=page.locator('#grid .card-slot').first();
 for(let i=0;i<4;i++)await first.click();
 await expect(page.locator('#card-total')).toContainText(route==='/anarchy.html'?'4 / 40':'3 / 40');
 console.log('PASS production entry, catalog and copy limit:',route);
}
await page.goto(origin+'/?mode=normal',{waitUntil:'domcontentloaded'});await page.waitForSelector('#grid .card-slot');await page.locator('#clear-btn').click();await expect(page.locator('#starter-decks')).toBeVisible();await page.locator('[data-deck="Heart"]').click();await expect(page.locator('#starter-decks')).toBeHidden();await expect(page.locator('#card-total')).toContainText('40 / 40');
console.log('PASS starter deck: 40 cards');
for(const token of ['blood','brain','eye','heart','soul'])expect((await page.request.get(origin+'/tokens/'+token+'.png')).status()).toBe(200);
for(const width of [320,390,844,1440]){await page.setViewportSize({width,height:844});await page.waitForTimeout(350);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
for(const route of ['/packs','/packs/']) {const response=await page.request.get(origin+route);expect(response.status()).toBe(200);expect(await response.text()).toContain('Lifestitchr Atlas');}
expect(errors).toEqual([]);console.log('PASS production tokens, both Packs URLs, 320/390/844/1440px layout, no page errors');
}finally {await browser.close();}
