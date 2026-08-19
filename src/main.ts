import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createStarfield } from './scene/starfield.js';
import { createCosmicBackdrop } from './scene/nebulae.js';
import { createSolarSystem } from './scene/solarSystem.js';

interface Params {
  stars: number;
  pixelRatio: number;
  lowPower: boolean;
}

function getParams(): Params {
  const qs = new URLSearchParams(window.location.search);
  const manualLow = qs.get('perf') === 'low';
  const lowPower = manualLow || /Mobi|Android/i.test(navigator.userAgent);
  return {
    stars: lowPower ? 55_000 : 140_000,
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
renderer.toneMappingExposure = 0.86;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 5000);
const homePosition = new THREE.Vector3(0, 40, 76);
camera.position.copy(homePosition);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.18;
controls.minDistance = 7;
controls.maxDistance = 170;
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

const solarSystem = createSolarSystem(scene, camera, params.lowPower);
const handles = [createCosmicBackdrop(scene, params.lowPower), createStarfield(scene, params.stars, getScale), solarSystem];

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.72, 0.38, 0.9);
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
const particleTotal = params.stars + solarSystem.particleCount;
if (countEl) {
  countEl.textContent = particleTotal.toLocaleString('en-US');
}

let hudVisible = true;
let fpsSmooth = 60;
let hudClock = 0;
let started = false;

// ---------- loop ----------

let elapsed = 0;
let previousTime = performance.now();

renderer.setAnimationLoop((time) => {
  const dt = Math.min((time - previousTime) / 1000, 0.05);
  previousTime = time;
  elapsed += dt;

  controls.update();
  for (const handle of handles) {
    handle.update(elapsed);
  }
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
    camera.position.copy(homePosition);
    controls.target.set(0, 0, 0);
    controls.autoRotate = true;
  } else if (event.key === 'h' || event.key === 'H') {
    hudVisible = !hudVisible;
    if (hudEl) {
      hudEl.style.display = hudVisible ? '' : 'none';
    }
  }
});
