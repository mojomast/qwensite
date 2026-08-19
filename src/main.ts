import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createStarfield } from './scene/starfield.js';
import { createGalaxy, createBackgroundGalaxy } from './scene/galaxy.js';
import { createNebulae, createCosmicBackdrop } from './scene/nebulae.js';
import { createDust } from './scene/dust.js';

interface Params {
  stars: number;
  galaxy: number;
  backgroundGalaxies: number;
  dust: number;
  nebulae: number;
  pixelRatio: number;
  lowPower: boolean;
}

function getParams(): Params {
  const qs = new URLSearchParams(window.location.search);
  const manualLow = qs.get('perf') === 'low';
  const lowPower = manualLow || /Mobi|Android/i.test(navigator.userAgent);
  return {
    stars: lowPower ? 90_000 : 250_000,
    galaxy: lowPower ? 60_000 : 140_000,
    backgroundGalaxies: lowPower ? 1 : 2,
    dust: lowPower ? 16_384 : 65_536,
    nebulae: lowPower ? 8 : 16,
    pixelRatio: Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2),
    lowPower,
  };
}

const params = getParams();

const container = document.getElementById('scene');
if (!container) {
  throw new Error('#scene container missing');
}

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
  stencil: false,
});
renderer.setPixelRatio(params.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(3.5, 5.5, 11);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.minDistance = 2;
controls.maxDistance = 60;
controls.zoomSpeed = 0.8;

// pause auto-orbit while the user interacts, resume after idle
let idleTimer: ReturnType<typeof setTimeout> | undefined;
controls.addEventListener('start', () => {
  controls.autoRotate = false;
  if (idleTimer !== undefined) clearTimeout(idleTimer);
});
controls.addEventListener('end', () => {
  if (idleTimer !== undefined) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    controls.autoRotate = true;
  }, 8000);
});

const getScale = (): number => {
  const heightPx = window.innerHeight * renderer.getPixelRatio();
  return heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
};

const handles = [
  createCosmicBackdrop(scene, params.lowPower),
  createStarfield(scene, params.stars, getScale),
  createGalaxy(scene, camera, params.galaxy, getScale),
  createNebulae(scene, camera, params.nebulae, params.lowPower),
];
const dust = createDust(renderer, scene, params.dust, getScale);

for (let i = 0; i < params.backgroundGalaxies; i++) {
  const angle = i * Math.PI * 0.9 + 2.1;
  const pos = new THREE.Vector3(Math.cos(angle) * 42, -10 + i * 16, Math.sin(angle) * 38);
  handles.push(createBackgroundGalaxy(scene, pos, params.lowPower ? 9_000 : 14_000, getScale));
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.55, 0.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- HUD ----------

const fpsEl = document.getElementById('fps');
const countEl = document.getElementById('count');
const modeEl = document.getElementById('mode');
const hudEl = document.getElementById('hud');
const veilEl = document.getElementById('veil');

if (modeEl) {
  modeEl.textContent = params.lowPower ? 'eco' : 'full';
}
const particleTotal =
  params.stars +
  params.galaxy +
  params.backgroundGalaxies * (params.lowPower ? 9_000 : 14_000) +
  params.dust;
if (countEl) {
  countEl.textContent = particleTotal.toLocaleString('en-US');
}

let hudVisible = true;
let fpsSmooth = 60;
let hudClock = 0;
let started = false;

// ---------- loop ----------

const clock = new THREE.Clock();
let elapsed = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  controls.update();
  for (const handle of handles) {
    handle.update(elapsed);
  }
  dust.update(dt);
  composer.render();

  if (!started) {
    started = true;
    veilEl?.classList.add('fade');
  }

  if (fpsEl) {
    const inst = dt > 0 ? 1 / dt : 60;
    fpsSmooth += (inst - fpsSmooth) * 0.05;
    hudClock += dt;
    if (hudClock > 0.4) {
      hudClock = 0;
      fpsEl.textContent = String(Math.round(Math.min(240, Math.max(1, fpsSmooth))));
    }
  }
});

// ---------- resize ----------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- keys ----------

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.code === 'Space') {
    event.preventDefault();
    controls.autoRotate = !controls.autoRotate;
  } else if (event.key === 'r' || event.key === 'R') {
    camera.position.set(3.5, 5.5, 11);
    controls.target.set(0, 0, 0);
    controls.autoRotate = true;
  } else if (event.key === 'h' || event.key === 'H') {
    hudVisible = !hudVisible;
    if (hudEl) {
      hudEl.style.display = hudVisible ? '' : 'none';
    }
  }
});
