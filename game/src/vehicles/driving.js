// Player driving: enter/exit the nearest car, feed keyboard input to the vehicle physics,
// and keep the player transform glued to the seat.

import { VEHICLE_TYPES, PLAYER } from '../config.js';
import { isHeld, anyPressed, wasPressed, mouse } from '../core/input.js';

export function createDrivingSystem(state, vehicleSystem, collision, onCrime) {
  let enterCooldown = 0;

  function nearestVehicle(maxDist = 3.4) {
    const p = state.player;
    let best = null;
    let bestD = maxDist;
    for (const v of vehicleSystem.vehicles) {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  function tryEnter() {
    const p = state.player;
    if (p.inVehicle || p.dead || enterCooldown > 0) return false;

    const v = nearestVehicle();
    if (!v) return false;

    // Can't steal a police car that's occupied by a cop
    if (v.driver === 'police' || (v.driver === 'traffic' && v.type === 'police')) {
      return false;
    }

    const wasOccupied = !!v.driver;
    v.driver = 'player';
    v.isPlayer = true;
    v.ai = null;
    p.inVehicle = v;
    p.x = v.x;
    p.z = v.z;
    p.y = 0;
    p.vx = 0; p.vz = 0; p.vy = 0;
    enterCooldown = 0.45;

    if (onCrime) onCrime(wasOccupied ? 'steal_occupied' : 'steal', v);
    return true;
  }

  function tryExit() {
    const p = state.player;
    if (!p.inVehicle) return false;
    const v = p.inVehicle;

    // Find a clear spot on the driver's side
    const sideX = Math.cos(v.yaw);
    const sideZ = -Math.sin(v.yaw);
    let ox = v.x - sideX * 2.4;
    let oz = v.z - sideZ * 2.4;

    const pos = { x: ox, z: oz };
    collision.resolveCircle(pos, PLAYER.radius, 0.2, PLAYER.height);
    ox = pos.x;
    oz = pos.z;

    p.x = ox;
    p.z = oz;
    p.y = 0.1;
    p.vx = 0; p.vy = 0; p.vz = 0;
    p.yaw = v.yaw;

    v.driver = null;
    v.isPlayer = false;
    v.throttle = 0;
    v.steerInput = 0;
    p.inVehicle = null;
    enterCooldown = 0.45;
    return true;
  }

  function update(dt) {
    if (enterCooldown > 0) enterCooldown -= dt;

    const p = state.player;
    const wantToggle = anyPressed(['KeyF', 'KeyE', 'Enter']);

    if (wantToggle && !p.dead) {
      if (p.inVehicle) tryExit();
      else tryEnter();
    }

    if (p.inVehicle) {
      const v = p.inVehicle;
      if (v.health <= 0) {
        // Wrecked: throw the player out
        tryExit();
        return;
      }

      // Steering from A/D or mouse-free arrow keys
      let steer = 0;
      if (isHeld('KeyA') || isHeld('ArrowLeft')) steer -= 1;
      if (isHeld('KeyD') || isHeld('ArrowRight')) steer += 1;

      let throttle = 0;
      if (isHeld('KeyW') || isHeld('ArrowUp')) throttle += 1;
      if (isHeld('KeyS') || isHeld('ArrowDown')) throttle -= 1;

      const handbrake = isHeld('Space');

      // Mouse steer assist when pointer is locked and no key pressed
      if (steer === 0 && state.player.inVehicle) {
        const m = mouse();
        if (Math.abs(m.dx) > 2) steer = Math.max(-1, Math.min(1, m.dx * 0.06));
      }

      vehicleSystem.stepVehicle(v, dt, { throttle, steer, handbrake, brake: 0 });

      // Glue the player to the car
      p.x = v.x;
      p.z = v.z;
      p.y = 0;
      p.yaw = v.yaw;
      p.speed = v.speed;

      // Camera shake at speed
      if (v.speed > 22) {
        state.camera.shake = Math.max(state.camera.shake, (v.speed - 22) * 0.008);
      }

      // HUD speed
      state.hud.speed = Math.abs(v.forwardSpeed) * 3.6;

      // Damage the driver in a wreck
      if (v.health < 25 && Math.abs(v.forwardSpeed) > 12 && Math.random() < 0.02) {
        state.hud.damageFlash = Math.min(1, state.hud.damageFlash + 0.3);
      }
    } else {
      state.hud.speed = 0;
    }
  }

  return { update, tryEnter, tryExit, nearestVehicle };
}
