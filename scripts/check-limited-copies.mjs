import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 const origin=process.env.ATLAS_TEST_URL||'http://127.0.0.1:5174';
 await page.goto(origin);
 const api=await(await page.request.get(origin+'/api/cards')).json();
 const card=Object.values(api.decks).flat()[0];
 const resource=api.resources.find(c=>c.resourceType==='peculiar');
 await page.evaluate(({card,resource})=>localStorage.setItem('atlas-modes-v1',JSON.stringify({version:1,mode:'pack',inventory:{[card.path]:6,[resource.path]:5},decks:{}})),{card,resource});
 await page.goto(origin+'/?mode=pack');
 const select=c=>page.locator('#grid .card-slot').filter({has:page.getByAltText(c.name,{exact:true})});
 for(let i=0;i<7;i++)await select(card).click();
 await expect(page.locator('#card-total')).toContainText('6 / 40');
 await expect(select(card)).toHaveClass(/maxed/);
 await page.reload();await expect(page.locator('#card-total')).toContainText('6 / 40');
 await page.locator('[data-tab=Resource]').click();
 for(let i=0;i<6;i++)await select(resource).click();
 await expect(page.locator('#card-total')).toContainText('5 / 20');
 await page.reload();await page.locator('[data-tab=Resource]').click();await expect(page.locator('#card-total')).toContainText('5 / 20');
 await page.locator('#mode-toggle').click();await page.locator('#mode-menu [data-mode=normal]').click();
 await page.locator('[data-tab=All]').click();for(let i=0;i<4;i++)await select(card).click();
 await expect(page.locator('#card-total')).toContainText('3 / 40');
 await page.locator('[data-tab=Resource]').click();for(let i=0;i<4;i++)await select(resource).click();
 await expect(page.locator('#card-total')).toContainText('3 / 20');
 console.log('PASS Limited owned copies, ownership caps, reload, and Constructed copy limits');
} finally {await browser.close();}
