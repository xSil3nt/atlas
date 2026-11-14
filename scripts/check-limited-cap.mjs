import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
try {
await page.goto('http://127.0.0.1:5176');
await page.evaluate(()=>localStorage.setItem('atlas-modes-v1',JSON.stringify({version:1,mode:'pack',inventory:{},decks:{},packsOpened:5})));
await page.goto('http://127.0.0.1:5176/?mode=pack#packs');
await page.waitForFunction(()=>document.body.dataset.phase==='sealed');
await page.locator('#scene canvas').click({position:{x:10,y:10}});await page.keyboard.press('Space');
await page.waitForFunction(()=>document.body.dataset.phase==='browsing');
await expect(page.locator('.packs-link')).toBeHidden();
await page.locator('#reveal-all').click();
await page.waitForFunction(()=>document.body.dataset.phase==='summary');
await expect(page.locator('#primary')).toBeHidden();
await page.locator('[data-tab=All]').focus();await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
expect(await page.locator('body').getAttribute('data-phase')).toBe('summary');
expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('atlas-modes-v1')).packsOpened)).toBe(6);
await page.reload();await expect(page.locator('#grid-wrap')).toBeVisible();await expect(page.locator('.packs-link')).toBeHidden();
await page.screenshot({path:'test-results/limited-six-desktop.png'});
for(const width of [320,390,844,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
await page.evaluate(()=>localStorage.setItem('atlas-modes-v1',JSON.stringify({version:1,mode:'pack',inventory:{},decks:{},packsOpened:0})));
await page.goto('http://127.0.0.1:5176/?mode=pack');await expect(page.locator('.packs-link')).toBeVisible();await page.screenshot({path:'test-results/limited-tabs-desktop.png'});
console.log('PASS sixth pack grant, hidden tab and next action, keyboard guard, reload/hash guard, responsive widths');
}finally{await browser.close();}

