import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const tiers=['Common','Peculiar','Exceptional','Ingenious'];
await mkdir('test-results/rarity',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--use-gl=angle']});
try{
for(const reduced of [false,true]){
 const context=await browser.newContext({viewport:{width:1100,height:850},reducedMotion:reduced?'reduce':'no-preference'});

 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Shader'))errors.push(m.text());});
 await page.route('**/src/scene.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('this.container = container;','this.container = container; window.testScene=this;')});});
 await page.route('**/packs/src/main.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('draft=makePack(catalog);',"draft=['Common','Peculiar','Exceptional','Ingenious',...Array(8).fill('Common')].map(r=>catalog.find(c=>c.deck==='main'&&c.rarity===r));")});});
 await page.goto((process.env.PACK_TEST_URL || 'http://127.0.0.1:5174/packs/'));
 await page.getByRole('button',{name:'Open pack',exact:true}).click();
 await expect(page.locator('#inspect')).toBeVisible({timeout:20000});
 for(let i=0;i<4;i++){
  if(i){await page.getByRole('button',{name:'Next card',exact:true}).click();await expect(page.locator('#card-count')).toContainText(`${i+1} / 12`);}
  await expect(page.locator('#card-count')).toContainText(tiers[i]);
  await page.evaluate(()=>{const s=window.testScene;s.accent();s.cards[s.index].userData.revealedAt=performance.now()-400;});
  await page.waitForTimeout(80);
  const fx=await page.evaluate(()=>{const s=window.testScene,c=s.cards[s.index];return {tier:c.userData.halo.material.uniforms.uTier.value,motion:c.userData.halo.material.uniforms.uMotion.value,halo:c.userData.halo.visible,others:s.cards.every((o,i)=>i===s.index||!o.userData.halo.visible)};});
  expect(fx.tier).toBe(i);expect(fx.motion).toBe(reduced?0:1);expect(fx.others).toBe(true);expect(fx.halo).toBe(i>0);
  await page.screenshot({path:`test-results/rarity/${tiers[i].toLowerCase()}${reduced?'-reduced':''}.png`});
 }
 if(!reduced){
  await page.evaluate(()=>{const s=window.testScene;s.renderer.setAnimationLoop(null);s.renderer.render(s.scene,s.camera);});
  await page.screenshot({path:'test-results/rarity/art-with-effects.png',clip:{x:475,y:265,width:150,height:240}});
  await page.evaluate(()=>{const s=window.testScene;s.cards[s.index].userData.halo.visible=false;s.renderer.render(s.scene,s.camera);});
  await page.screenshot({path:'test-results/rarity/art-without-effects.png',clip:{x:475,y:265,width:150,height:240}});
  await page.evaluate(()=>{const s=window.testScene;s.renderer.setAnimationLoop(s.frame);});
 }
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 await page.screenshot({path:`test-results/rarity/ingenious-mobile${reduced?'-reduced':''}.png`});
 await page.getByRole('button',{name:'Reveal all',exact:true}).click();await expect(page.locator('#result-grid button')).toHaveCount(12);
 expect(errors).toEqual([]);console.log(`PASS four official tiers, shader compile, active-card isolation, immediate advancement and ${reduced?'static reduced-motion finishes':'animated finishes'}.`);
 await context.close();
}
}finally{await browser.close();}
