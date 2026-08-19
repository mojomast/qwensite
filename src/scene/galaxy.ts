import * as THREE from 'three';

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uSpread;
  uniform float uSpin;
  uniform float uThickness;
  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;
  attribute vec3 aRand;
  attribute vec4 aData; // x: radius (0..1), y: branch index, z: size, w: colorMix
  varying vec3 vColor;

  const float BRANCHES = 3.0;

  void main() {
    float radius = pow(aData.x, 1.5) * uSpread;
    float branchAngle = (aData.y / BRANCHES) * 6.28318530;
    float spin = uTime * uSpin * (1.0 - aData.x);

    vec3 offset = aRand * (aData.x * 0.6 + 0.05);
    offset.y *= 0.35 + uThickness * pow(1.0 - aData.x, 1.5);

    float angle = branchAngle + spin;
    vec3 p = vec3(
      cos(angle) * radius + offset.x,
      offset.y,
      sin(angle) * radius + offset.z
    );

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aData.z * (uScale / max(0.1, -mv.z));

    vColor = mix(uInnerColor, uOuterColor, pow(aData.w, 2.0));
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  varying vec3 vColor;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = exp(-d * d * 3.5) * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

export interface GalaxyHandle {
  update(elapsed: number): void;
  dispose(): void;
}

interface GalaxyOptions {
  count: number;
  spread: number;
  spin?: number;
  thickness?: number;
  size?: number;
  inner?: string;
  outer?: string;
  opacity?: number;
}

function buildGalaxy(opts: GalaxyOptions) {
  const {
    count,
    spread,
    spin = 0.35,
    thickness = 0.35,
    size = 1,
    inner = '#ffb36b',
    outer = '#3b2a9e',
    opacity = 1,
  } = opts;

  const positions = new Float32Array(count * 3);
  const rand = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    data[i * 4] = Math.random();
    data[i * 4 + 1] = Math.floor(Math.random() * 3);
    data[i * 4 + 2] = (0.03 + Math.pow(Math.random(), 4) * 0.5) * size;
    data[i * 4 + 3] = Math.random();

    rand[i * 3] = Math.random() * 2 - 1;
    rand[i * 3 + 1] = (Math.random() * 2 - 1) * 0.6;
    rand[i * 3 + 2] = Math.random() * 2 - 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 3));
  geometry.setAttribute('aData', new THREE.BufferAttribute(data, 4));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 1 },
      uSpread: { value: spread },
      uSpin: { value: spin },
      uThickness: { value: thickness },
      uInnerColor: { value: new THREE.Color(inner) },
      uOuterColor: { value: new THREE.Color(outer) },
      uOpacity: { value: opacity },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Soft billboarded core glow that feeds the bloom. */
function createCoreGlow(diameter: number, color: string, opacity: number) {
  const geometry = new THREE.PlaneGeometry(diameter, diameter);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = exp(-d * d * 4.0) * uOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * a * 1.7, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * The hero spiral galaxy: ~140k points with differential rotation
 * (core spins faster), 3 arm branches, vertical bulge falloff and a
 * warm-core -> deep-purple-rim color gradient. One draw call.
 */
export function createGalaxy(
  scene: THREE.Scene,
  camera: THREE.Camera,
  count: number,
  getScale: () => number,
): GalaxyHandle {
  const galaxy = buildGalaxy({ count, spread: 5, spin: 0.5 });
  const glow = createCoreGlow(2.6, '#ffd9a8', 0.85);

  const group = new THREE.Group();
  group.add(galaxy.mesh);
  group.add(glow.mesh);
  group.rotation.set(0.22, 0, 0.04);
  scene.add(group);

  const worldQuat = new THREE.Quaternion();
  const invQuat = new THREE.Quaternion();

  return {
    update(elapsed) {
      galaxy.material.uniforms.uTime.value = elapsed;
      galaxy.material.uniforms.uScale.value = getScale();
      // billboard the core glow toward the camera
      group.updateWorldMatrix(true, false);
      group.getWorldQuaternion(worldQuat);
      invQuat.copy(worldQuat).invert();
      glow.mesh.quaternion.copy(camera.quaternion).premultiply(invQuat);
    },
    dispose() {
      group.removeFromParent();
      galaxy.dispose();
      glow.dispose();
    },
  };
}

/** Small, slow background galaxies for depth. */
export function createBackgroundGalaxy(
  scene: THREE.Scene,
  at: THREE.Vector3,
  count: number,
  getScale: () => number,
): GalaxyHandle {
  const galaxy = buildGalaxy({
    count,
    spread: 9,
    spin: 0.12,
    size: 0.55,
    opacity: 0.75,
    inner: '#b39cff',
    outer: '#1d2f6e',
  });
  const group = new THREE.Group();
  group.add(galaxy.mesh);
  group.position.copy(at);
  group.rotation.set(1.1, 0.4, 0.6);
  scene.add(group);

  return {
    update(elapsed) {
      galaxy.material.uniforms.uTime.value = elapsed;
      galaxy.material.uniforms.uScale.value = getScale();
    },
    dispose() {
      group.removeFromParent();
      galaxy.dispose();
    },
  };
}
