import * as THREE from 'three';

// Effects are strictly outside the rounded card silhouette. Artwork is never shaded or recolored.
export const rarityFinish = Object.freeze({
  Common: { tier: 0, color: '#8b93a8', strength: 0 },
  Peculiar: { tier: 1, color: '#9aa7ff', strength: 1.18 },
  Exceptional: { tier: 2, color: '#f2c45e', strength: 1.53 },
  Ingenious: { tier: 3, color: '#bd8aff', strength: 1.89 },
});
export function makeRarityHalo(width, height, radius, rarity) {
  const finish = rarityFinish[rarity] || rarityFinish.Common;
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.NormalBlending,
    uniforms: { uColor:{value:new THREE.Color(finish.color)}, uStrength:{value:0},
      uSize:{value:new THREE.Vector2(width,height)}, uTime:{value:0}, uTier:{value:finish.tier}, uRadius:{value:radius}, uMotion:{value:1}, uAge:{value:10} },
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      varying vec2 vUv; uniform vec3 uColor; uniform float uStrength,uTime,uTier,uRadius,uMotion,uAge; uniform vec2 uSize;
      void main(){
        vec2 p=(vUv-.5)*(uSize+vec2(.36));
        vec2 q=abs(p)-(uSize*.5-vec2(uRadius));
        float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-uRadius;
        // Never draw over the face; the thin ring and light sit outside its contour.
        if(d<0.0) discard;
        // Light hugs the edge and fades continuously; no distant expanding frame.
        float halo=exp(-d*36.0);
        float rim=exp(-pow((d-.005)/.006,2.0));
        float angle=atan(p.y,p.x)/6.28318+.5;
        float glintCount=uTier>2.5?3.0:uTier>1.5?2.0:1.0;
        float distanceToGlint=abs(fract(angle*glintCount-uTime*.12+.5)-.5);
        float glint=exp(-pow(distanceToGlint/.06,2.0))*exp(-d*60.0)*uMotion;
        // Spatial gradients around the perimeter, entirely outside the artwork.
        vec3 secondColor=uTier>2.5?vec3(.84,.56,.96):uTier>1.5?vec3(.96,.66,.24):vec3(.42,.48,.96);
        float gradient=.5+.5*sin(angle*6.28318-1.0);
        vec3 color=mix(uColor,secondColor,gradient*.75);
        color=mix(color,vec3(.84,.94,1.0),glint*.40);
        float alpha=(halo*.43+rim*.50+glint*.20)*uStrength;
        alpha*=1.0-smoothstep(.10,.17,d);
        gl_FragColor=vec4(color,min(alpha,.88));
        #include <colorspace_fragment>
      }`,
  });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width+.36,height+.36),material);
  mesh.visible=false;
  return mesh;
}
