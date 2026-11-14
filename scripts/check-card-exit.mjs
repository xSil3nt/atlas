import {mkdir} from 'node:fs/promises';
await mkdir('test-results/redesign',{recursive:true});
import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--use-gl=angle']});
try {
const page=await browser.newPage({viewport:{width:2400,height:900}});
await page.route('**/src/scene.js*',async route=>{
 const response=await route.fetch();const source=await response.text();
 await route.fulfill({response,body:source.replace('this.container = container;', 'this.container = container; window.testScene = this;')});
});
await page.goto((process.env.PACK_TEST_URL || 'http://127.0.0.1:5174/packs/'));
await expect(page.getByRole('button',{name:'Open pack',exact:true})).toBeEnabled({timeout:30000});
await page.screenshot({path:'test-results/redesign/restored-placeholder.png'});
await page.getByRole('button',{name:'Open pack',exact:true}).click();
await expect(page.locator('#inspect')).toBeVisible({timeout:30000});
for(const direction of [-1,1]){
 await page.evaluate(direction=>{
  const s=window.testScene,card=s.cards[s.index];window.exitFrames=[];
  function sample(){
   card.updateWorldMatrix(true,true);
   const xs=[];
   for(const x of [-1.1,1.1])for(const y of [-1.53,1.53])for(const z of [-.006,.006])
    xs.push(card.position.clone().set(x,y,z).applyMatrix4(card.matrixWorld).project(s.camera).x);
   window.exitFrames.push({visible:card.visible,min:Math.min(...xs),max:Math.max(...xs),scale:card.scale.x});
   if(card.visible)requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);s.next(direction);
 },direction);
 await page.waitForFunction(()=>window.exitFrames?.at(-1)?.visible===false);
 const frames=await page.evaluate(()=>window.exitFrames);
 const last=frames.filter(f=>f.visible).at(-1),hidden=frames.at(-1);
 expect(direction<0 ? hidden.max < -1 : hidden.min > 1).toBe(true);
 expect(direction<0 ? last.max < -1 : last.min > 1).toBe(true);
 expect(frames.every(f=>f.scale===1)).toBe(true);
 console.log(`PASS ${direction<0?'left':'right'}: last visible and first hidden frames fully outside 2400px viewport; full scale throughout (${frames.length} samples).`);
}
await page.screenshot({path:'test-results/redesign/after-exit-wide.png'});
}finally{await browser.close();}
