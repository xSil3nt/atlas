import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { D, stackFront, stackEnvelope } from "../packs/src/dimensions.js";
import { PackScene, cardExitPosition } from "../packs/src/scene.js";
function pouch() {
  const model = Object.create(PackScene.prototype);
  model.scene = new THREE.Scene();
  model.wrapper = new THREE.Group();
  model.wrapper.rotation.set(-0.07, -0.14, -0.05);
  model.scene.add(model.wrapper);
  model.cardRoot = new THREE.Group();
  model.cardRoot.position.set(0, D.stackY, stackFront());
  model.wrapper.add(model.cardRoot);
  model.extraction = 0;
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  model.front = model.makeFoil(-1.85, 1.61, 1, mat);
  model.back = model.makeFoil(-1.85, 1.61, -1, mat);
  model.topSeal = model.makeFoil(1.61, 1.85, 1, mat, true);
  model.backSeal = model.makeFoil(1.61, 1.85, -1, mat, true);
  model.baseFoil = model.front.geometry.attributes.position.array.slice();
  model.baseBack = model.back.geometry.attributes.position.array.slice();
  model.sealBases = [model.topSeal, model.backSeal].map((o) =>
    o.geometry.attributes.position.array.slice(),
  );
  model.deformTear(1);
  return model;
}
test("all twelve cards remain between the foil walls throughout extraction", () => {
  const m = pouch(),
    ray = new THREE.Raycaster();
  for (let step = 0; step <= 40; step++) {
    m.applyExtraction(step / 40);
    m.scene.updateMatrixWorld(true);
    for (let card = 0; card < 12; card++)
      for (const x of [-1.08, 0, 1.08])
        for (const y of [-D.cardHeight/2, 0, D.cardHeight/2])
          for (const face of [-D.thickness/2, D.thickness/2]) {
            const point = m.wrapper.worldToLocal(
              m.cardRoot.localToWorld(
                new THREE.Vector3(x, y, -card * D.pitch + face),
              ),
            );
            if (point.y > D.seamY - .03 || point.y < -1.84) continue;
            ray.set(
              new THREE.Vector3(point.x, point.y, 10),
              new THREE.Vector3(0, 0, -1),
            );
            const front = ray.intersectObject(m.front)[0];
            ray.set(
              new THREE.Vector3(point.x, point.y, -10),
              new THREE.Vector3(0, 0, 1),
            );
            const back = ray.intersectObject(m.back)[0];
            assert.ok(front && back, `Pouch walls must enclose the stack at ${JSON.stringify(point)} step ${step}`);
            assert.ok(
              point.z < front.point.z - 0.005,
              `Card ${card} crosses front foil at ${step} ${JSON.stringify(point)} front ${front.point.z}`,
            );
            assert.ok(
              point.z > back.point.z + 0.005,
              `Card ${card} crosses back foil at ${step}`,
            );
          }
  }
});
test("detaching the stack preserves its transform and extraction clears the mouth", () => {
  const m = pouch();
  m.scene.updateMatrixWorld(true);
  const before = m.cardRoot.matrixWorld.clone();
  m.beginExtraction();
  m.scene.updateMatrixWorld(true);
  assert.ok(
    before.elements.every(
      (v, i) => Math.abs(v - m.cardRoot.matrixWorld.elements[i]) < 1e-8,
    ),
  );
  m.applyExtraction(1);
  m.scene.updateMatrixWorld(true);
  const bottom = m.wrapper.worldToLocal(
    m.cardRoot.localToWorld(new THREE.Vector3(0, -D.cardHeight/2, 0)),
  );
  assert.ok(
    bottom.y > 1.61,
    "Bottom edge must leave the pouch before the stack can turn",
  );
  assert.ok(Math.abs(bottom.x) < 1e-8);
  assert.ok(Math.abs(bottom.z - stackFront()) < 1e-8);
});



test('actual complete card geometry is thinner than pitch and fits closed wrapper', () => {
 const m=pouch(); m.deformTear(0);
 const pack=Array.from({length:12},(_,i)=>({path:`card-${i}`,rarity:'Common'}));
 m.cards=[]; m.buildCards(pack);
 const bounds=new THREE.Box3().setFromObject(m.cards[0],true);
 // Transform is measured in the wrapper's rotated frame; inspect mesh-local z bounds instead.
 m.cards[0].updateMatrixWorld(true);
 let min=Infinity,max=-Infinity;
 m.cards[0].traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;const box=b.clone().applyMatrix4(o.matrix);min=Math.min(min,box.min.z);max=Math.max(max,box.max.z);}});
 m.cards[0].updateMatrixWorld(true);
 assert.ok(max-min <= D.thickness+1e-7);
 assert.ok(D.pitch>D.thickness);
 assert.ok(stackEnvelope()/2+.005 < D.foilHalfDepth);
 const ray=new THREE.Raycaster();
 for (const x of [-D.cardWidth/2,0,D.cardWidth/2]) for (const y of [D.stackY-D.cardHeight/2,D.stackY+D.cardHeight/2]) {
  ray.set(new THREE.Vector3(x,y,10),new THREE.Vector3(0,0,-1));
  const front=ray.intersectObject(m.front)[0];
  assert.ok(front.point.z>stackEnvelope()/2+.005);
 }
});


test('side folds stay welded to the deformed foil walls through partial and complete tears',()=>{
 const m=pouch();const mat=new THREE.MeshBasicMaterial();
 m.wrapperEdges=[-1,1].map(sign=>({sign,mesh:m.makeWrapperEdge(sign,mat)}));
 for(const progress of [0,.3,.7,1]) {
  m.deformTear(progress);
  for(const {sign,mesh} of m.wrapperEdges) {
   const cols=m.front.geometry.parameters.widthSegments+1;
   const p=mesh.geometry.attributes.position;
   for(let row=0;row<p.count/4;row++) for(const [j,face] of [[0,m.front],[3,m.back]]) {
    const a=face.geometry.attributes.position,i=row*cols+(sign<0?0:cols-1);
    assert.equal(p.getX(row*4+j),a.getX(i));assert.equal(p.getY(row*4+j),a.getY(i));assert.ok(p.getZ(row*4+j) === a.getZ(i), 'edge Z coordinates match, including signed zero');
   }
  }
 }
});

test('advancing cards fully clear both viewport edges at mobile, desktop and ultrawide sizes',()=>{
 for(const aspect of [.55,1.8,3.5,5]) for(const direction of [-1,1]) {
  const camera=new THREE.PerspectiveCamera(36,aspect,.1,60);
  camera.position.set(0,.05,7.5);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const root=new THREE.Group();root.position.z=.32;
  const card=new THREE.Mesh(new THREE.BoxGeometry(D.cardWidth,D.cardHeight,D.thickness));
  card.rotation.z=-direction*.06;root.add(card);root.updateMatrixWorld(true);
  card.position.copy(cardExitPosition(camera,root,card,direction));
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(card);
  for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) {
   const p=new THREE.Vector3(x,y,z).project(camera);
   assert.ok(direction*p.x>1,`Entire card must leave the screen at aspect ${aspect}`);
  }
 }
});
