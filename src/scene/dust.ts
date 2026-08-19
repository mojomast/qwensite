import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

export interface DustHandle {
  update(delta: number): void;
  dispose(): void;
}

/** 3D simplex noise returning a pseudorandom vector in ~[-0.5..0.5]^3 (three.js example implementation). */
const NOISE_3D = /* glsl */ `
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  vec3 curl(vec3 p) {
    float e = 0.1;
    vec3 dx = vec3(e, 0.0, 0.0);
    vec3 dy = vec3(0.0, e, 0.0);
    vec3 dz = vec3(0.0, 0.0, e);

    vec3 n_x0 = vec3(snoise(p), snoise(p + 17.1), snoise(p + 31.7));
    vec3 n_x1 = vec3(snoise(p + dx), snoise(p + dx + 17.1), snoise(p + dx + 31.7));
    vec3 n_y0 = vec3(snoise(p + 53.1), snoise(p + 53.1 + 17.1), snoise(p + 53.1 + 31.7));
    vec3 n_y1 = vec3(snoise(p + dy), snoise(p + dy + 17.1), snoise(p + dy + 31.7));

    vec3 x = n_x1 - n_x0;
    vec3 y = n_y1 - n_y0;

    vec3 n = cross(x, y);
    float l = length(n);
    return l < 1e-4 ? vec3(0.0) : n / l;
  }
`;

const POSITION_KERNEL = /* glsl */ `
  uniform float uBound;
  uniform float uDelta;

  void mainTexture(vec2 uv) {
    vec4 pos = texture2D(texturePosition, uv);
    vec4 vel = texture2D(textureVelocity, uv);

    vec3 p = pos.xyz + vel.xyz * uDelta;
    p = mod(p + uBound, 2.0 * uBound) - uBound;

    gl_FragColor = vec4(p, 1.0);
  }

  void main() {
    mainTexture( gl_FragCoord.xy );
  }
`;

const VELOCITY_KERNEL = /* glsl */ `
  uniform float uTime;
  uniform float uBound;
  uniform float uForce;
  uniform float uDrag;

  ${NOISE_3D}

  void mainTexture(vec2 uv) {
    vec4 pos = texture2D(texturePosition, uv);
    vec4 vel = texture2D(textureVelocity, uv);

    vec3 flow = curl(pos.xyz * 0.16 + vec3(uTime * 0.015));
    vec3 v = vel.xyz + flow * uForce * 0.016;
    v *= uDrag;

    gl_FragColor = vec4(v, 1.0);
  }

  void main() {
    mainTexture( gl_FragCoord.xy );
  }
`;

const DUST_VERT = /* glsl */ `
  uniform sampler2D uPosition;
  uniform float uScale;
  uniform float uPointRadius;
  attribute vec2 aUv;
  varying float vFade;

  void main() {
    vec4 p = texture2D(uPosition, aUv);
    vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPointRadius * (uScale / max(0.1, -mv.z));
    vFade = clamp(1.0 - length(p.xyz) / 14.0, 0.2, 1.0);
  }
`;

const DUST_FRAG = /* glsl */ `
  precision highp float;
  varying float vFade;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = exp(-d * d * 4.0) * 0.36 * vFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vec3(0.72, 0.78, 0.95) * a, a);
  }
`;

/** Bound of the wrap-around box the dust lives in. */
const BOUND = 9;

/**
 * GPGPU-simulated cosmic dust: 65,536 (256x256) particles whose
 * velocity field is advected by curl noise, integrated on the GPU
 * through ping-pong fragment kernels, and rendered as soft point
 * sprites read straight from the simulation texture.
 */
export function createDust(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  getCount: number,
  getScale: () => number,
): DustHandle {
  const grid = Math.max(32, Math.round(Math.sqrt(getCount)));
  const count = grid * grid;

  const sim = new GPUComputationRenderer(grid, grid, renderer);
  const positionTexture = sim.createTexture();
  const velocityTexture = sim.createTexture();

  const initial = positionTexture.image.data as Float32Array;
  for (let i = 0; i < count; i++) {
    const x = i % grid;
    const y = Math.floor(i / grid);
    const px = ((x + 0.5) / grid) * 2.0 * BOUND - BOUND;
    const py = ((y + 0.5) / grid) * 2.0 * BOUND - BOUND;
    initial[i * 4] = px;
    initial[i * 4 + 1] = py;
    initial[i * 4 + 2] = (Math.random() * 2 - 1) * BOUND * 0.6;
    initial[i * 4 + 3] = 1;
  }

  const positionVariable = sim.addVariable('texturePosition', POSITION_KERNEL, positionTexture);
  const velocityVariable = sim.addVariable('textureVelocity', VELOCITY_KERNEL, velocityTexture);

  // addVariable() builds the material with an empty uniforms object —
  // uniform entries must be assigned as whole objects.
  positionVariable.material.uniforms.uBound = { value: BOUND };
  positionVariable.material.uniforms.uDelta = { value: 1 };
  velocityVariable.material.uniforms.uTime = { value: 0 };
  velocityVariable.material.uniforms.uBound = { value: BOUND };
  velocityVariable.material.uniforms.uForce = { value: 0.9 };
  velocityVariable.material.uniforms.uDrag = { value: 0.985 };

  // Each variable must declare itself too — init() only prepends a
  // `uniform sampler2D <name>;` per declared dependency (incl. itself),
  // which is how a kernel reads its own main texture via mainTexture().
  sim.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
  sim.setVariableDependencies(velocityVariable, [velocityVariable, positionVariable]);

  const initError = sim.init();
  const active = initError === null;
  if (!active) {
    console.warn('GPGPU dust simulation unavailable:', initError);
  }

  const geometry = new THREE.BufferGeometry();
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    uvs[i * 2] = (i % grid + 0.5) / grid;
    uvs[i * 2 + 1] = (Math.floor(i / grid) + 0.5) / grid;
  }
  const positions = new Float32Array(count * 3); // content irrelevant; UV-driven
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPosition: {
        value: active ? sim.getCurrentRenderTarget(positionVariable).texture : null,
      },
      uScale: { value: 1 },
      uPointRadius: { value: 0.024 },
    },
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.visible = active;
  scene.add(points);

  return {
    update(delta: number) {
      if (!active) return;
      positionVariable.material.uniforms.uDelta.value = Math.min(delta, 0.05) * 60;
      velocityVariable.material.uniforms.uTime.value += delta;
      sim.compute();
      material.uniforms.uPosition.value = sim.getCurrentRenderTarget(positionVariable).texture;
      material.uniforms.uScale.value = getScale();
    },
    dispose() {
      points.removeFromParent();
      sim.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
