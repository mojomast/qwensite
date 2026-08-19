import * as THREE from 'three';

interface PlanetSpec {
  name: string;
  orbit: number;
  radius: number;
  speed: number;
  phase: number;
  spin: number;
  tilt: number;
  colors: [string, string, string];
  texture: 'rock' | 'venus' | 'earth' | 'mars' | 'gas' | 'ice';
}

interface PlanetRuntime {
  pivot: THREE.Group;
  body: THREE.Mesh;
  frame: THREE.Group;
  label: HTMLDivElement | null;
  spec: PlanetSpec;
}

export interface SolarSystemHandle {
  particleCount: number;
  update(elapsed: number): void;
  dispose(): void;
}

const PLANETS: PlanetSpec[] = [
  {
    name: 'Mercury',
    orbit: 5,
    radius: 0.42,
    speed: 2.4,
    phase: 0.4,
    spin: 0.35,
    tilt: 0.03,
    colors: ['#77736e', '#aaa49c', '#4b4947'],
    texture: 'rock',
  },
  {
    name: 'Venus',
    orbit: 7.5,
    radius: 0.68,
    speed: 1.6,
    phase: 2.35,
    spin: -0.08,
    tilt: 3.09,
    colors: ['#c99858', '#f1d294', '#93693f'],
    texture: 'venus',
  },
  {
    name: 'Earth',
    orbit: 10,
    radius: 0.78,
    speed: 1,
    phase: 4.15,
    spin: 1.1,
    tilt: 0.41,
    colors: ['#145f9e', '#52a85b', '#d9f2ff'],
    texture: 'earth',
  },
  {
    name: 'Mars',
    orbit: 13,
    radius: 0.54,
    speed: 0.75,
    phase: 5.45,
    spin: 1,
    tilt: 0.44,
    colors: ['#9f452c', '#d4774f', '#632b25'],
    texture: 'mars',
  },
  {
    name: 'Jupiter',
    orbit: 19,
    radius: 1.75,
    speed: 0.42,
    phase: 3.25,
    spin: 1.8,
    tilt: 0.05,
    colors: ['#ad805d', '#e1c098', '#704935'],
    texture: 'gas',
  },
  {
    name: 'Saturn',
    orbit: 25,
    radius: 1.55,
    speed: 0.32,
    phase: 0.95,
    spin: 1.55,
    tilt: 0.47,
    colors: ['#cbb47c', '#efe0ae', '#8f784e'],
    texture: 'gas',
  },
  {
    name: 'Uranus',
    orbit: 32,
    radius: 1.05,
    speed: 0.24,
    phase: 4.8,
    spin: -0.9,
    tilt: 1.71,
    colors: ['#55aeb8', '#a4e4e4', '#377883'],
    texture: 'ice',
  },
  {
    name: 'Neptune',
    orbit: 39,
    radius: 1,
    speed: 0.2,
    phase: 1.85,
    spin: 1.05,
    tilt: 0.49,
    colors: ['#214ba9', '#4b78df', '#172d79'],
    texture: 'ice',
  },
];

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createPlanetTexture(spec: PlanetSpec, lowPower: boolean): THREE.CanvasTexture {
  const width = lowPower ? 128 : 256;
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas unavailable');

  const random = mulberry32(spec.name.length * 9173);
  context.fillStyle = spec.colors[0];
  context.fillRect(0, 0, width, height);

  if (spec.texture === 'gas' || spec.texture === 'venus' || spec.texture === 'ice') {
    const bands = spec.texture === 'ice' ? 10 : 18;
    for (let i = 0; i < bands; i++) {
      const y = (i / bands) * height;
      const bandHeight = height / bands + 2;
      context.globalAlpha = spec.texture === 'ice' ? 0.14 : 0.26 + random() * 0.2;
      context.fillStyle = i % 3 === 0 ? spec.colors[2] : spec.colors[1];
      context.fillRect(0, y + Math.sin(i * 2.1) * 2, width, bandHeight);
    }
    if (spec.name === 'Jupiter') {
      context.globalAlpha = 0.75;
      context.fillStyle = '#a9472f';
      context.beginPath();
      context.ellipse(width * 0.72, height * 0.67, width * 0.07, height * 0.07, -0.12, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    const patches = spec.texture === 'earth' ? 28 : 45;
    for (let i = 0; i < patches; i++) {
      const x = random() * width;
      const y = random() * height;
      const rx = (0.018 + random() * 0.08) * width;
      const ry = (0.025 + random() * 0.1) * height;
      context.globalAlpha = 0.3 + random() * 0.55;
      context.fillStyle = i % 4 === 0 ? spec.colors[2] : spec.colors[1];
      context.beginPath();
      context.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    if (spec.texture === 'earth') {
      context.globalAlpha = 0.42;
      context.strokeStyle = '#f3fbff';
      context.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) {
        const y = random() * height;
        context.beginPath();
        context.moveTo(0, y);
        context.bezierCurveTo(width * 0.3, y - 9, width * 0.7, y + 9, width, y - 2);
        context.stroke();
      }
    }
  }

  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createOrbit(radius: number, segments: number): THREE.LineLoop {
  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: '#5f7594',
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
  });
  return new THREE.LineLoop(geometry, material);
}

function createRing(inner: number, outer: number, color: string, opacity: number, segments: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(inner, outer, segments);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uInner: { value: inner },
      uOuter: { value: outer },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPosition;
      void main() {
        vPosition = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vPosition;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uInner;
      uniform float uOuter;
      void main() {
        float radius = length(vPosition);
        float t = (radius - uInner) / (uOuter - uInner);
        float bands = 0.58 + 0.42 * sin(t * 94.0 + sin(t * 31.0));
        float edge = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.9, t);
        float alpha = uOpacity * edge * (0.28 + bands * 0.72);
        gl_FragColor = vec4(uColor * (0.7 + bands * 0.3), alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geometry, material);
  ring.rotation.x = Math.PI / 2;
  return ring;
}

function createBelt(count: number, inner: number, outer: number, height: number, icy: boolean): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const random = mulberry32(count + Math.round(inner * 100));
  const warm = new THREE.Color(icy ? '#6680a3' : '#806f5c');
  const bright = new THREE.Color(icy ? '#c5d8ee' : '#b9a58a');
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = inner + (outer - inner) * (random() + random()) * 0.5;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (random() + random() + random() - 1.5) * height;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    color.copy(warm).lerp(bright, random());
    color.toArray(colors, i * 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: icy ? 0.11 : 0.09,
    vertexColors: true,
    transparent: true,
    opacity: icy ? 0.52 : 0.7,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function createLabel(name: string): HTMLDivElement | null {
  const layer = document.getElementById('labels');
  if (!layer) return null;
  const label = document.createElement('div');
  label.className = 'celestial-label';
  label.textContent = name;
  layer.appendChild(label);
  return label;
}

function placeLabel(label: HTMLDivElement | null, object: THREE.Object3D, camera: THREE.Camera): void {
  if (!label) return;
  const position = object.getWorldPosition(new THREE.Vector3());
  const cameraSpace = position.clone().applyMatrix4(camera.matrixWorldInverse);
  const projected = position.project(camera);
  const visible = cameraSpace.z < 0 && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.08 && Math.abs(projected.y) < 1.08;
  label.style.opacity = visible ? '1' : '0';
  if (!visible) return;
  label.style.left = `${((projected.x + 1) * 50).toFixed(2)}vw`;
  label.style.top = `${((-projected.y + 1) * 50).toFixed(2)}vh`;
  label.style.transform = 'translate(-50%, calc(-100% - 6px))';
}

/** A compressed, readable model of the solar system. Distances and sizes are illustrative. */
export function createSolarSystem(scene: THREE.Scene, camera: THREE.Camera, lowPower: boolean): SolarSystemHandle {
  const root = new THREE.Group();
  const planets: PlanetRuntime[] = [];
  const labels: HTMLDivElement[] = [];
  const textures: THREE.Texture[] = [];
  const sphereSegments = lowPower ? 20 : 36;
  const orbitSegments = lowPower ? 80 : 144;
  const baseOrbitSpeed = Math.PI * 2 / 42;

  scene.add(root);
  root.add(new THREE.AmbientLight('#6078a8', 0.62));
  const sunlight = new THREE.PointLight('#fff0cf', 5.5, 0, 0.35);
  root.add(sunlight);

  const sunGeometry = new THREE.SphereGeometry(2.5, sphereSegments * 2, sphereSegments);
  const sunMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vPosition;
      uniform float uTime;
      void main() {
        float cells = sin(vPosition.x * 10.0 + uTime) * sin(vPosition.y * 13.0 - uTime * 0.7);
        float pulse = 0.92 + 0.08 * sin(uTime * 1.7 + vPosition.z * 8.0);
        vec3 amber = vec3(2.8, 0.72, 0.08);
        vec3 gold = vec3(4.4, 1.7, 0.28);
        gl_FragColor = vec4(mix(amber, gold, 0.55 + cells * 0.18) * pulse, 1.0);
      }
    `,
  });
  const sun = new THREE.Mesh(sunGeometry, sunMaterial);
  root.add(sun);

  const glowGeometry = new THREE.PlaneGeometry(9, 9);
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ff9f32') } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec3 uColor;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float alpha = exp(-d * d * 3.2) * 0.42;
        if (alpha < 0.006) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  root.add(glow);

  const sunLabel = createLabel('Sun');
  if (sunLabel) labels.push(sunLabel);

  for (const spec of PLANETS) {
    const orbit = createOrbit(spec.orbit, orbitSegments);
    root.add(orbit);

    const pivot = new THREE.Group();
    const frame = new THREE.Group();
    frame.position.x = spec.orbit;
    pivot.add(frame);
    root.add(pivot);

    const texture = createPlanetTexture(spec, lowPower);
    textures.push(texture);
    const geometry = new THREE.SphereGeometry(spec.radius, sphereSegments, Math.max(12, sphereSegments / 2));
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: spec.texture === 'ice' ? 0.65 : 0.82,
      metalness: 0,
    });
    const axialFrame = new THREE.Group();
    axialFrame.rotation.z = spec.tilt;
    const body = new THREE.Mesh(geometry, material);
    axialFrame.add(body);
    frame.add(axialFrame);

    if (spec.name === 'Saturn') axialFrame.add(createRing(1.95, 3.1, '#d8c38e', 0.72, lowPower ? 72 : 128));
    if (spec.name === 'Uranus') axialFrame.add(createRing(1.28, 1.68, '#8cced3', 0.22, lowPower ? 64 : 96));

    if (spec.name === 'Earth') {
      const moonPivot = new THREE.Group();
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 16, 10),
        new THREE.MeshStandardMaterial({ color: '#aaa9a3', roughness: 1 }),
      );
      moon.position.x = 1.35;
      moonPivot.add(moon);
      moonPivot.userData.speed = 1.35;
      frame.add(moonPivot);
    }

    if (spec.name === 'Jupiter') {
      const moonDistances = [2.15, 2.7, 3.35, 4.1];
      for (let i = 0; i < moonDistances.length; i++) {
        const moonPivot = new THREE.Group();
        const moon = new THREE.Mesh(
          new THREE.SphereGeometry(0.08 + i * 0.012, 12, 8),
          new THREE.MeshStandardMaterial({ color: i % 2 ? '#c9bca1' : '#91877b', roughness: 1 }),
        );
        moon.position.x = moonDistances[i];
        moonPivot.rotation.y = i * 1.45;
        moonPivot.userData.speed = 0.7 - i * 0.11;
        frame.add(moonPivot);
      }
    }

    const label = createLabel(spec.name);
    if (label) labels.push(label);
    planets.push({ pivot, body, frame, label, spec });
  }

  const asteroidCount = lowPower ? 6_000 : 16_000;
  const kuiperCount = lowPower ? 8_000 : 20_000;
  const asteroids = createBelt(asteroidCount, 15.2, 17.2, 0.42, false);
  const kuiper = createBelt(kuiperCount, 44, 52, 1.6, true);
  root.add(asteroids, kuiper);

  return {
    particleCount: asteroidCount + kuiperCount,
    update(elapsed) {
      sunMaterial.uniforms.uTime.value = elapsed;
      sun.rotation.y = elapsed * 0.05;
      glow.quaternion.copy(camera.quaternion);
      placeLabel(sunLabel, sun, camera);

      for (const planet of planets) {
        planet.pivot.rotation.y = planet.spec.phase + elapsed * baseOrbitSpeed * planet.spec.speed;
        planet.body.rotation.y = elapsed * planet.spec.spin;
        for (const child of planet.frame.children) {
          if (typeof child.userData.speed === 'number') child.rotation.y = elapsed * child.userData.speed;
        }
        placeLabel(planet.label, planet.body, camera);
      }
      asteroids.rotation.y = elapsed * 0.018;
      kuiper.rotation.y = -elapsed * 0.004;
    },
    dispose() {
      root.removeFromParent();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      for (const texture of textures) texture.dispose();
      for (const label of labels) label.remove();
    },
  };
}
