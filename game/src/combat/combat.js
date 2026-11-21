// Combat: hitscan weapon fire, muzzle flash, tracers, bullet impacts, damage resolution.

import { WEAPONS } from '../config.js';
import { isHeld, wasPressed, mouse } from '../core/input.js';

export function createCombatSystem(state, collision, pedSystem, vehicleSystem, effects, audio, wanted) {
  const gunMesh = createGunMesh();

  function update(dt) {
    const p = state.player;
    if (p.dead || p.inVehicle) {
      gunMesh.visible = false;
      return;
    }

    gunMesh.visible = true;

    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    if (p.muzzleTimer > 0) p.muzzleTimer -= dt;

    // Reload
    if (wasPressed('KeyR') && p.reloadTimer <= 0) startReload();

    if (p.reloadTimer > 0) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) finishReload();
      return;
    }

    const weapon = WEAPONS[p.weapon];
    const m = mouse();
    const wantFire = weapon.auto ? m.left : (m.leftPressed || wasPressed('Space'));
    p.aiming = m.right;

    if (wantFire && p.fireCooldown <= 0) {
      fire(weapon);
    }

    // Weapon swap
    if (wasPressed('Digit1')) selectWeapon('pistol');
    if (wasPressed('Digit2')) selectWeapon('smg');
    if (wasPressed('Digit3')) selectWeapon('rifle');
    if (wasPressed('Digit4')) selectWeapon('shotgun');
  }

  function selectWeapon(id) {
    const p = state.player;
    if (!p.unlocked.includes(id)) return;
    if (p.weapon === id) return;
    p.weapon = id;
    p.reloadTimer = 0;
    state.hud.toast = WEAPONS[id].label;
    state.hud.toastTimer = 1.2;
    audio.play('click');
  }

  function startReload() {
    const p = state.player;
    const w = WEAPONS[p.weapon];
    if (p.ammo[p.weapon] >= w.mag) return;
    if ((p.reserve[p.weapon] || 0) <= 0) return;
    p.reloadTimer = 1.1;
    audio.play('reload');
  }

  function finishReload() {
    const p = state.player;
    const w = WEAPONS[p.weapon];
    const need = w.mag - p.ammo[p.weapon];
    const have = p.reserve[p.weapon] || 0;
    const take = Math.min(need, have);
    p.ammo[p.weapon] += take;
    p.reserve[p.weapon] = have - take;
  }

  function fire(weapon) {
    const p = state.player;
    if (p.ammo[p.weapon] <= 0) {
      audio.play('dryfire');
      p.fireCooldown = 0.25;
      startReload();
      return;
    }

    p.ammo[p.weapon] -= 1;
    p.fireCooldown = weapon.rate;
    p.muzzleTimer = 0.06;

    const origin = {
      x: p.x,
      y: p.y + 1.45,
      z: p.z,
    };

    // Aim straight down the camera's view direction with spread
    const yaw = p.yaw;
    const pitch = p.pitch;

    let hitAnything = false;

    for (let pellet = 0; pellet < weapon.pellets; pellet++) {
      const spreadX = (Math.random() - 0.5) * weapon.spread * 2;
      const spreadY = (Math.random() - 0.5) * weapon.spread * 2;

      const dir = {
        x: -Math.sin(yaw + spreadX) * Math.cos(pitch + spreadY),
        y: Math.sin(pitch + spreadY),
        z: -Math.cos(yaw + spreadX) * Math.cos(pitch + spreadY),
      };

      const end = traceShot(origin, dir, weapon, pellet);
      if (end.hit) hitAnything = true;
    }

    audio.play('shot', weapon.label);
    effects.muzzleFlash(origin, yaw, pitch);
    state.camera.shake = Math.min(1.0, state.camera.shake + weapon.kick * 0.16);

    // Gunfire scares peds and raises heat
    pedSystem.scare(p.x, p.z, 26, 1.2);
    wanted.addHeat(0.22);
  }

  function traceShot(origin, dir, weapon, pelletIndex) {
    // Raycast against world
    const worldHit = collision.raycast(origin, dir, weapon.range);
    let maxT = worldHit ? worldHit.t : weapon.range;

    // Raycast against peds
    let bestPed = null;
    let bestPedT = maxT;
    for (const ped of pedSystem.peds) {
      if (ped.state === 'dead') continue;
      const t = raySphere(origin, dir, ped.x, 1.1, ped.z, 0.62);
      if (t !== null && t < bestPedT) {
        bestPedT = t;
        bestPed = ped;
      }
    }

    // Raycast against vehicles
    let bestVeh = null;
    let bestVehT = bestPedT;
    for (const v of vehicleSystem.vehicles) {
      const t = raySphere(origin, dir, v.x, 0.9, v.z, 1.5);
      if (t !== null && t < bestVehT) {
        bestVehT = t;
        bestVeh = v;
      }
    }

    const endX = origin.x + dir.x * Math.min(bestPedT, bestVehT, maxT);
    const endY = origin.y + dir.y * Math.min(bestPedT, bestVehT, maxT);
    const endZ = origin.z + dir.z * Math.min(bestPedT, bestVehT, maxT);

    effects.tracer(origin, { x: endX, y: endY, z: endZ });

    if (bestPed && bestPedT <= bestVehT) {
      const died = pedSystem.damagePed(bestPed, weapon.damage, origin.x, origin.z);
      effects.blood(endX, endY, endZ);
      state.hud.hitMarker = 0.22;
      if (died) {
        wanted.addHeat(1.0);
        if (state.onPedKilled) state.onPedKilled(bestPed, false);
      } else {
        wanted.addHeat(0.45);
        if (state.onPedHit) state.onPedHit(bestPed);
      }
      return { hit: true, x: endX, y: endY, z: endZ };
    }

    if (bestVeh && bestVehT <= maxT) {
      bestVeh.health -= weapon.damage * 0.55;
      effects.sparks(endX, endY, endZ, dir);
      state.hud.hitMarker = 0.16;
      wanted.addHeat(0.12);
      if (bestVeh.health <= 0 && bestVeh.isPlayer) {
        // player's own car wrecking: handled by driving system
      }
      return { hit: true, x: endX, y: endY, z: endZ };
    }

    if (worldHit) {
      effects.sparks(endX, endY, endZ, dir);
      return { hit: true, x: endX, y: endY, z: endZ };
    }

    return { hit: false, x: endX, y: endY, z: endZ };
  }

  function raySphere(o, d, cx, cy, cz, r) {
    const ox = o.x - cx;
    const oy = o.y - cy;
    const oz = o.z - cz;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const c = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : null;
  }

  /** Place the gun model in front of the camera each frame. */
  function updateGunMesh(camera, dt) {
    if (!gunMesh.visible) return;
    const p = state.player;
    const sway = Math.sin(p.walkPhase * 2) * 0.012;
    const bob = Math.cos(p.walkPhase * 4) * 0.008;

    // Position relative to camera: lower-right
    const dist = 0.6;
    const rightX = Math.cos(p.yaw);
    const rightZ = -Math.sin(p.yaw);
    const fwdX = -Math.sin(p.yaw);
    const fwdZ = -Math.cos(p.yaw);

    gunMesh.position.set(
      camera.position.x + fwdX * dist + rightX * 0.26,
      camera.position.y - 0.22 + bob - p.pitch * 0.1,
      camera.position.z + fwdZ * dist + rightZ * 0.26
    );
    gunMesh.rotation.set(p.pitch, p.yaw, sway);
    gunMesh.scale.setScalar(WEAPONS[p.weapon].label === 'Rifle' ? 1.15 : 0.95);
  }

  function addWeapon(id) {
    const p = state.player;
    if (!p.unlocked.includes(id)) {
      p.unlocked.push(id);
      const w = WEAPONS[id];
      p.ammo[id] = w.mag;
      p.reserve[id] = w.reserve;
      p.weapon = id;
      state.hud.toast = `Picked up ${w.label}`;
      state.hud.toastTimer = 2.2;
      audio.play('pickup');
    } else {
      const w = WEAPONS[id];
      p.reserve[id] = Math.min(w.reserve * 2, (p.reserve[id] || 0) + w.mag);
      state.hud.toast = `+${w.mag} ${w.label} ammo`;
      state.hud.toastTimer = 1.4;
      audio.play('pickup');
    }
  }

  return { update, updateGunMesh, addWeapon, selectWeapon, gunMesh };
}

function createGunMesh() {
  const group = new THREE.Group();

  const metal = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14161a });

  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.34), metal);
  barrel.position.set(0, 0, -0.16);
  group.add(barrel);

  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.11, 0.26), metal);
  slide.position.set(0, 0.01, -0.05);
  group.add(slide);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.2, 0.1), dark);
  grip.position.set(0, -0.13, 0.05);
  grip.rotation.x = 0.28;
  group.add(grip);

  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.05), dark);
  trigger.position.set(0, -0.05, 0.01);
  group.add(trigger);

  group.visible = false;
  return group;
}
