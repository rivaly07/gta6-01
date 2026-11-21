// All tuning numbers in one place. Deterministic simulation: nothing here depends on the clock.

export const STEP = 1 / 60;

export const WORLD = {
  blocksX: 16,
  blocksZ: 16,
  blockSize: 80,
  roadWidth: 12,
  sidewalkWidth: 4,
  fogNear: 90,
  fogFar: 420,
  fogColor: 0x243040,
  shadowMapSize: 2048,
};

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 8.4,
  radius: 0.4,
  height: 1.75,
  eyeHeight: 1.55,
  accel: 28,
  friction: 12,
  jumpSpeed: 5.2,
  gravity: 22,
  maxHealth: 100,
  maxArmour: 100,
  regenDelay: 6,
  regenRate: 4,
};

export const CAMERA = {
  footDist: 4.6,
  footHeight: 1.5,
  vehicleDist: 7.2,
  vehicleHeight: 2.6,
  lerpFoot: 10,
  lerpVehicle: 6,
  fov: 72,
  minPitch: -0.85,
  maxPitch: 0.55,
  mouseSensitivity: 0.0022,
};

export const VEHICLE_TYPES = {
  sedan: {
    label: 'Sentinel', mass: 1400, force: 8600, brake: 14000,
    steer: 0.62, grip: 7.2, body: [1.9, 0.72, 4.3], cabin: [1.66, 0.62, 2.1],
    colour: 0x38506e, accent: 0x1b2733, topSpeed: 34,
  },
  muscle: {
    label: 'Rampage', mass: 1650, force: 12500, brake: 13000,
    steer: 0.52, grip: 5.4, body: [2.0, 0.62, 4.6], cabin: [1.7, 0.56, 2.0],
    colour: 0x8d2b1f, accent: 0x2a1310, topSpeed: 42,
  },
  suv: {
    label: 'Trailhead', mass: 2100, force: 10200, brake: 15000,
    steer: 0.5, grip: 6.6, body: [2.1, 0.9, 4.5], cabin: [1.9, 0.78, 2.6],
    colour: 0x2f4433, accent: 0x18241a, topSpeed: 30,
  },
  police: {
    label: 'Cruiser', mass: 1550, force: 11000, brake: 16000,
    steer: 0.6, grip: 8.0, body: [1.95, 0.7, 4.4], cabin: [1.7, 0.6, 2.1],
    colour: 0x11203f, accent: 0xe8eef7, topSpeed: 38, siren: true,
  },
};

export const TRAFFIC = {
  max: 26,
  spawnDist: 150,
  despawnDist: 210,
  speed: [7, 14],
  gap: 8.5,
};

export const PEDS = {
  max: 34,
  spawnDist: 110,
  despawnDist: 170,
  walk: [1.1, 1.8],
  fleeSpeed: 6.2,
  panicRadius: 14,
};

export const WANTED = {
  maxStars: 5,
  decayDelay: 9,
  decayRate: 0.42,
  crimeHeat: { ped: 1.0, cop: 2.0, car: 0.6, shot: 0.35, steal: 0.8 },
  maxPolice: 7,
  spawnDist: 85,
  despawnDist: 240,
};

export const MISSION = {
  markerRadius: 3.2,
  rewardScale: 1,
};

export const WEAPONS = {
  pistol:  { label: 'Pistol',  damage: 30, rate: 0.26, spread: 0.012, range: 60,  mag: 12, reserve: 96,  pellets: 1, auto: false, kick: 0.9 },
  smg:     { label: 'SMG',     damage: 20, rate: 0.075, spread: 0.042, range: 45, mag: 30, reserve: 180, pellets: 1, auto: true,  kick: 0.5 },
  rifle:   { label: 'Rifle',   damage: 52, rate: 0.19, spread: 0.008, range: 120, mag: 20, reserve: 100, pellets: 1, auto: false, kick: 1.4 },
  shotgun: { label: 'Shotgun', damage: 13, rate: 0.78, spread: 0.11, range: 24, mag: 6,  reserve: 48,  pellets: 8, auto: false, kick: 2.4 },
};

export const AUDIO_CFG = { master: 0.55, sfx: 0.8, ambience: 0.32 };

export const SAVE_CFG = { key: 'redline-city.save.v1', version: 1, autosave: 25 };

export const COLORS = {
  road: 0x33383e,
  roadLine: 0xb8b070,
  sidewalk: 0x5a5f66,
  ground: 0x1e2228,
};

export const UI_COLORS = {
  accent: '#8fe36b',
  accentDim: '#4c7a3c',
  danger: '#e8543f',
  gold: '#f0c34a',
  text: '#f2f5f8',
  dim: '#9aa6b4',
  panel: 'rgba(10, 14, 20, 0.86)',
  road: '#3b4148',
  roadEdge: '#2a2f35',
  block: '#1b2028',
  building: '#59636f',
};
