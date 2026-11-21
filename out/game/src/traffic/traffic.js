// Traffic AI: cars drive the road grid on lane offsets, turn at intersections,
// brake for anything in front of them, and despawn far from the player.

import { TRAFFIC, WORLD, VEHICLE_TYPES } from '../config.js';
import { cityData } from '../city/generator.js';
import { pickVehicleType } from './vehicle.js';

const LANE = 2.7;

export function createTrafficSystem(state, vehicleSystem, collision, random) {
  const cars = [];

  function roadCoord(axis, index) {
    const half = (axis === 'x' ? WORLD.blocksX : WORLD.blocksZ) * WORLD.blockSize / 2;
    return -half + index * WORLD.blockSize;
  }

  function nearestIndex(axis, value) {
    const half = (axis === 'x' ? WORLD.blocksX : WORLD.blocksZ) * WORLD.blockSize / 2;
    return Math.round((value + half) / WORLD.blockSize);
  }

  function spawnCar(nearX, nearZ) {
    // Pick a road and a direction, then place the car a little way from the player.
    for (let attempt = 0; attempt < 12; attempt++) {
      const axis = random() < 0.5 ? 'x' : 'z';
      const index = Math.floor(random() * ((axis === 'x' ? WORLD.blocksX : WORLD.blocksZ) + 1));
      const line = roadCoord(axis, index);
      const dir = random() < 0.5 ? 1 : -1;

      let along;
      if (axis === 'x') {
        along = nearX + (random() < 0.5 ? -1 : 1) * (40 + random() * 60);
      } else {
        along = nearZ + (random() < 0.5 ? -1 : 1) * (40 + random() * 60);
      }

      const limit = (axis === 'x' ? WORLD.blocksX : WORLD.blocksZ) * WORLD.blockSize / 2 - 10;
      if (Math.abs(along) > limit) continue;

      const laneLine = line + dir * LANE;
      const x = axis === 'x' ? along : laneLine;
      const z = axis === 'x' ? laneLine : along;

      if (Math.hypot(x - nearX, z - nearZ) > TRAFFIC.despawnDist) continue;
      if (collision.pointBlocked(x, 1, z, 0.5)) continue;

      const type = pickVehicleType(random);
      const yaw = axis === 'x' ? (dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (dir > 0 ? Math.PI : 0);
      const v = vehicleSystem.spawn(type, x, z, yaw, { driver: 'traffic' });
      v.ai = { axis, index, line, dir, cruise: TRAFFIC.speed[0] + random() * (TRAFFIC.speed[1] - TRAFFIC.speed[0]) };
      cars.push(v);
      return v;
    }
    return null;
  }

  function despawnCar(v) {
    const i = cars.indexOf(v);
    if (i >= 0) cars.splice(i, 1);
    vehicleSystem.remove(v);
  }

  /** Distance to the nearest obstacle straight ahead, capped at `max`. */
  function clearAhead(v, max) {
    const fx = -Math.sin(v.yaw);
    const fz = -Math.cos(v.yaw);
    let nearest = max;

    // Other vehicles
    for (const o of state.vehicles) {
      if (o === v) continue;
      const dx = o.x - v.x;
      const dz = o.z - v.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > max) continue;
      const lateral = Math.abs(dx * -fz + dz * fx);
      if (lateral < 1.9) nearest = Math.min(nearest, along - 2.6);
    }

    // Player on foot
    const p = state.player;
    if (!p.inVehicle) {
      const dx = p.x - v.x;
      const dz = p.z - v.z;
      const along = dx * fx + dz * fz;
      const lateral = Math.abs(dx * -fz + dz * fx);
      if (along > 0 && along < max && lateral < 1.6) nearest = Math.min(nearest, along - 2.2);
    }

    // Static geometry
    const hit = collision.raycast({ x: v.x, y: 0.7, z: v.z }, { x: fx, y: 0, z: fz }, max);
    if (hit) nearest = Math.min(nearest, hit.t - 1.5);

    return nearest;
  }

  function pickTurn(v) {
    // At an intersection: mostly go straight, sometimes turn.
    const r = random();
    const canLeft = true;
    const canRight = true;

    if (r < 0.24 && canLeft) {
      // Turn left
      const newAxis = v.ai.axis === 'x' ? 'z' : 'x';
      const newDir = v.ai.axis === 'x' ? (v.ai.dir > 0 ? 1 : -1) : (v.ai.dir > 0 ? -1 : 1);
      v.ai.axis = newAxis;
      v.ai.dir = newDir;
      v.ai.index = nearestIndex(newAxis, newAxis === 'x' ? v.x : v.z);
      v.ai.line = roadCoord(newAxis, v.ai.index);
    } else if (r < 0.48 && canRight) {
      const newAxis = v.ai.axis === 'x' ? 'z' : 'x';
      const newDir = v.ai.axis === 'x' ? (v.ai.dir > 0 ? -1 : 1) : (v.ai.dir > 0 ? 1 : -1);
      v.ai.axis = newAxis;
      v.ai.dir = newDir;
      v.ai.index = nearestIndex(newAxis, newAxis === 'x' ? v.x : v.z);
      v.ai.line = roadCoord(newAxis, v.ai.index);
    } else {
      v.ai.index += v.ai.dir;
    }
    v.ai.turned = true;
  }

  function update(dt, playerX, playerZ) {
    // Cull far cars and top up the population
    for (let i = cars.length - 1; i >= 0; i--) {
      const v = cars[i];
      if (Math.hypot(v.x - playerX, v.z - playerZ) > TRAFFIC.despawnDist || v.health <= 0) {
        despawnCar(v);
      }
    }

    const maxIndex = { x: WORLD.blocksX, z: WORLD.blocksZ };
    for (let i = cars.length - 1; i >= 0; i--) {
      const v = cars[i];
      const ai = v.ai;
      if (!ai) continue;

      // Target point: a little ahead along the current road
      const lookAhead = 7 + v.speed * 0.5;
      let targetX = v.x;
      let targetZ = v.z;

      if (ai.axis === 'x') {
        targetX += ai.dir * lookAhead;
        targetZ = ai.line + ai.dir * LANE;
      } else {
        targetZ += ai.dir * lookAhead;
        targetX = ai.line + ai.dir * LANE;
      }

      // Desired heading
      const dx = targetX - v.x;
      const dz = targetZ - v.z;
      const wantYaw = Math.atan2(-dx, -dz);

      // Shortest angular difference
      let diff = wantYaw - v.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      const steer = Math.max(-1, Math.min(1, diff * 1.9));

      // Speed control
      const ahead = clearAhead(v, 18);
      let throttle = 0.55;
      if (ahead < 4) throttle = -0.9;
      else if (ahead < 9) throttle = 0.05;
      else if (ahead < 14) throttle = 0.3;

      // Cornering: slow down when the heading error is large
      if (Math.abs(diff) > 0.5) throttle = Math.min(throttle, 0.2);

      vehicleSystem.stepVehicle(v, dt, { throttle, steer, brake: 0, handbrake: false });

      // Reached the next intersection? Decide a turn.
      if (ai.axis === 'x') {
        const nextX = roadCoord('x', ai.index + ai.dir);
        if ((ai.dir > 0 && v.x > nextX - 2.5) || (ai.dir < 0 && v.x < nextX + 2.5)) {
          pickTurn(v);
        }
      } else {
        const nextZ = roadCoord('z', ai.index + ai.dir);
        if ((ai.dir > 0 && v.z > nextZ - 2.5) || (ai.dir < 0 && v.z < nextZ + 2.5)) {
          pickTurn(v);
        }
      }

      // Keep the index in range
      if (ai.index < -1 || ai.index > maxIndex[ai.axis] + 1) {
        ai.index = Math.max(0, Math.min(maxIndex[ai.axis], ai.index));
      }

      // Stuck recovery
      if (v.speed < 0.4) {
        ai.stuck = (ai.stuck || 0) + dt;
        if (ai.stuck > 4) {
          despawnCar(v);
        }
      } else {
        ai.stuck = 0;
      }

      // Traffic hitting the player on foot is a crime in the eyes of the law only if we did it,
      // so here we just push the player aside.
      const p = state.player;
      if (!p.inVehicle && !p.dead) {
        const pd = Math.hypot(p.x - v.x, p.z - v.z);
        if (pd < 2.4 && v.speed > 3) {
          p.vx += (p.x - v.x) * 3.5;
          p.vz += (p.z - v.z) * 3.5;
          p.vy = 3.2;
          p.onGround = false;
          state.camera.shake = Math.min(1, 0.35 + v.speed * 0.02);
          state.hud.damageFlash = Math.min(1, state.hud.damageFlash + 0.4);
          if (state.onPlayerHit) state.onPlayerHit(12, v.x, v.z);
        }
      }
    }

    // Spawn to fill the population
    while (cars.length < TRAFFIC.max) {
      const v = spawnCar(playerX, playerZ);
      if (!v) break;
    }
  }

  function clear() {
    for (const v of cars.slice()) despawnCar(v);
    cars.length = 0;
  }

  return { update, cars, clear, spawnCar, despawnCar };
}
