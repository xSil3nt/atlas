import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {D,PACK_ATLAS as A} from '../packs/src/dimensions.js';
import {PackScene} from '../packs/src/scene.js';

test('runtime texture and artist templates agree with the two-panel atlas layout',()=>{
 assert.equal(A.width,2*A.face);
 assert.equal('side' in A,false);
 for(const file of ['public/textures/pack.png','art/pack-blank.png','art/pack-guide.png','art/pack-guide-colors.png']) {
  const bytes=readFileSync(new URL('../'+file,import.meta.url));
  assert.equal(bytes.readUInt32BE(16),A.width,file+' width');
  assert.equal(bytes.readUInt32BE(20),A.height,file+' height');
 }
});

test('front and back meet at the edges without a side texture strip',()=>{
 const model=Object.create(PackScene.prototype),mat=new THREE.MeshBasicMaterial();
 model.front=model.makeFoil(-D.height/2,D.seamY,1,mat);
 model.back=model.makeFoil(-D.height/2,D.seamY,-1,mat);
 const range=mesh=>{const u=mesh.geometry.attributes.uv;let min=Infinity,max=-Infinity;for(let i=0;i<u.count;i++){min=Math.min(min,u.getX(i));max=Math.max(max,u.getX(i));}return [min,max];};
 const close=(actual,expected)=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-7));
 close(range(model.front),[0,A.face/A.width]);
 close(range(model.back),[.5,1]);
 for(const sign of [-1,1]) {
  const edge=model.makeWrapperEdge(sign,mat),uv=edge.geometry.attributes.uv,p=edge.geometry.attributes.position;
  const expected=sign>0?[(A.face-.5)/A.width,(A.face+.5)/A.width]:[.5/A.width,(A.width-.5)/A.width];
  close(range(edge),[Math.min(...expected),Math.max(...expected)]);
  const indices=edge.geometry.index.array;
  for(let i=0;i<indices.length;i+=3)close([uv.getX(indices[i]),uv.getX(indices[i+1])],[uv.getX(indices[i+2]),uv.getX(indices[i+2])]);
  for(let row=0;row<p.count/4;row++) {
   assert.equal(p.getX(row*4+1),p.getX(row*4+2));
   assert.equal(p.getY(row*4+1),p.getY(row*4+2));
   assert.equal(p.getZ(row*4+1),p.getZ(row*4+2));
  }
  edge.geometry.dispose();
 }
 for(const mesh of [model.front,model.back])mesh.geometry.dispose();mat.dispose();
});
