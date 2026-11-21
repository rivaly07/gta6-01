// Save/load to localStorage: money, health, wanted, completed missions, position, weapons.

import { SAVE_CFG, WEAPONS } from '../config.js';

export function createSaveSystem(state, seed) {
  function snapshot() {
    const p = state.player;
    return {
      v: SAVE_CFG.version,
      seed,
      t: Math.round(state.time),
      money: p.money,
      health: Math.round(p.health),
      armour: Math.round(p.armour),
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      z: Math.round(p.z * 10) / 10,
      yaw: Math.round(p.yaw * 100) / 100,
      weapon: p.weapon,
      unlocked: p.unlocked.slice(),
      ammo: { ...p.ammo },
      reserve: { ...p.reserve },
      completed: state.mission.completed.slice(),
      failed: state.mission.failedCount,
      stars: state.wanted.stars,
      heat: Math.round(state.wanted.heat * 100) / 100,
    };
  }

  function save(slot = 0) {
    try {
      const key = SAVE_CFG.key + '.' + slot;
      const data = snapshot();
      window.localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  function load(slot = 0) {
    try {
      const key = SAVE_CFG.key + '.' + slot;
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.v !== SAVE_CFG.version) return null;
      return data;
    } catch {
      return null;
    }
  }

  function hasSave(slot = 0) {
    try {
      return window.localStorage.getItem(SAVE_CFG.key + '.' + slot) !== null;
    } catch {
      return false;
    }
  }

  function apply(data) {
    const p = state.player;
    p.money = data.money ?? 0;
    p.health = Math.max(25, data.health ?? 100);
    p.armour = data.armour ?? 0;
    p.x = data.x ?? 0;
    p.y = data.y ?? 0;
    p.z = data.z ?? 0;
    p.yaw = data.yaw ?? 0;
    p.weapon = data.weapon ?? 'pistol';
    p.unlocked = Array.isArray(data.unlocked) ? data.unlocked.slice() : ['pistol'];

    for (const id of Object.keys(WEAPONS)) {
      p.ammo[id] = data.ammo?.[id] ?? 0;
      p.reserve[id] = data.reserve?.[id] ?? 0;
    }
    if (!p.unlocked.includes(p.weapon)) p.weapon = 'pistol';
    if ((p.ammo[p.weapon] ?? 0) === 0 && (p.reserve[p.weapon] ?? 0) === 0) {
      p.ammo.pistol = WEAPONS.pistol.mag;
      p.reserve.pistol = WEAPONS.pistol.reserve;
      if (!p.unlocked.includes('pistol')) p.unlocked.push('pistol');
    }

    state.mission.completed = Array.isArray(data.completed) ? data.completed.slice() : [];
    state.mission.failedCount = data.failed ?? 0;
    state.wanted.stars = data.stars ?? 0;
    state.wanted.heat = data.heat ?? 0;
  }

  function clear(slot = 0) {
    try {
      window.localStorage.removeItem(SAVE_CFG.key + '.' + slot);
    } catch { /* ignore */ }
  }

  return { save, load, hasSave, apply, clear, snapshot };
}
