import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});const origin=process.env.ATLAS_TEST_URL||'http://127.0.0.1:5174';await mkdir('test-results/mode-menu',{recursive:true});
try {
const p=await browser.newPage({viewport:{width:1440,height:900}});await p.goto(origin+'/?mode=normal');await expect(p.locator('#mode-toggle')).toBeEnabled();
await p.locator('#mode-toggle').focus();await p.keyboard.press('ArrowDown');await expect(p.locator('#mode-menu')).toBeVisible();await expect(p.locator('[data-mode=normal][role=menuitemradio]')).toBeFocused();
await expect(p.locator('.mode-option-name')).toHaveText(['Normal','Pack mode','Anarchy']);
await p.screenshot({path:'test-results/mode-menu/desktop-open.png'});
await p.keyboard.press('End');await expect(p.locator('[data-mode=anarchy][role=menuitemradio]')).toBeFocused();await p.keyboard.press('Escape');await expect(p.locator('#mode-toggle')).toBeFocused();await expect(p.locator('#mode-menu')).toBeHidden();await expect(p.locator('#mode-name')).toHaveText('Normal');
await p.keyboard.press('Enter');await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');await expect(p.locator('#mode-name')).toHaveText('Pack mode');await expect(p.locator('#mode-toggle')).toBeFocused();await p.waitForFunction(()=>document.body.dataset.phase==='sealed');
await p.locator('#mode-toggle').click();await expect(p.locator('[data-mode=pack][role=menuitemradio]')).toHaveAttribute('aria-checked','true');await p.locator('header h1').click();await expect(p.locator('#mode-menu')).toBeHidden();
for(const width of [320,390,844]){
 await p.setViewportSize({width,height:844});await p.waitForTimeout(350);await p.locator('#mode-toggle').click();const bounds=await p.locator('#mode-menu').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await p.screenshot({path:`test-results/mode-menu/mobile-${width}.png`});await p.keyboard.press('Tab');await expect(p.locator('#mode-menu')).toBeHidden();
}
console.log('PASS custom mode menu: keyboard open/selection, Home/End, Escape/focus return, current radio, outside dismiss, Tab dismissal, three modes, mobile bounds');
}finally{await browser.close();}
