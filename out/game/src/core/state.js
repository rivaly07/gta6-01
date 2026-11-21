// The single mutable game state. Systems receive it; nothing global hides here.

import { PLAYER, WEAPONS } from '../config.js';

export function createGameState(seed) {
  return {
    seed,
    screen: 'title',
    time: 0,
    frames: 0,

    player: {
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      yaw: 0,
      onGround: true,
      inVehicle: null,
      health: PLAYER.maxHealth,
      armour: 0,
      dead: false,
      deadTimer: 0,
      lastHurt: -99,
      aimYaw: 0,
      pitch: 0,
      aiming: false,
      sprinting: false,
      walkPhase: 0,
      weapon: 'pistol',
      unlocked: ['pistol'],
      ammo: {},
      reserve: {},
      fireCooldown: 0,
      reloadTimer: 0,
      muzzleTimer: 0,
      money: 0,
    },

    camera: { x: 0, y: 6, z: 10, shake: 0, shakeSeed: 0 },

    vehicles: [],
    nextVehicleId: 1,

    peds: [],
    nextPedId: 1,

    bullets: [],
    particles: [],
    pickups: [],

    wanted: {
      stars: 0,
      heat: 0,
      decayTimer: 0,
      sirenPhase: 0,
      police: [],
      nextPoliceId: 1,
    },

    mission: {
      active: null,
      stageIndex: 0,
      timer: 0,
      completed: [],
      failedCount: 0,
      bannerTimer: 0,
      bannerText: '',
      failTimer: 0,
      failText: '',
      reward: 0,
    },

    hud: {
      toast: '',
      toastTimer: 0,
      objective: '',
      starsFlash: 0,
      hitMarker: 0,
      damageFlash: 0,
      speed: 0,
    },

    time_of_day: 0.28, // 0..1 -> morning .. night
    paused: false,
    shotMode: false,
  };
}

export function initPlayerWeapons(state) {
  for (const [id, w] of Object.entries(WEAPONS)) {
    state.player.ammo[id] = 0;
    state.player.reserve[id] = 0;
  }
  state.player.ammo.pistol = WEAPONS.pistol.mag;
  state.player.reserve.pistol = WEAPONS.pistol.reserve;
}
