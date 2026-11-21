// On-foot player: movement, jump, gravity, collision, health/armour, death.

import { PLAYER, CAMERA } from '../config.js';
import { isHeld, anyHeld, movementAxis, mouse } from '../core/input.js';

export function createPlayerSystem(state, collision) {
  function update(dt) {
    const p = state.player;

    if (p.dead) {
      p.deadTimer += dt;
      return;
    }

    if (p.inVehicle) return; // vehicle system drives the player transform

    // --- Look ---
    const m = mouse();
    p.yaw -= m.dx * CAMERA.mouseSensitivity;
    p.pitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, p.pitch - m.dy * CAMERA.mouseSensitivity));

    // --- Move ---
    const axis = movementAxis();
    p.sprinting = anyHeld(['ShiftLeft', 'ShiftRight']) && axis.forward > 0.1;
    const speed = p.sprinting ? PLAYER.runSpeed : PLAYER.walkSpeed;

    const sinY = Math.sin(p.yaw);
    const cosY = Math.cos(p.yaw);

    // Camera forward is -Z rotated by yaw
    const wishX = (-sinY * axis.forward) + (cosY * axis.right);
    const wishZ = (-cosY * axis.forward) + (-sinY * axis.right);

    const targetVX = wishX * speed;
    const targetVZ = wishZ * speed;

    const accel = (p.onGround ? PLAYER.accel : PLAYER.accel * 0.35) * dt;
    p.vx += (targetVX - p.vx) * Math.min(1, accel);
    p.vz += (targetVZ - p.vz) * Math.min(1, accel);

    // --- Gravity & jump ---
    if (p.onGround && isHeld('Space')) {
      p.vy = PLAYER.jumpSpeed;
      p.onGround = false;
    }
    p.vy -= PLAYER.gravity * dt;

    // --- Integrate ---
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    // --- Ground ---
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.onGround = true;
    }

    // --- Collide ---
    const pos = { x: p.x, z: p.z };
    const before = { x: p.x, z: p.z };
    collision.resolveCircle(pos, PLAYER.radius, p.y + 0.2, p.y + PLAYER.height);
    if (pos.x !== before.x || pos.z !== before.z) {
      p.x = pos.x;
      p.z = pos.z;
      // Kill the velocity component that got blocked
      p.vx *= 0.2;
      p.vz *= 0.2;
    }

    // --- Walk bob phase ---
    const planarSpeed = Math.hypot(p.vx, p.vz);
    p.walkPhase += planarSpeed * dt * 1.7;

    // --- Health regen ---
    if (state.time - p.lastHurt > PLAYER.regenDelay && p.health < PLAYER.maxHealth) {
      p.health = Math.min(PLAYER.maxHealth, p.health + PLAYER.regenRate * dt);
    }
  }

  function damage(amount, sourceX, sourceZ) {
    const p = state.player;
    if (p.dead) return;

    let remaining = amount;
    if (p.armour > 0) {
      const absorbed = Math.min(p.armour, remaining * 0.65);
      p.armour -= absorbed;
      remaining -= absorbed;
    }
    p.health -= remaining;
    p.lastHurt = state.time;
    state.hud.damageFlash = Math.min(1, state.hud.damageFlash + amount / 60);

    // Knockback away from the source
    if (sourceX !== undefined) {
      const dx = p.x - sourceX;
      const dz = p.z - sourceZ;
      const d = Math.hypot(dx, dz) || 1;
      p.vx += (dx / d) * 2.2;
      p.vz += (dz / d) * 2.2;
    }

    if (p.health <= 0) {
      p.health = 0;
      p.dead = true;
      p.deadTimer = 0;
      state.hud.toast = 'WASTED';
      state.hud.toastTimer = 3.2;
    }
  }

  function heal(amount) {
    const p = state.player;
    p.health = Math.min(PLAYER.maxHealth, p.health + amount);
  }

  function respawn() {
    const p = state.player;
    p.health = PLAYER.maxHealth;
    p.armour = 0;
    p.dead = false;
    p.deadTimer = 0;
    p.vx = 0; p.vy = 0; p.vz = 0;
    p.inVehicle = null;
    p.x = 0; p.y = 0; p.z = 0;
    p.money = Math.max(0, p.money - 200);
    state.wanted.stars = 0;
    state.wanted.heat = 0;
    state.hud.damageFlash = 0;
  }

  return { update, damage, heal, respawn };
}
