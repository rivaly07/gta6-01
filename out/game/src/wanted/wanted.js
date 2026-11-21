// Wanted level: heat accumulates from crimes, stars derive from heat, police spawn and pursue,
// and the level cools down when nothing happens for a while.

import { WANTED, WORLD } from '../config.js';

export function createWantedSystem(state, vehicleSystem, collision, random, audio, effects) {
  const starsToHeat = [0, 1.0, 2.4, 4.2, 6.4, 9.0];

  function starsForHeat(heat) {
    let s = 0;
    for (let i = 1; i <= WANTED.maxStars; i++) {
      if (heat >= starsToHeat[i]) s = i;
    }
    return s;
  }

  function addHeat(amount) {
    const w = state.wanted;
    if (state.player.dead) return;
    w.heat = Math.min(starsToHeat[WANTED.maxStars] + 2, w.heat + amount);
    w.decayTimer = WANTED.decayDelay;
    const newStars = starsForHeat(w.heat);
    if (newStars > w.stars) {
      w.stars = newStars;
      state.hud.starsFlash = 1.2;
      state.hud.toast = newStars >= 3 ? 'POLICE ALERTED' : 'WANTED';
      state.hud.toastTimer = 2.0;
      if (audio) audio.play('sirenBlip');
    }
  }

  function clearWanted() {
    state.wanted.heat = 0;
    state.wanted.stars = 0;
    state.wanted.decayTimer = 0;
    for (const cop of state.wanted.police.slice()) removePolice(cop);
  }

  function spawnPolice() {
    const p = state.player;
    const w = state.wanted;
    if (w.police.length >= Math.min(WANTED.maxPolice, w.stars + 1)) return;

    for (let attempt = 0; attempt < 14; attempt++) {
      // Prefer spawning behind the player on a road
      const angle = Math.random() * Math.PI * 2;
      const dist = WANTED.spawnDist + Math.random() * 40;
      let x = p.x + Math.cos(angle) * dist;
      let z = p.z + Math.sin(angle) * dist;

      const b = cityDataBounds();
      x = Math.max(b.minX + 8, Math.min(b.maxX - 8, x));
      z = Math.max(b.minZ + 8, Math.min(b.maxZ - 8, z));

      // Snap to the nearest road line
      const snapped = snapToRoad(x, z);
      x = snapped.x;
      z = snapped.z;

      if (collision.pointBlocked(x, 1, z, 1.2)) continue;

      const yaw = Math.atan2(p.x - x, p.z - z) + Math.PI;
      const v = vehicleSystem.spawn('police', x, z, yaw, { driver: 'police' });
      v.ai = {
        kind: 'police',
        targetX: p.x,
        targetZ: p.z,
        stuck: 0,
        ramCooldown: 0,
        shootCooldown: 1.5 + Math.random() * 1.5,
      };
      w.police.push(v);
      return v;
    }
    return null;
  }

  function removePolice(v) {
    const i = state.wanted.police.indexOf(v);
    if (i >= 0) state.wanted.police.splice(i, 1);
    vehicleSystem.remove(v);
  }

  function cityDataBounds() {
    const half = (WORLD.blocksX * WORLD.blockSize) / 2;
    return { minX: -half, maxX: half, minZ: -half, maxZ: half };
  }

  function snapToRoad(x, z) {
    const half = (WORLD.blocksX * WORLD.blockSize) / 2;
    const bs = WORLD.blockSize;
    const ix = Math.round((x + half) / bs);
    const iz = Math.round((z + half) / bs);
    const rx = -half + ix * bs;
    const rz = -half + iz * bs;
    // Pick whichever axis is closer
    if (Math.abs(x - rx) < Math.abs(z - rz)) return { x: rx + 2.4, z };
    return { x, z: rz + 2.4 };
  }

  function update(dt) {
    const p = state.player;
    const w = state.wanted;

    // Cooldown
    if (w.stars > 0) {
      w.decayTimer -= dt;
      if (w.decayTimer <= 0) {
        w.heat = Math.max(0, w.heat - WANTED.decayRate * dt);
        const s = starsForHeat(w.heat);
        if (s < w.stars) {
          w.stars = s;
          if (w.stars === 0) {
            state.hud.toast = 'YOU LOST THE COPS';
            state.hud.toastTimer = 2.4;
          }
        }
      }
    }

    // Spawn police to match the star count
    if (w.stars > 0 && !p.dead) {
      const want = Math.min(WANTED.maxPolice, w.stars + 1);
      if (w.police.length < want && Math.random() < dt * 1.4) spawnPolice();
    }

    // Despawn far or wrecked police
    for (let i = w.police.length - 1; i >= 0; i--) {
      const cop = w.police[i];
      const d = Math.hypot(cop.x - p.x, cop.z - p.z);
      if (d > WANTED.despawnDist || cop.health <= 0) {
        if (cop.health <= 0) {
          effects.explosion(cop.x, 0.8, cop.z);
          audio.play('explode');
          state.camera.shake = Math.min(1.2, state.camera.shake + 0.5);
        }
        removePolice(cop);
      }
    }

    // Police driving + shooting
    for (const cop of w.police) {
      const ai = cop.ai;
      if (!ai) continue;
      ai.ramCooldown -= dt;
      ai.shootCooldown -= dt;

      const dx = p.x - cop.x;
      const dz = p.z - cop.z;
      const dist = Math.hypot(dx, dz);

      // Desired heading straight at the player
      const wantYaw = Math.atan2(-dx, -dz);
      let diff = wantYaw - cop.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      const steer = Math.max(-1, Math.min(1, diff * 2.2));

      let throttle = 0.72;
      if (dist < 9) throttle = -0.4;
      else if (Math.abs(diff) > 0.9) throttle = 0.28;

      // Avoid ramming walls: sample ahead
      const fx = -Math.sin(cop.yaw);
      const fz = -Math.cos(cop.yaw);
      const hit = collision.raycast({ x: cop.x, y: 0.7, z: cop.z }, { x: fx, y: 0, z: fz }, 12);
      if (hit) {
        throttle = -0.5;
        // Steer away from the wall
        const away = hit.collider
          ? Math.atan2(cop.x - (hit.collider.minX + hit.collider.maxX) / 2,
                       cop.z - (hit.collider.minZ + hit.collider.maxZ) / 2)
          : cop.yaw;
        let ad = away - cop.yaw;
        while (ad > Math.PI) ad -= Math.PI * 2;
        while (ad < -Math.PI) ad += Math.PI * 2;
        vehicleSystem.stepVehicle(cop, dt, { throttle, steer: Math.max(-1, Math.min(1, ad * 2)), handbrake: false });
      } else {
        vehicleSystem.stepVehicle(cop, dt, { throttle, steer, handbrake: false });
      }

      // Shooting at the player when close and roughly facing
      if (dist < 34 && dist > 5 && Math.abs(diff) < 0.55 && ai.shootCooldown <= 0 && !p.inVehicle) {
        ai.shootCooldown = 0.85 + Math.random() * 0.9;
        policeShoot(cop, dist);
      }

      // Ram damage
      if (dist < 3.2 && cop.speed > 4 && ai.ramCooldown <= 0) {
        ai.ramCooldown = 1.4;
        if (state.onPlayerHit) state.onPlayerHit(8, cop.x, cop.z);
        state.camera.shake = Math.min(1, state.camera.shake + 0.4);
        audio.play('crash');
      }

      // Stuck recovery: reverse for a moment
      if (cop.speed < 0.6) {
        ai.stuck += dt;
        if (ai.stuck > 2.2) {
          ai.stuck = 0;
          vehicleSystem.stepVehicle(cop, dt, { throttle: -1, steer: -steer, handbrake: false });
        }
      } else {
        ai.stuck = 0;
      }
    }

    // Siren phase for the light bar
    w.sirenPhase += dt * 2;
  }

  function policeShoot(cop, dist) {
    const p = state.player;
    const hitChance = Math.max(0.16, 0.72 - dist * 0.012);
    audio.play('shot', 'Pistol');
    effects.muzzleFlash({ x: cop.x, y: 1.1, z: cop.z }, cop.yaw, 0);
    // Tracer from the car to the player
    effects.tracer(
      { x: cop.x, y: 1.1, z: cop.z },
      { x: p.x, y: 1.3, z: p.z }
    );
    if (Math.random() < hitChance) {
      if (state.onPlayerHit) state.onPlayerHit(7 + Math.random() * 6, cop.x, cop.z);
    }
  }

  function killPedCrime() { addHeat(WANTED.crimeHeat.ped); }
  function killCopCrime() { addHeat(WANTED.crimeHeat.cop); }
  function stealCarCrime() { addHeat(WANTED.crimeHeat.steal); }
  function fireGunCrime() { addHeat(WANTED.crimeHeat.shot); }

  return {
    update, addHeat, clearWanted, spawnPolice, removePolice,
    killPedCrime, killCopCrime, stealCarCrime, fireGunCrime,
    get stars() { return state.wanted.stars; },
  };
}
