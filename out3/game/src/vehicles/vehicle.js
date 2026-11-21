// Arcade vehicle physics: forward/lateral velocity split, grip-based drift, steering,
// handbrake, collision response against the city and against other cars.

import { VEHICLE_TYPES } from '../config.js';
import { buildVehicleMesh } from './models.js';

export function createVehicleSystem(state, collision, scene) {
  const vehicles = state.vehicles;

  function spawn(typeKey, x, z, yaw, opts = {}) {
    const t = VEHICLE_TYPES[typeKey];
    const mesh = buildVehicleMesh(typeKey, opts.colour);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = yaw;
    scene.add(mesh);

    const v = {
      id: state.nextVehicleId++,
      type: typeKey,
      mesh,
      x, y: 0, z, yaw,
      vx: 0, vz: 0,
      angularVel: 0,
      steer: 0,
      speed: 0,
      forwardSpeed: 0,
      lateralSpeed: 0,
      wheelSpin: 0,
      health: 100,
      driver: opts.driver || null,     // 'player' | 'traffic' | 'police'
      ai: opts.ai || null,
      police: typeKey === 'police',
      isPlayer: false,
      sirenPhase: 0,
      brakeLight: 0,
      driftAmount: 0,
      lastHit: -99,
      stuckTimer: 0,
      handbrake: false,
      throttle: 0,
      steerInput: 0,
    };

    vehicles.push(v);
    return v;
  }

  function remove(v) {
    const i = vehicles.indexOf(v);
    if (i >= 0) vehicles.splice(i, 1);
    scene.remove(v.mesh);
    v.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }

  /**
   * Physics step for one vehicle. `input` = { throttle, steer, brake, handbrake }.
   */
  function stepVehicle(v, dt, input) {
    const t = VEHICLE_TYPES[v.type];

    const throttle = input.throttle || 0;
    const steerTarget = input.steer || 0;
    const brake = input.brake || 0;
    v.handbrake = !!input.handbrake;

    // Steering approaches the target at a rate that shrinks with speed
    const speedFactor = 1 / (1 + Math.abs(v.forwardSpeed) * 0.035);
    const steerRate = 7.5 * speedFactor;
    v.steer += (steerTarget - v.steer) * Math.min(1, steerRate * dt);

    // Decompose velocity into forward/lateral in the car's frame
    const sinY = Math.sin(v.yaw);
    const cosY = Math.cos(v.yaw);
    // Forward vector (car looks down -Z at yaw 0 -> use -cos, -sin)
    const fx = -sinY;
    const fz = -cosY;
    const rx = cosY;
    const rz = -sinY;

    let fwd = v.vx * fx + v.vz * fz;
    let lat = v.vx * rx + v.vz * rz;

    // Engine / brake
    const mass = t.mass;
    let accel = 0;
    if (throttle > 0) {
      const speedRatio = Math.abs(fwd) / t.topSpeed;
      accel = (t.force / mass) * throttle * Math.max(0, 1 - speedRatio * speedRatio);
    }
    if (throttle < 0) {
      if (fwd > 0.5) accel = (t.brake / mass) * throttle; // braking
      else accel = (t.force / mass) * 0.55 * throttle;     // reverse
    }
    if (brake > 0) {
      accel -= Math.sign(fwd) * (t.brake / mass) * brake * 0.9;
    }

    // Rolling resistance + drag
    const drag = 0.55;
    accel -= fwd * drag * 0.045;
    if (v.handbrake) accel -= Math.sign(fwd) * 9.0;

    fwd += accel * dt;
    if (Math.abs(fwd) < 0.06 && throttle === 0) fwd = 0;

    // Lateral grip: how fast sideways motion bleeds off
    let grip = t.grip;
    if (v.handbrake) grip *= 0.18;
    else if (Math.abs(fwd) > 12 && Math.abs(steerTarget) > 0.6) grip *= 0.62;
    const latRetain = Math.exp(-grip * dt);
    lat *= latRetain;

    // Yaw from steering (bicycle-ish model)
    const speedForTurn = Math.min(Math.abs(fwd), t.topSpeed);
    const turnRate = v.steer * t.steer * (speedForTurn / (speedForTurn + 9)) * Math.sign(fwd || 1);
    v.yaw += turnRate * dt * 2.6;

    // Drift: handbrake or hard cornering converts some forward into lateral
    v.driftAmount = Math.max(0, Math.min(1, Math.abs(lat) / (Math.abs(fwd) + 4)));

    // Recompose velocity with the *new* yaw so the car carries momentum
    const sinY2 = Math.sin(v.yaw);
    const cosY2 = Math.cos(v.yaw);
    const fx2 = -sinY2;
    const fz2 = -cosY2;
    const rx2 = cosY2;
    const rz2 = -sinY2;

    v.vx = fx2 * fwd + rx2 * lat;
    v.vz = fz2 * fwd + rz2 * lat;

    v.forwardSpeed = fwd;
    v.lateralSpeed = lat;
    v.speed = Math.hypot(v.vx, v.vz);

    // Integrate
    v.x += v.vx * dt;
    v.z += v.vz * dt;

    // Collide with the city: sample the four corners
    const halfW = t.body[0] * 0.5;
    const halfL = t.body[2] * 0.5;
    const beforeX = v.x;
    const beforeZ = v.z;

    const pos = { x: v.x, z: v.z };
    collision.resolveCircle(pos, Math.max(halfW, halfL) * 0.72, 0.3, 1.4);
    if (pos.x !== beforeX || pos.z !== beforeZ) {
      const impact = Math.hypot(v.vx, v.vz);
      v.x = pos.x;
      v.z = pos.z;
      if (impact > 6) {
        v.vx *= -0.22;
        v.vz *= -0.22;
        v.health -= impact * 1.6;
        if (v.isPlayer) state.camera.shake = Math.min(1.2, impact * 0.045);
        state.hud.damageFlash = Math.min(1, state.hud.damageFlash + impact * 0.012);
      } else {
        v.vx *= 0.35;
        v.vz *= 0.35;
      }
    }

    // Wheel spin for visuals
    v.wheelSpin += fwd * dt * 2.2;

    // Brake light
    v.brakeLight = (throttle < 0 || brake > 0 || v.handbrake) ? 1 : 0;
  }

  function updateVisual(v) {
    const mesh = v.mesh;
    mesh.position.set(v.x, v.y, v.z);
    mesh.rotation.y = v.yaw;

    const ud = mesh.userData;
    if (ud.wheels) {
      for (let i = 0; i < 4; i++) {
        ud.wheels[i].rotation.x = v.wheelSpin;
        if (i < 2) ud.wheels[i].rotation.y = v.steer * 0.6;
      }
    }

    // Body roll from lateral acceleration
    const roll = Math.max(-0.12, Math.min(0.12, -v.lateralSpeed * 0.008));
    const pitch = Math.max(-0.06, Math.min(0.06, (v.brakeLight ? 0.05 : 0) - Math.abs(v.forwardSpeed) * 0.0009));
    if (ud.body) {
      mesh.rotation.z = roll;
      mesh.rotation.x = pitch;
    }

    if (v.police && ud.sirenBar) {
      v.sirenPhase += 0.016;
      const on = Math.floor(v.sirenPhase * 7) % 2 === 0;
      ud.sirenBar.red.visible = on;
      ud.sirenBar.blue.visible = !on;
    }
  }

  /** Car-vs-car separation; call after all vehicles have stepped. */
  function resolveVehiclePairs() {
    for (let i = 0; i < vehicles.length; i++) {
      const a = vehicles[i];
      const ta = VEHICLE_TYPES[a.type];
      for (let j = i + 1; j < vehicles.length; j++) {
        const b = vehicles[j];
        const tb = VEHICLE_TYPES[b.type];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        const minDist = (ta.body[0] + tb.body[0]) * 0.5 * 0.92;

        if (dist < minDist && dist > 0.0001) {
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = minDist - dist;
          const aMass = ta.mass;
          const bMass = tb.mass;
          const total = aMass + bMass;

          a.x -= nx * overlap * (bMass / total);
          a.z -= nz * overlap * (bMass / total);
          b.x += nx * overlap * (aMass / total);
          b.z += nz * overlap * (aMass / total);

          // Exchange velocity along the normal
          const relVx = b.vx - a.vx;
          const relVz = b.vz - a.vz;
          const rel = relVx * nx + relVz * nz;
          if (rel < 0) {
            const imp = -(1.25 * rel) / (1 / aMass + 1 / bMass);
            a.vx -= (imp / aMass) * nx;
            a.vz -= (imp / aMass) * nz;
            b.vx += (imp / bMass) * nx;
            b.vz += (imp / bMass) * nz;

            const force = Math.abs(rel);
            if (force > 7) {
              a.health -= force * 1.1;
              b.health -= force * 1.1;
              if (a.isPlayer || b.isPlayer) {
                state.camera.shake = Math.min(1.2, force * 0.05);
              }
            }
          }
        }
      }
    }
  }

  function update(dt) {
    for (const v of vehicles) {
      if (v.health <= 0) continue;
      if (!v.isPlayer && !v.driver) {
        // Idle parked cars: settle to a stop, no integration cost beyond this
        v.vx *= 0.9;
        v.vz *= 0.9;
        if (Math.abs(v.vx) < 0.01) v.vx = 0;
        if (Math.abs(v.vz) < 0.01) v.vz = 0;
      }
    }
    resolveVehiclePairs();
    for (const v of vehicles) updateVisual(v);
  }

  return { spawn, remove, stepVehicle, update, resolveVehiclePairs, vehicles };
}

/** Pick a vehicle type deterministically from a seeded random function. */
export function pickVehicleType(random) {
  const r = random();
  if (r < 0.46) return 'sedan';
  if (r < 0.72) return 'muscle';
  return 'suv';
}
