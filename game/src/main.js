// Redline City — boot, fixed-step loop, system wiring, screen state machine.
// Deterministic: same seed → same city & staged frame.
// Shot mode: paints the scene twice, sets window.__shotReady = true, no rAF loop.

import { createGameState, initPlayerWeapons } from './core/state.js';
import { initInput, endFrameInput } from './core/input.js';
import { createRenderRig, createSky, updateShadowFocus } from './core/render.js';
import { initCity, getCityData, nearestRoadPoint } from './city/generator.js';
import { createCollisionWorld } from './city/collision.js';
import { createPlayerSystem } from './player/player.js';
import { createCameraSystem } from './player/camera.js';
import { createVehicleSystem } from './vehicles/vehicle.js';
import { createDrivingSystem } from './vehicles/driving.js';
import { createTrafficSystem } from './traffic/traffic.js';
import { createPedSystem } from './peds/peds.js';
import { createCombatSystem } from './combat/combat.js';
import { createEffectsSystem } from './effects/effects.js';
import { createAudioSystem } from './audio/audio.js';
import { createWantedSystem } from './wanted/wanted.js';
import { createMissionSystem } from './missions/missions.js';
import { createHud } from './hud/hud.js';
import { createUI } from './ui/ui.js';
import { createSaveSystem } from './save/save.js';
import { createRandom } from './core/random.js';
import { STEP } from './config.js';

const canvas = document.getElementById('game');
const root = document.body;

// ---- URL params -----------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const urlSeed = params.get('seed');
const shotMode = params.get('shot'); // 'start' | 'play' | 'end'
const SEED = urlSeed ? parseInt(urlSeed, 10) : 123456789;

// ---- Global game objects (assigned after boot) ----------------------------
let state = null;
let rig = null;
let systems = {};

// ---- Fixed-step loop ------------------------------------------------------
let accumulator = 0;
let lastTime = 0;

function step(dt) {
  // Core
  endFrameInput();

  // Pause handling
  if (state.paused) return;
  if (state.screen !== 'play') return;

  // Player & camera
  systems.player.update(dt);
  systems.camera.update(dt);

  // Combat (on foot only)
  if (!state.player.inVehicle) {
    systems.combat.update(dt);
    systems.combat.updateGunMesh(rig.camera, dt);
  }

  // Driving (when in vehicle)
  systems.driving.update(dt);

  // Traffic AI
  systems.traffic.update(dt, state.player.x, state.player.z);

  // Pedestrians
  systems.peds.update(dt, state.player.x, state.player.z, state.player.inVehicle);

  // Wanted / police
  systems.wanted.update(dt);

  // Missions
  systems.missions.update(dt);

  // Vehicles physics + visual update
  systems.vehicle.update(dt);

  // Effects
  systems.effects.update(dt, rig.camera);

  // Audio
  systems.audio.update(dt);

  // Update shadow frustum to follow the action
  updateShadowFocus(rig, state.player.x, state.player.z);

  // Advance time
  state.time += dt;
  state.frames++;
}

function render() {
  // Apply camera
  systems.camera.apply(rig);

  // Draw scene
  rig.renderer.render(rig.scene, rig.camera);

  // HUD overlay
  if (state.screen === 'play') {
    systems.hud.draw(state);
  }
}

// ---- Game loop (rAF) ------------------------------------------------------
function loop(ts) {
  if (state.shotMode) return; // shot mode never enters rAF

  const dt = Math.min(0.1, (ts - lastTime) / 1000);
  lastTime = ts;

  accumulator += dt;
  while (accumulator >= STEP) {
    step(STEP);
    accumulator -= STEP;
  }

  render();
  requestAnimationFrame(loop);
}

// ---- Shot staging (deterministic, no rAF) ---------------------------------
function runShot(name) {
  state.shotMode = true;

  // Run the sim forward for a fixed number of steps depending on the shot
  const shotDefs = {
    start: { steps: Math.round(5 / STEP),  titleScreen: true },
    play:  { steps: Math.round(26 / STEP), titleScreen: false },
    end:   { steps: Math.round(45 / STEP), titleScreen: false },
  };
  const def = shotDefs[name] || shotDefs.start;

  // If title screen shot, just show the title
  if (def.titleScreen) {
    state.screen = 'title';
    render();
    render(); // paint twice
    window.__shotReady = true;
    return;
  }

  // Otherwise run gameplay simulation from a fresh world
  state.screen = 'play';
  if (systems.ui) systems.ui.show('none');

  // Simple autopilot for shot staging: uses a private seeded RNG so it never
  // touches the systems' Math.random paths
  const shotRandom = createRandom(SEED + 0x9e3779b9);
  let autopilotTimer = 0;

  for (let i = 0; i < def.steps; i++) {
    if (i % 60 === 0) {
      autopilotTimer += STEP;
      if (autopilotTimer > 2) {
        autopilotTimer = 0;
        // Nudge player yaw to show traffic/peds/cops
        state.player.yaw += (shotRandom() - 0.5) * 0.3;
      }
    }
    step(STEP);
  }

  render();
  render(); // paint twice
  window.__shotReady = true;
}

// ---- System wiring --------------------------------------------------------
function wireSystems() {
  state = createGameState(SEED);
  initPlayerWeapons(state);

  // Input
  initInput(canvas);

  // Render
  rig = createRenderRig(canvas, { antialias: true });
  createSky(rig.scene);

  // City + collision
  initCity(SEED, rig.scene);
  const collision = createCollisionWorld();
  for (const c of getCityData().colliders) collision.add(c);
  systems.collision = collision;

  // Random instance for systems that need it
  const random = createRandom(SEED + 0x12345678);

  // Player & camera
  systems.player = createPlayerSystem(state, collision);
  systems.camera = createCameraSystem(state, collision);

  // Vehicles
  systems.vehicle = createVehicleSystem(state, collision, rig.scene);

  // Spawn player vehicle (a parked sedan) near the origin
  const spawnPoint = nearestRoadPoint(0, 0) || { x: 0, z: 0 };
  systems.vehicle.spawn('sedan', spawnPoint.x, spawnPoint.z, 0, { driver: null });
  systems.vehicle.spawn('muscle', spawnPoint.x + 6, spawnPoint.z, 0, { driver: null });
  systems.vehicle.spawn('suv', spawnPoint.x - 6, spawnPoint.z, 0, { driver: null });

  // Audio
  systems.audio = createAudioSystem(state);

  // Effects
  systems.effects = createEffectsSystem(rig.scene);

  // Wanted (needs audio, effects for explosions)
  systems.wanted = createWantedSystem(state, systems.vehicle, collision, random, systems.audio, systems.effects);

  // Combat (needs ped/vehicle/effects/audio/wanted)
  systems.combat = createCombatSystem(state, collision, systems.peds, systems.vehicle, systems.effects, systems.audio, systems.wanted);

  // Pedestrians
  systems.peds = createPedSystem(state, collision, rig.scene, random);

  // Traffic (needs vehicle system, collision, random)
  systems.traffic = createTrafficSystem(state, systems.vehicle, collision, random);

  // Driving (enter/exit vehicles)
  function onCrime(kind, v) {
    if (kind === 'steal_occupied') systems.wanted.stealCarCrime();
    else if (kind === 'steal') systems.wanted.stealCarCrime();
  }
  systems.driving = createDrivingSystem(state, systems.vehicle, collision, onCrime);

  // Missions
  systems.missions = createMissionSystem(state, systems.peds, systems.wanted, systems.audio, systems.effects, random);
  systems.missions.attachScene(rig.scene);

  // HUD (2D canvas overlay)
  const hudCanvas = document.createElement('canvas');
  hudCanvas.id = 'hud';
  hudCanvas.style.position = 'fixed';
  hudCanvas.style.inset = '0';
  hudCanvas.style.pointerEvents = 'none';
  hudCanvas.style.zIndex = '10';
  root.appendChild(hudCanvas);
  systems.hud = createHud(hudCanvas);

  // UI (DOM overlays)
  systems.ui = createUI(root, {
    onStart: (loadSave) => startGame(loadSave),
    onResume: () => { state.paused = false; systems.ui.show('none'); },
    onSave: () => { systems.save.save(0); systems.ui.show('none'); state.paused = false; },
    onQuit: () => quitToTitle(),
    onRespawn: () => respawnPlayer(),
    onButtonClick: () => { if (!systems.audio.isUnlocked()) systems.audio.unlock(); },
  });

  // Save
  systems.save = createSaveSystem(state, SEED);

  // Wire callbacks
  state.onPlayerHit = (amt, sx, sz) => systems.player.damage(amt, sx, sz);
  state.onPedKilled = (ped, isCop) => systems.missions.onPedKilled(ped);
  state.onPedHit = (ped) => { /* optional */ };
  state.onMissionComplete = (m) => { /* optional */ };

  // Window resize
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    rig.resize(w, h);
    systems.hud.resize(w, h);
  });

  // Pause key
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && state.screen === 'play') {
      state.paused = !state.paused;
      systems.ui.show(state.paused ? 'pause' : 'none');
    }
  });
}

// ---- Game flow ------------------------------------------------------------
function startGame(loadSave) {
  state.screen = 'play';
  state.paused = false;
  systems.ui.show('none');

  if (loadSave) {
    const data = systems.save.load(0);
    if (data) systems.save.apply(data);
  }

  // Unlock audio on first user gesture
  const unlockOnce = () => {
    systems.audio.unlock();
    window.removeEventListener('click', unlockOnce);
    window.removeEventListener('keydown', unlockOnce);
  };
  window.addEventListener('click', unlockOnce, { once: true });
  window.addEventListener('keydown', unlockOnce, { once: true });

  // Autosave
  if (state.autosaveTimer === undefined) state.autosaveTimer = 0;
  const origStep = step;
  step = function(dt) {
    origStep(dt);
    state.autosaveTimer += dt;
    if (state.autosaveTimer >= 25) {
      state.autosaveTimer = 0;
      systems.save.save(0);
    }
  };

  requestAnimationFrame(loop);
}

function quitToTitle() {
  state.screen = 'title';
  state.paused = false;
  // Full reset
  state = createGameState(SEED);
  initPlayerWeapons(state);
  systems.ui.setContinueEnabled(systems.save.hasSave(0));
  systems.ui.show('title');
}

function respawnPlayer() {
  systems.player.respawn();
  // Respawn at a safe road point
  const sp = nearestRoadPoint(0, 0) || { x: 0, z: 0 };
  state.player.x = sp.x;
  state.player.z = sp.z;
  state.player.y = 0;
  state.player.yaw = 0;
  state.screen = 'play';
  state.paused = false;
  systems.ui.show('none');
  startGame(false);
}

// ---- Boot -----------------------------------------------------------------
wireSystems();

// Shot mode or normal boot
if (shotMode) {
  runShot(shotMode);
} else {
  state.screen = 'title';
  systems.ui.setContinueEnabled(systems.save.hasSave(0));
  systems.ui.show('title');
}