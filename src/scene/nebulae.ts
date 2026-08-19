import * as THREE from 'three';

export interface SceneHandle {
  update(elapsed: number): void;
  dispose(): void;
}

const NOISE_GLSL = /* glsl */ `
  float vhash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = vhash(i);
    float b = vhash(i + vec2(1.0, 0.0));
    float c = vhash(i + vec2(0.0, 1.0));
    float d = vhash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float vfbm(vec2 p, int octaves) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 6; i++) {
      if (i >= octaves) break;
      v += amp * vnoise(p);
      p = p * 2.03 + 17.1;
      amp *= 0.5;
    }
    return v;
  }
`;

const NEBULA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform int uOctaves;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  ${NOISE_GLSL}

  void main() {
    vec2 uv = vUv - 0.5;
    float ang = uSeed * 6.2831 + uTime * 0.015;
    float c = cos(ang);
    float s = sin(ang);
    uv = mat2(c, -s, s, c) * uv;

    float n1 = vfbm(uv * 2.8 + uSeed * 7.31, uOctaves);
    float n2 = vfbm(uv * 5.2 - uSeed * 3.77, uOctaves - 1);
    float density = smoothstep(0.30, 0.92, mix(n1, n2, 0.45));
    density *= 0.55 + 0.65 * smoothstep(0.2, 0.9, n1);

    float mask = smoothstep(0.52, 0.08, length(uv));
    vec3 col = mix(uColorA, uColorB, clamp(n2 * 1.6, 0.0, 1.0));
    float a = density * mask * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * a * 2.0, a);
  }
`;

const PALETTES: readonly [string, string][] = [
  ['#a04de0', '#2a1e6e'],
  ['#4d7de0', '#1e2a6e'],
  ['#e04d8d', '#4e1e6e'],
  ['#4dd0e0', '#1e3a6e'],
  ['#e0844d', '#6e1e3a'],
  ['#8d6de0', '#3a1e6e'],
];

/**
 * FBM-noise billboard sprites: the nebulas. Cheap, layered, additive —
 * the volumetric look without a volume raymarch, and it composites
 * beautifully with bloom.
 */
export function createNebulae(scene: THREE.Scene, camera: THREE.Camera, count: number, lowPower: boolean): SceneHandle {
  const group = new THREE.Group();
  const sprites: THREE.Mesh[] = [];
  const octaves = lowPower ? 4 : 5;

  for (let i = 0; i < count; i++) {
    const size = 10 + Math.random() * 34;
    const geometry = new THREE.PlaneGeometry(size, size);
    const [ca, cb] = PALETTES[i % PALETTES.length];

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: Math.random() },
        uOpacity: { value: 0.09 + Math.random() * 0.22 },
        uOctaves: { value: octaves },
        uColorA: { value: new THREE.Color(ca) },
        uColorB: { value: new THREE.Color(cb) },
      },
      vertexShader: NEBULA_VERT,
      fragmentShader: NEBULA_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;

    const angle = Math.random() * Math.PI * 2;
    const dist = 6 + Math.random() * 58;
    mesh.position.set(
      Math.cos(angle) * dist,
      (Math.random() * 2 - 1) * (2 + Math.random() * 8),
      Math.sin(angle) * dist,
    );
    sprites.push(mesh);
    group.add(mesh);
  }

  scene.add(group);

  return {
    update(elapsed) {
      for (const mesh of sprites) {
        mesh.quaternion.copy(camera.quaternion);
        (mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
      }
    },
    dispose() {
      group.removeFromParent();
      for (const mesh of sprites) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
  };
}

const BACKDROP_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BACKDROP_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform float uTime;
  ${NOISE_GLSL}

  void main() {
    vec3 dir = normalize(vDir);

    float band = 1.0 - smoothstep(0.0, 0.55, abs(dot(dir, normalize(vec3(0.4, 1.0, 0.2)))));
    float n = vfbm(dir.xz * 3.0 + dir.y * 1.5 + uTime * 0.004, 4) * (0.55 + 0.45 * band);

    vec3 space = vec3(0.010, 0.014, 0.030);
    vec3 hazeBlue = vec3(0.020, 0.030, 0.062);
    vec3 hazeWarm = vec3(0.045, 0.024, 0.040);

    vec3 col = space + hazeBlue * n * 0.9 + hazeWarm * n * n * 0.9;
    // dither to kill banding on dark gradients
    float dither = (vhash(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(col + dither, 1.0);
  }
`;

/**
 * A huge inverted sphere wrapped in very subtle FBM haze + a faint
 * "galactic band" — keeps the background from being flat black.
 */
export function createCosmicBackdrop(scene: THREE.Scene, lowPower: boolean): SceneHandle {
  const geometry = new THREE.SphereGeometry(1700, 48, 32);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOctaves: { value: lowPower ? 3 : 4 },
    },
    vertexShader: BACKDROP_VERT,
    fragmentShader: BACKDROP_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  scene.add(mesh);

  return {
    update(elapsed) {
      material.uniforms.uTime.value = elapsed;
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
