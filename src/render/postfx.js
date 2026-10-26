import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// 後製：場景先畫進離屏緩衝，再用深度圖描出動畫風黑邊，加上泛光、色調與暗角。
const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const fragmentShader = /* glsl */`
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform float near;
  uniform float far;
  uniform float thickness;
  varying vec2 vUv;

  // 取 1/距離：平面在螢幕上是線性的，二階差分為 0，所以只有輪廓和轉折會被描邊
  float invZ(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return 1.0 / -perspectiveDepthToViewZ(d, near, far);
  }

  void main() {
    vec2 px = thickness / resolution;
    vec3 c = texture2D(tColor, vUv).rgb;

    float wc = invZ(vUv);
    float wl = invZ(vUv - vec2(px.x, 0.0));
    float wr = invZ(vUv + vec2(px.x, 0.0));
    float wd = invZ(vUv - vec2(0.0, px.y));
    float wu = invZ(vUv + vec2(0.0, px.y));
    float lap = abs(wl + wr - 2.0 * wc) + abs(wu + wd - 2.0 * wc);
    float wMax = max(wc, max(max(wl, wr), max(wu, wd)));
    float edge = smoothstep(0.06, 0.16, lap / wMax);
    edge *= 1.0 - smoothstep(70.0, 160.0, 1.0 / wMax); // 遠處淡出，避免雜訊

    c = mix(c, c * 0.15, edge * 0.9);

    // 色調：略提飽和度，暗部偏藍、亮部偏暖
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, 1.15);
    c *= mix(vec3(0.94, 0.97, 1.06), vec3(1.04, 1.0, 0.95), smoothstep(0.1, 0.7, l));

    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q, q) * 0.45;

    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class PostFX {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());

    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality.samples,
      depthTexture: new THREE.DepthTexture(size.x, size.y),
    });
    this.bloom = quality.bloom ? new UnrealBloomPass(size.clone(), 0.35, 0.55, 1.0) : null;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        resolution: { value: size.clone() },
        near: { value: camera.near },
        far: { value: camera.far },
        thickness: { value: renderer.getPixelRatio() > 1.4 ? 1.5 : 1 },
      },
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene = new THREE.Scene();
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(size.x, size.y);
    this.bloom?.setSize(size.x, size.y);
    this.material.uniforms.resolution.value.copy(size);
  }

  render() {
    const r = this.renderer;
    // 視窗縮到最小時畫布是 0×0，跳過以免 WebGL 報錯
    if (this.target.width < 1 || this.target.height < 1) {
      this.setSize();
      if (this.target.width < 1 || this.target.height < 1) return;
    }
    r.setRenderTarget(this.target);
    r.render(this.scene, this.camera);
    this.bloom?.render(r, null, this.target, 0, false);
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }
}
