// Pedestrians: low-poly walkers that patrol the sidewalks, scatter from gunfire and
// from cars that get too close, and can be hit.

import { PEDS, WORLD } from '../config.js';
import { cityData } from '../city/generator.js';

const SKINS = [0xc9a17a, 0x8d5f3c, 0x5c3a22, 0xe0bb95, 0x9a6a44];
const SHIRTS = [0x33475c, 0x6b3a3a, 0x3d5a3a, 0x584a6b, 0x6b6340, 0x2f2f38];
const PANTS = [0x22262c, 0x2e3540, 0x3a3128, 0x1c2028];

export function createPedSystem(state, collision, scene, random) {
  const peds = [];

  const bodyGeo = new THREE.BoxGeometry(0.52, 0.78, 0.32);
  const headGeo = new THREE.SphereGeometry(0.19, 8, 6);
  const legGeo = new THREE.BoxGeometry(0.19, 0.78, 0.22);
  const armGeo = new THREE.BoxGeometry(0.15, 0.62, 0.19);

  function spawnPed(nearX, nearZ) {
    const anchors = cityData.spawnPoints.pedestrians;
    if (!anchors.length) return null;

    for (let attempt = 0; attempt < 10; attempt++) {
      const a = anchors[Math.floor(random() * anchors.length)];
      const x = a.x + (random() - 0.5) * 26;
      const z = a.z + (random() - 0.5) * 26;
      const d = Math.hypot(x - nearX, z - nearZ);
      if (d > PEDS.despawnDist || d < 8) continue;
      if (collision.pointBlocked(x, 1, z, 0.4)) continue;

      const group = new THREE.Group();

      const skin = new THREE.MeshLambertMaterial({ color: SKINS[Math.floor(random() * SKINS.length)] });
      const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[Math.floor(random() * SHIRTS.length)] });
      const pants = new THREE.MeshLambertMaterial({ color: PANTS[Math.floor(random() * PANTS.length)] });

      const torso = new THREE.Mesh(bodyGeo, shirt);
      torso.position.y = 1.16;
      torso.castShadow = true;
      group.add(torso);

      const head = new THREE.Mesh(headGeo, skin);
      head.position.y = 1.72;
      head.castShadow = true;
      group.add(head);

      const legL = new THREE.Mesh(legGeo, pants);
      legL.position.set(-0.13, 0.39, 0);
      legL.castShadow = true;
      group.add(legL);

      const legR = new THREE.Mesh(legGeo, pants);
      legR.position.set(0.13, 0.39, 0);
      legR.castShadow = true;
      group.add(legR);

      const armL = new THREE.Mesh(armGeo, shirt);
      armL.position.set(-0.33, 1.2, 0);
      armL.castShadow = true;
      group.add(armL);

      const armR = new THREE.Mesh(armGeo, shirt);
      armR.position.set(0.33, 1.2, 0);
      armR.castShadow = true;
      group.add(armR);

      group.position.set(x, 0, z);
      group.rotation.y = random() * Math.PI * 2;
      scene.add(group);

      const ped = {
        id: state.nextPedId++,
        x, z, y: 0,
        yaw: random() * Math.PI * 2,
        speed: PEDS.walk[0] + random() * (PEDS.walk[1] - PEDS.walk[0]),
        health: 60,
        state: 'walk',        // walk | flee | dead
        stateTimer: 0,
        wanderTimer: 2 + random() * 3,
        targetX: x,
        targetZ: z,
        phase: random() * 6,
        group,
        limbs: { legL, legR, armL, armR },
        deadTimer: 0,
        hitFlash: 0,
      };
      peds.push(ped);
      return ped;
    }
    return null;
  }

  function removePed(ped) {
    const i = peds.indexOf(ped);
    if (i >= 0) peds.splice(i, 1);
    scene.remove(ped.group);
    ped.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  function pickWanderTarget(ped) {
    // Walk along the sidewalk grid: pick a nearby sidewalk anchor
    const anchors = cityData.spawnPoints.pedestrians;
    let best = null;
    let bestD = 30;
    for (let i = 0; i < 8; i++) {
      const a = anchors[Math.floor(random() * anchors.length)];
      const d = Math.hypot(a.x - ped.x, a.z - ped.z);
      if (d < bestD && d > 6) { bestD = d; best = a; }
    }
    if (best) {
      ped.targetX = best.x + (random() - 0.5) * 5;
      ped.targetZ = best.z + (random() - 0.5) * 5;
    } else {
      ped.targetX = ped.x + (random() - 0.5) * 20;
      ped.targetZ = ped.z + (random() - 0.5) * 20;
    }
  }

  function scare(x, z, radius, strength = 1) {
    for (const ped of peds) {
      if (ped.state === 'dead') continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.state = 'flee';
        ped.stateTimer = 3.5 + random() * 3 * strength;
        // Flee away from the source
        const away = Math.atan2(ped.x - x, ped.z - z);
        ped.targetX = ped.x + Math.sin(away) * 30;
        ped.targetZ = ped.z + Math.cos(away) * 30;
      }
    }
  }

  function damagePed(ped, amount, fromX, fromZ) {
    if (ped.state === 'dead') return false;
    ped.health -= amount;
    ped.hitFlash = 0.2;
    ped.state = 'flee';
    ped.stateTimer = 5;
    const away = Math.atan2(ped.x - fromX, ped.z - fromZ);
    ped.targetX = ped.x + Math.sin(away) * 30;
    ped.targetZ = ped.z + Math.cos(away) * 30;

    if (ped.health <= 0) {
      ped.state = 'dead';
      ped.deadTimer = 0;
      ped.group.rotation.z = Math.PI / 2 * (random() < 0.5 ? 1 : -1);
      ped.group.position.y = 0.2;
      return true;
    }
    return false;
  }

  function update(dt, playerX, playerZ, playerVehicle) {
    // Despawn distant
    for (let i = peds.length - 1; i >= 0; i--) {
      const ped = peds[i];
      if (Math.hypot(ped.x - playerX, ped.z - playerZ) > PEDS.despawnDist) {
        removePed(ped);
      }
    }

    for (let i = peds.length - 1; i >= 0; i--) {
      const ped = peds[i];

      if (ped.state === 'dead') {
        ped.deadTimer += dt;
        if (ped.deadTimer > 25) removePed(ped);
        continue;
      }

      if (ped.hitFlash > 0) ped.hitFlash -= dt;

      let speed = ped.speed;
      if (ped.state === 'flee') {
        speed = PEDS.fleeSpeed;
        ped.stateTimer -= dt;
        if (ped.stateTimer <= 0) ped.state = 'walk';
      }

      // Wander target refresh
      ped.wanderTimer -= dt;
      if (ped.state === 'walk' && ped.wanderTimer <= 0) {
        ped.wanderTimer = 4 + random() * 4;
        pickWanderTarget(ped);
      }

      // Move toward the target
      const dx = ped.targetX - ped.x;
      const dz = ped.targetZ - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.4) {
        const nx = dx / dist;
        const nz = dz / dist;

        // Separation from other peds
        let sepX = 0;
        let sepZ = 0;
        for (const other of peds) {
          if (other === ped || other.state === 'dead') continue;
          const ox = ped.x - other.x;
          const oz = ped.z - other.z;
          const od = Math.hypot(ox, oz);
          if (od < 1.1 && od > 0.001) {
            sepX += (ox / od) * (1.1 - od);
            sepZ += (oz / od) * (1.1 - od);
          }
        }

        ped.x += (nx * speed + sepX * 3) * dt;
        ped.z += (nz * speed + sepZ * 3) * dt;

        const targetYaw = Math.atan2(nx, nz);
        let diff = targetYaw - ped.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.yaw += diff * Math.min(1, dt * 7);

        ped.phase += speed * dt * 3.4;
      } else if (ped.state === 'walk') {
        pickWanderTarget(ped);
      }

      // Collision against buildings
      const pos = { x: ped.x, z: ped.z };
      collision.resolveCircle(pos, 0.34, 0.2, 1.7);
      ped.x = pos.x;
      ped.z = pos.z;

      // React to the player's car
      if (playerVehicle) {
        const d = Math.hypot(ped.x - playerVehicle.x, ped.z - playerVehicle.z);
        if (d < 9 && playerVehicle.speed > 6 && ped.state === 'walk') {
          ped.state = 'flee';
          ped.stateTimer = 3;
          const away = Math.atan2(ped.x - playerVehicle.x, ped.z - playerVehicle.z);
          ped.targetX = ped.x + Math.sin(away) * 22;
          ped.targetZ = ped.z + Math.cos(away) * 22;
        }
        // Run over
        if (d < 2.0 && playerVehicle.speed > 5) {
          const died = damagePed(ped, 200, playerVehicle.x, playerVehicle.z);
          if (died && state.onPedKilled) state.onPedKilled(ped, true);
          else if (state.onPedHit) state.onPedHit(ped);
        }
      }

      // Update mesh
      ped.group.position.set(ped.x, 0, ped.z);
      ped.group.rotation.y = ped.yaw;

      const swing = Math.sin(ped.phase) * (ped.state === 'flee' ? 0.9 : 0.55);
      ped.limbs.legL.rotation.x = swing;
      ped.limbs.legR.rotation.x = -swing;
      ped.limbs.armL.rotation.x = -swing * 0.8;
      ped.limbs.armR.rotation.x = swing * 0.8;

      if (ped.hitFlash > 0) {
        ped.group.position.y = Math.sin(ped.hitFlash * 60) * 0.04;
      }
    }

    // Populate
    while (peds.length < PEDS.max) {
      const p = spawnPed(playerX, playerZ);
      if (!p) break;
    }
  }

  function nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const ped of peds) {
      if (ped.state === 'dead') continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  function clear() {
    for (const p of peds.slice()) removePed(p);
    peds.length = 0;
  }

  return { update, peds, spawnPed, removePed, scare, damagePed, nearest, clear };
}
