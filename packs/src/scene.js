import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  packTexture,
  cardTexture,
  tableTexture,
  preloadCards, disposeTextures,
} from "./textures.js";
import { makeRarityHalo, rarityFinish } from "./rarity-effects.js";

const clamp = THREE.MathUtils.clamp;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
import { D, stackFront, PACK_ATLAS } from './dimensions.js';
const W = D.width, H = D.height, CW = D.cardWidth, CH = D.cardHeight;
// Clear the pouch's bounding sphere for every possible rotation.
export const PACK_BACKDROP_Z = -4;

function cardShape(w, h, r) {
  const s = new THREE.Shape(),
    x = -w / 2,
    y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function surface(shape, w, h) {
  const geometry = new THREE.ShapeGeometry(shape, 12),
    p = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++)
    uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return geometry;
}

// Move the whole card beyond the camera frustum, including its rotated corners.
// A fixed scene-space destination can still be visible in a wide viewport.
export function cardExitPosition(camera, root, card, direction) {
  camera.updateMatrixWorld(true);
  root.updateWorldMatrix(true, true);
  const center = camera.worldToLocal(card.getWorldPosition(new THREE.Vector3()));
  const scale = card.getWorldScale(new THREE.Vector3());
  const radius = Math.hypot(CW, CH, D.thickness) / 2 * Math.max(scale.x, scale.y, scale.z);
  const farDepth = Math.max(.1, -center.z + radius);
  const halfView = farDepth * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV() / 2)) * camera.aspect;
  center.x = direction * (halfView + radius + .2);
  return root.worldToLocal(camera.localToWorld(center));
}

export class PackScene {
  constructor(container, { makePack, onState, onError, canOpen = () => true }) {
    this.container = container;
    this.factory = makePack;
    this.canOpen = canOpen;
    this.onState = onState;
    this.onError = onError;
    this.phase = "sealed";
    this.index = 0;
    this.tearProgress = 0;
    this.extraction = 0;
    this.jobs = [];
    this.cards = [];
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.hover = new THREE.Vector2();
    this.drag = null;
    this.tilt = new THREE.Vector2();
    this.gripRotation = new THREE.Vector2();
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0a0c12");
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    this.camera.position.set(0, 0.05, 7.5);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Foil pack. Drag the top seal to open. Tap or swipe a card to advance; use Inspect for details.",
    );
    this.renderer.domElement.setAttribute("role", "img");
    container.append(this.renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(this.renderer),
      env = new RoomEnvironment();
    this.environment = pmrem.fromScene(env, 0.035);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.32;
    env.dispose();
    pmrem.dispose();
    this.lighting();
    this.makeTable();
    this.makeWrapper();
    // Pack assets are preloaded before the scene is created.
    this.buildCards(this.factory());

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => this.pointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.pointerMove(e));
    canvas.addEventListener("pointerup", (e) => this.pointerUp(e));
    canvas.addEventListener("pointercancel", () => this.cancelDrag());
    canvas.addEventListener("lostpointercapture", () => {
      if (this.drag) this.cancelDrag();
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.onError("The 3D renderer was interrupted. Reload to continue.");
    });
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    this.renderer.setAnimationLoop(this.frame);
    this.state("sealed");
  }
  lighting() {
    this.scene.add(new THREE.HemisphereLight(0xe4e5df, 0x292f26, 0.65));
    const key = new THREE.SpotLight(0xfff1dc, 36, 30, 0.62, 0.7, 1.4);
    key.position.set(-3.4, 5.4, 6);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.00012;
    key.shadow.normalBias = 0.035;
    key.shadow.radius = 5;
    key.shadow.blurSamples = 8;
    this.scene.add(key, key.target);
    const fill = new THREE.RectAreaLight(0xd8e5f2, 3, 2.8, 6);
    fill.position.set(4, 1, 4);
    fill.lookAt(0, 0, 0);
    this.scene.add(fill);
    const strip = new THREE.RectAreaLight(0xffead1, 2.5, 1, 6);
    strip.position.set(-4, -1, 2);
    strip.lookAt(0, 0, 0);
    this.scene.add(strip);
  }
  makeTable() {
    const tex = tableTexture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 5);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({
        color: 0x0a0c12,
        map: tex,
        roughness: 0.97,
        metalness: 0.04,
      }),
    );
    // Keep the backdrop behind the full rotation envelope of the pouch.
    // A nearby plane cuts off corners when the tall pack turns away from us.
    plane.position.z = PACK_BACKDROP_Z;
    plane.receiveShadow = true;
    this.scene.add(plane);
    // A large, soft contact shadow anchors the floating object without a decorative backdrop.
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d"),
      g = ctx.createRadialGradient(64, 64, 5, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,.5)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 7),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.position.set(0.17, -0.3, PACK_BACKDROP_Z + .02);
    this.scene.add(shadow);
  }
  makeWrapper() {
    this.wrapper = new THREE.Group();
    this.wrapper.rotation.set(-0.07, -0.2, -0.095);
    this.scene.add(this.wrapper);
    this.foilMaterial = new THREE.MeshPhysicalMaterial({
      map: packTexture(),
      metalness: 0.55,
      roughness: 0.54,
      clearcoat: 0.12,
      clearcoatRoughness: 0.26,
      side: THREE.DoubleSide,
    });
    const backMaterial = this.foilMaterial.clone();
    this.front = this.makeFoil(-H / 2, H / 2 - 0.24, 1, this.foilMaterial);
    this.back = this.makeFoil(-H / 2, H / 2 - 0.24, -1, backMaterial);
    this.wrapper.add(this.front, this.back);
    const edgeMat = this.foilMaterial;
    this.wrapperEdges = [];
    for (const sign of [-1, 1]) {
      const edge = this.makeWrapperEdge(sign, edgeMat);
      this.wrapper.add(edge);
      this.wrapperEdges.push({sign, mesh: edge});
    }
    this.strip = new THREE.Group();
    this.wrapper.add(this.strip);
    const sealMat = this.foilMaterial.clone();
    sealMat.side = THREE.FrontSide;
    const backSealMat = this.foilMaterial.clone();
    backSealMat.side = THREE.BackSide;
    this.topSeal = this.makeFoil(H / 2 - 0.24, H / 2, 1, sealMat, true);
    this.topSeal.userData.part = "seal";
    this.strip.add(this.topSeal);
    const backSeal = this.makeFoil(H / 2 - 0.24, H / 2, -1, backSealMat, true);
    this.strip.add(backSeal);
    this.backSeal = backSeal;
    this.hitSeal = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 0.25, 0.42),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    );
    this.hitSeal.position.set(0, H / 2 - 0.1, D.foilHalfDepth);
    this.hitSeal.userData.part = "seal";
    this.wrapper.add(this.hitSeal);
    this.baseFoil = this.front.geometry.attributes.position.array.slice();
    this.baseBack = this.back.geometry.attributes.position.array.slice();
    this.sealBases = [this.topSeal, this.backSeal].map((o) =>
      o.geometry.attributes.position.array.slice(),
    );
  }
  makeWrapperEdge(sign, material) {
    const front = this.front.geometry.attributes.position;
    const back = this.back.geometry.attributes.position;
    const columns = this.front.geometry.parameters.widthSegments + 1;
    const rows = this.front.geometry.parameters.heightSegments + 1;
    const positions = [], indices = [], uvs = [];
    for (let row = 0; row < rows; row++) {
      const i = row * columns + (sign < 0 ? 0 : columns - 1);
      const v = (front.getY(i) + H / 2) / H;
      const {face, width} = PACK_ATLAS;
      // Duplicate the middle seam so each half extends only its own face's
      // border pixel. No side artwork or interpolation across the full atlas.
      const frontU = sign > 0 ? (face - .5) / width : .5 / width;
      const backU = sign > 0 ? (face + .5) / width : (width - .5) / width;
      for (const t of [0, .5, .5, 1]) {
        const edge = t === 0 ? front : t === 1 ? back : null;
        positions.push(
          edge ? edge.getX(i) : (front.getX(i) + back.getX(i)) / 2,
          edge ? edge.getY(i) : (front.getY(i) + back.getY(i)) / 2,
          edge ? edge.getZ(i) : (front.getZ(i) + back.getZ(i)) / 2,
        );
      }
      for (const u of [frontU, frontU, backU, backU]) uvs.push(u, v);
      if (row < rows - 1) for (const half of [0, 2]) {
        const a = row * 4 + half;
        indices.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }
  makeFoil(y0, y1, side, material, seal = false) {
    const geo = new THREE.PlaneGeometry(W, y1 - y0, 100, seal ? 9 : 95);
    geo.translate(0, (y0 + y1) / 2, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i),
        y = p.getY(i);
      const edge = 1 - Math.pow(Math.abs(x) / (W / 2), 12);
      const ripple =
        Math.sin(x * 8 + y * 3) * 0.0012 + Math.sin(x * 17 - y * 4) * 0.0007;
      let depth = .025 + edge * (D.foilHalfDepth - .025) + ripple;
      if (y > 1.48)
        depth = THREE.MathUtils.lerp(
          depth,
          0,
          clamp((y - 1.48) / 0.13, 0, 1),
        );
      let z = side * depth;
      if (y < -H / 2 + 0.18)
        z = side * (.003 + Math.sin(x * 230) * .001);
      if (seal) z = 0;
      if (seal && y > H / 2 - 0.018) y -= Math.abs(Math.sin(x * 90)) * 0.024;
      p.setXYZ(i, x, y, z);
      const across = (x + W / 2) / W;
      geo.attributes.uv.setXY(i,
        side > 0 ? across * PACK_ATLAS.face / PACK_ATLAS.width
          : (PACK_ATLAS.width - across * PACK_ATLAS.face) / PACK_ATLAS.width,
        (y + H / 2) / H,
      );
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.part = "wrapper";
    return mesh;
  }
  deformTear(progress) {
    this.tearProgress = progress;
    const frontier = W / 2 - progress * (W + 0.25);
    [this.topSeal, this.backSeal].forEach((mesh, j) => {
      const p = mesh.geometry.attributes.position,
        base = this.sealBases[j];
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3],
          y = base[i * 3 + 1],
          z = base[i * 3 + 2];
        const free = clamp((x - frontier) * 3, 0, 1);
        const pull = free * (0.2 + progress * 0.55);
        p.setXYZ(
          i,
          x - free * progress * 0.28,
          y + pull * 0.6 + Math.sin(x * 16) * 0.015 * free,
          z + pull + Math.sin(x * 8 + progress * 8) * free * 0.075,
        );
      }
      p.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    });
    [this.front, this.back].forEach((mesh, j) => {
      const p = mesh.geometry.attributes.position,
        base = j === 0 ? this.baseFoil : this.baseBack;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3],
          y = base[i * 3 + 1],
          edge = clamp((y - 1.43) / 0.18, 0, 1),
          free = clamp((x - frontier) * 3, 0, 1);
        if (edge > 0) {
          p.setY(i, y - free * edge * Math.abs(Math.sin(x * 39)) * 0.027);
          p.setZ(i, base[i * 3 + 2] + free * edge * (j === 0 ? D.mouthDepth : -D.mouthDepth));
        }
      }
      p.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    });
    // Keep side folds welded to both deformed walls.
    for (const {sign, mesh} of this.wrapperEdges || []) {
      const p = mesh.geometry.attributes.position;
      const cols = this.front.geometry.parameters.widthSegments + 1;
      const front = this.front.geometry.attributes.position;
      const back = this.back.geometry.attributes.position;
      for (let row=0; row<p.count/4; row++) {
        const i=row*cols+(sign<0?0:cols-1);
        [0, .5, .5, 1].forEach((t,j) => {
          const edge = t === 0 ? front : t === 1 ? back : null;
          p.setXYZ(row*4+j,
            edge ? edge.getX(i) : (front.getX(i) + back.getX(i)) / 2,
            edge ? edge.getY(i) : (front.getY(i) + back.getY(i)) / 2,
            edge ? edge.getZ(i) : (front.getZ(i) + back.getZ(i)) / 2,
          );
        });
      }
      p.needsUpdate=true; mesh.geometry.computeVertexNormals();
    }
  }
  buildCards(pack) {
    if (this.cardRoot) {
      this.cardRoot.removeFromParent();
      this.cards.forEach((c) => {
        c.traverse((o) => {
          if (o.isMesh) {
            o.geometry.dispose();
            o.material.dispose();
          }
        });
      });
    }
    this.cards = [];
    this.pack = pack;
    this.cardRoot = new THREE.Group();
    this.extractionOrigin = null;
    this.cardRoot.position.set(0, D.stackY, stackFront(pack.length));
    this.wrapper.add(this.cardRoot);
    const shape = cardShape(CW, CH, D.cardRadius);
    pack.forEach((card, i) => {
      const group = new THREE.Group();
      group.position.set(0, 0, -i * D.pitch);
      group.rotation.y = 0;
      group.userData.index = i;
      const edgeGeo = new THREE.ExtrudeGeometry(shape, {
        depth: .005,
        bevelEnabled: true,
        bevelSize: .0015,
        bevelThickness: .0015,
        bevelSegments: 2,
        steps: 1,
        curveSegments: 10,
      });
      edgeGeo.translate(0, 0, -.0025);
      const edge = new THREE.Mesh(
        edgeGeo,
        new THREE.MeshStandardMaterial({
          color: 0x191b16,
          roughness: 0.65,
          metalness: 0.12,
        }),
      );
      edge.castShadow = true;
      group.add(edge);
      const faceMaterial = new THREE.MeshBasicMaterial({
        map: cardTexture(card), transparent: true, alphaTest: .01, toneMapped: false,
      });
      const halo = makeRarityHalo(CW, CH, D.cardRadius, card.rarity);
      halo.position.z = D.thickness / 2 - .0002;
      group.userData.halo = halo;
      group.add(halo);
      const front = new THREE.Mesh(surface(shape, CW, CH), faceMaterial);
      front.position.z = D.thickness / 2;
      front.castShadow = true;
      group.add(front);
      const back = new THREE.Mesh(
        surface(shape, CW, CH),
        new THREE.MeshBasicMaterial({ map: cardTexture(card, true) }),
      );
      back.position.z = -D.thickness / 2;
      back.rotation.y = Math.PI;
      group.add(back);
      group.traverse((o) => {
        o.userData.index = i;
        o.userData.part = "card";
      });
      this.cards.push(group);
      this.cardRoot.add(group);
    });
    this.cardRoot.visible = true;
  }
  accent() {
    this.cards[this.index].userData.revealedAt = performance.now();
  }
  state(phase) {
    this.phase = phase;
    this.container.dataset.phase = phase;
    this.renderer.domElement.setAttribute('aria-label', phase === 'browsing'
      ? `${this.pack[this.index].name}. Drag the background or right-drag the cards to rotate the stack. Tap or swipe a card to advance. Use Inspect for details.`
      : 'Foil pack. Drag the top seal to open, or drag the body to rotate.');
    this.onState({
      phase,
      index: this.index,
      total: 12,
      rarity: this.pack?.[this.index]?.rarity,
    });
  }
  animate(duration, update, easing = easeOut) {
    return new Promise((resolve) => {
      this.jobs.push({
        start: performance.now(),
        duration: (this.reduced ? .001 : duration) * 1000,
        update,
        easing,
        resolve,
      });
    });
  }
  move(object, values, duration = 0.7, easing = easeOut) {
    const from = {};
    for (const key in values)
      from[key] = values[key].map((v, i) => object[key][["x", "y", "z"][i]]);
    return this.animate(
      duration,
      (t) => {
        for (const key in values)
          values[key].forEach((value, i) => {
            object[key][["x", "y", "z"][i]] = THREE.MathUtils.lerp(
              from[key][i],
              value,
              t,
            );
          });
      },
      easing,
    );
  }
  async tear() {
    if (!['sealed','tearing'].includes(this.phase)) return;
    this.cancelDrag();
    this.state('opening');
    this.gripRotation.set(0,0);
    const start = this.tearProgress;
    await this.animate(.16, t => this.deformTear(start + (1-start)*t));
    this.hitSeal.visible = false;
    this.move(this.strip, { position: [1.8,.8,.3], rotation: [.2,0,-.35] }, .2)
      .then(() => this.strip.visible = false);
    this.beginExtraction();
    // The entire stack clears the open mouth before its orientation changes.
    await this.animate(.32, t => this.applyExtraction(t), easeInOut);
    this.wrapper.visible = false;
    await this.move(this.cardRoot, { position: [0,0,.2], rotation: [0,0,0] }, .24);
    this.accent();
    this.state('browsing');
  }
  beginExtraction() {
    if (this.extractionOrigin) return;
    this.scene.attach(this.cardRoot);
    this.extractionOrigin = {
      cards: this.cardRoot.position.clone(), wrapper: this.wrapper.position.clone(),
      axis: new THREE.Vector3(0,1,0).applyQuaternion(this.wrapper.quaternion),
    };
  }
  applyExtraction(progress) {
    this.beginExtraction(); this.extraction = progress;
    const {cards,wrapper,axis} = this.extractionOrigin;
    this.cardRoot.position.copy(cards).addScaledVector(axis, progress * .65);
    this.wrapper.position.copy(wrapper).addScaledVector(axis, -progress * (D.extractionDistance-.65));
  }
  async next(direction = -1) {
    if (this.phase !== 'browsing') return;
    this.cancelDrag();
    this.state('advancing');
    const card = this.cards[this.index];
    const newIndex = this.index + 1;
    const exit = cardExitPosition(this.camera, this.cardRoot, card, direction);
    await Promise.all([
      // Keep moving through the edge; do not brake to a visible stop then hide.
      this.move(card, {position: exit.toArray(), rotation: [0,0,-direction*.06]}, .28, t => t * (.65 + .35 * t)),
      this.move(this.cardRoot, {position: [0,0,.2+newIndex*D.pitch]}, .28),
    ]);
    card.visible = false;
    this.index = newIndex;
    if (this.index === this.pack.length) return this.summary();
    this.accent(); this.state('browsing');
  }
  summary() {
    this.index = this.pack.length;
    this.cardRoot.visible = false;
    this.state('summary');
  }
  revealAll() {
    if (this.phase !== 'browsing') return;
    this.cancelDrag(); this.summary();
  }
  async reset() {
    if (this.phase !== 'summary' || !this.canOpen()) return;
    this.state('loading');
    try {
      const pack = this.factory(true);
      await preloadCards(pack);
      this.index=0; this.tearProgress=0; this.extraction=0;
      this.gripRotation.set(0,0); this.tilt.set(0,0);
      this.wrapper.visible=true; this.wrapper.position.set(0,0,0);
      this.wrapper.rotation.set(-.07,-.2,-.095);
      this.strip.visible=true; this.strip.position.set(0,0,0); this.strip.rotation.set(0,0,0);
      this.hitSeal.visible=true;
      this.buildCards(pack); this.deformTear(0); this.state('sealed');
    } catch (e) { this.onError(e.message); }
  }
  primary() {
    if (['sealed','tearing'].includes(this.phase)) return this.tear();
    if (this.phase === 'browsing') return this.next();
    if (this.phase === 'summary') return this.reset();
  }
  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = ['sealed','tearing'].includes(this.phase)
      ? [this.hitSeal,this.topSeal,this.backSeal,this.front,this.back]
      : this.phase === 'browsing' ? [this.cards[this.index]] : [];
    return this.raycaster.intersectObjects(targets, true)[0];
  }
  pointerDown(e) {
    if ((e.button !== 0 && !(e.button === 2 && this.phase === 'browsing')) || this.drag) return;
    const hit = this.pick(e);
    if (!hit && this.phase !== 'browsing') return;
    const local = hit && this.wrapper.worldToLocal(hit.point.clone());
    const type = ['sealed','tearing'].includes(this.phase)
      ? hit.object.userData.part === 'seal' || local.y > 1.35 ? 'tear' : 'rotate'
      : this.phase === 'browsing' ? (!hit || e.button === 2 ? 'rotateStack' : 'advance') : null;
    if (!type) return;
    this.rotationReturn = null;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.drag = {
      type,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastTime: performance.now(),
      velocity: 0,
      dx: 0,
      dy: 0,
      progress: this.tearProgress,
      rotation: this.gripRotation.clone(),
      stackRotation: this.cardRoot.rotation.clone(),
    };
    this.container.classList.add("grabbing");
    if (type === "tear") {
      this.state("tearing");
    }
  }
  pointerMove(e) {
    const r = this.container.getBoundingClientRect();
    this.hover.set(
      clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1),
      clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1),
    );
    if (!this.drag) {
      const hit = this.pick(e);
      this.container.style.cursor = hit
        ? this.phase === "sealed" && hit.object.userData.part === "seal"
          ? "ew-resize"
          : "grab"
        : this.phase === 'browsing' ? 'grab' : "default";
      return;
    }
    const d = this.drag;
    d.dx = e.clientX - d.x;
    d.dy = e.clientY - d.y;
    const time = performance.now();
    d.velocity = (e.clientX - d.lastX) / Math.max(1, time - d.lastTime);
    d.lastX = e.clientX;
    d.lastTime = time;
    const unit = Math.min(r.width * 0.65, r.height * 0.48);
    if (d.type === 'rotateStack') {
      this.cardRoot.rotation.set(
        clamp(d.stackRotation.x + d.dy * .007, -1, 1),
        d.stackRotation.y + d.dx * .009,
        d.stackRotation.z,
      );
    }
    if (d.type === "rotate") {
      this.gripRotation.set(
        clamp(d.rotation.x + d.dy * 0.007, -1, 1),
        d.rotation.y + d.dx * 0.009,
      );
    }
    if (d.type === "tear") {
      const progress = clamp(
        d.progress + Math.abs(d.dx) / (unit * 0.83),
        this.tearProgress,
        1,
      );
      this.deformTear(progress);
      this.tilt.set(d.dy * 0.001, -d.dx * 0.0005);
      if (progress >= 0.985) {
        this.drag = null;
        this.container.classList.remove("grabbing");
        this.tear();
      }
    }
    if (d.type === 'advance') {
      const card = this.cards[this.index];
      const worldHeight = 2*this.camera.position.z*Math.tan(THREE.MathUtils.degToRad(18));
      card.position.x = d.dx / r.height * worldHeight;
      card.rotation.z = clamp(-d.dx / r.width * .22, -.085, .085);
    }
  }
  pointerUp(e) {
    const d = this.drag; this.drag = null;
    this.container.classList.remove('grabbing');
    if (!d) return;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) this.renderer.domElement.releasePointerCapture(e.pointerId);
    if (d.type === 'rotate' || d.type === 'rotateStack') {
      this.centerRotation(d.type);
      return;
    }
    const distance = Math.hypot(d.dx,d.dy);
    if (d.type === 'tear') { if (distance < 7 || this.tearProgress > .8) this.tear(); return; }
    if (d.type === 'advance') {
      const cardWidth = CW / (2*this.camera.position.z*Math.tan(THREE.MathUtils.degToRad(18))) * this.height;
      const horizontal = Math.abs(d.dx) > Math.abs(d.dy);
      const flick = Math.abs(d.dx) > cardWidth*.09 && Math.abs(d.velocity) > .55 && performance.now()-d.lastTime < 100;
      if (distance < 7 || horizontal && (Math.abs(d.dx) > cardWidth*.22 || flick)) this.next(Math.sign(d.dx)||-1);
      else this.returnCard();
    }
  }
  async returnCard() {
    const card=this.cards[this.index];
    if (!card) return;
    this.state('settling');
    await this.move(card, {position: [0,0,-this.index*D.pitch], rotation: [0,0,0]}, .16);
    this.state('browsing');
  }
  centerRotation(type) {
    const target = type === 'rotateStack' ? this.cardRoot.rotation : this.gripRotation;
    const from = {x: target.x, y: target.y};
    // Return to the nearest front-facing revolution, avoiding a long unwind.
    const homeY = Math.round(from.y / (2 * Math.PI)) * 2 * Math.PI;
    const token = this.rotationReturn = {};
    const phase = this.phase;
    this.animate(.65, t => {
      if (this.rotationReturn !== token || this.phase !== phase) return;
      target.x = THREE.MathUtils.lerp(from.x, 0, t);
      target.y = THREE.MathUtils.lerp(from.y, homeY, t);
    }, easeInOut).then(() => {
      if (this.rotationReturn === token) this.rotationReturn = null;
    });
  }
  cancelDrag() {
    const d=this.drag; this.drag=null;
    this.container.classList.remove('grabbing');
    if (d?.type === 'rotate' || d?.type === 'rotateStack') this.centerRotation(d.type);
    if (d?.type === 'advance') {
      // Cancel synchronously so a subsequent advance cannot race a return tween.
      const c=this.cards[this.index]; c.position.set(0,0,-this.index*D.pitch); c.rotation.set(0,0,0);
    }
  }
  resize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    if (!this.width || !this.height) return;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    const minWidth = 3.5;
    this.cameraTarget = Math.max(
      7.5,
      minWidth /
        (2 * Math.tan(THREE.MathUtils.degToRad(18)) * this.camera.aspect),
    );
    this.camera.updateProjectionMatrix();
  }
  frame(now) {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    for (const job of [...this.jobs]) {
      const t = clamp((now - job.start) / job.duration, 0, 1);
      job.update(job.easing(t));
      if (t >= 1) {
        this.jobs.splice(this.jobs.indexOf(job), 1);
        job.resolve();
      }
    }
    const lerp = 1 - Math.exp(-dt * 7);
    this.camera.position.z = THREE.MathUtils.lerp(
      this.camera.position.z,
      this.cameraTarget,
      lerp,
    );
    if (["sealed", "tearing"].includes(this.phase)) {
      const targetX =
          -0.07 +
          this.gripRotation.x +
          (!this.reduced ? this.hover.y * 0.045 : 0),
        targetY =
          -0.2 +
          this.gripRotation.y +
          (!this.reduced ? this.hover.x * 0.12 : 0);
      this.wrapper.rotation.x = THREE.MathUtils.lerp(
        this.wrapper.rotation.x,
        targetX,
        lerp,
      );
      this.wrapper.rotation.y = THREE.MathUtils.lerp(
        this.wrapper.rotation.y,
        targetY,
        lerp,
      );
      this.wrapper.rotation.z = THREE.MathUtils.lerp(
        this.wrapper.rotation.z,
        -0.095 + this.tilt.y * 0.1,
        lerp,
      );

    }
    this.cards.forEach((card,i) => {
      const active = card.visible && i === this.index && ['browsing','advancing','settling'].includes(this.phase);
      const halo = card.userData.halo;
      const age = (now - (card.userData.revealedAt || 0)) / 1000;
      const time = this.reduced ? 0 : now / 1000;
      halo.visible = active && rarityFinish[this.pack[i].rarity].tier > 0;
      const arrival = !this.reduced && age < .7 ? Math.sin(Math.max(0,age)/.7*Math.PI)*.18 : 0;
      halo.material.uniforms.uStrength.value = rarityFinish[this.pack[i].rarity].strength * (.90 + arrival);
      halo.material.uniforms.uTime.value = time;
      halo.material.uniforms.uAge.value = Math.max(0,age);
      halo.material.uniforms.uMotion.value = this.reduced ? 0 : 1;
    });
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.scene.traverse((o) => {
      if (o.isMesh || o.isPoints) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
      }
    });
    disposeTextures();
    this.environment.dispose();
    this.renderer.dispose();
  }
}
