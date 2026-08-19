import * as THREE from 'three';
import { blackbody } from '../util/blackbody.js';

export interface SceneHandle {
  update(elapsed: number): void;
  dispose(): void;
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  attribute vec3 aColor;
  attribute float aSize;
  attribute vec2 aPhase;
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * (uScale / max(0.1, -mv.z));
    vColor = aColor;
    vTwinkle = 0.72 + 0.28 * sin(uTime * aPhase.y + aPhase.x);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float disk = smoothstep(1.0, 0.12, d);
    float core = smoothstep(0.5, 0.0, d);
    float a = disk * vTwinkle;
    vec3 col = vColor * (0.7 + 1.1 * core);
    gl_FragColor = vec4(col * a, a);
  }
`;

/**
 * Distant starfield: a single THREE.Points draw call with
 * blackbody-colored stars on a spherical shell. Per-vertex
 * twinkle and analytic point-sprite discs (no textures).
 */
export function createStarfield(scene: THREE.Scene, count: number, getScale: () => number): SceneHandle {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const radius = 900 + Math.random() * 600;

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const roll = Math.random();
    let kelvin: number;
    if (roll < 0.9) {
      kelvin = 3000 + Math.random() * 6000; // main sequence
    } else if (roll < 0.98) {
      kelvin = 2400 + Math.random() * 1200; // red giants
    } else {
      kelvin = 12000 + Math.random() * 18000; // hot blue stars
    }
    const [r, g, b] = blackbody(kelvin);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;

    sizes[i] = 0.8 + Math.pow(Math.random(), 9.0) * 3.4;
    phases[i * 2] = Math.random() * Math.PI * 2;
    phases[i * 2 + 1] = 0.3 + Math.random() * 1.6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 2));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  return {
    update(elapsed) {
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uScale.value = getScale();
    },
    dispose() {
      points.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
