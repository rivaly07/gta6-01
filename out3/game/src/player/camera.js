// Camera: third-person chase rig with collision-aware distance, lerp, shake, and vehicle follow.

import { CAMERA } from '../config.js';
import { mouse } from '../core/input.js';

export function createCameraSystem(state, collision) {
  let curDist = CAMERA.footDist;
  let shakeTime = 0;
  let shakeMag = 0;

  function update(dt) {
    const p = state.player;
    const cam = state.camera;

    // Aim yaw/pitch follow the player yaw set by the player system.
    const targetYaw = p.yaw;
    const targetPitch = p.pitch;

    const vehicle = p.inVehicle;
    const dist = vehicle ? CAMERA.vehicleDist : CAMERA.footDist;
    const heightBase = vehicle ? CAMERA.vehicleHeight : CAMERA.footHeight;

    const anchorX = p.x;
    const anchorY = p.y + (vehicle ? 1.4 : CAMERA.footHeight);
    const anchorZ = p.z;

    // Desired camera position behind the player, offset by pitch
    const cosP = Math.cos(targetPitch);
    const dirX = Math.sin(targetYaw) * cosP;
    const dirZ = Math.cos(targetYaw) * cosP;
    const dirY = Math.sin(targetPitch);

    let wantDist = dist;
    // Pull the camera in when a wall is behind us
    const backX = -dirX;
    const backZ = -dirZ;
    const hit = collision.raycast(
      { x: anchorX, y: anchorY, z: anchorZ },
      { x: backX, y: 0, z: backZ },
      dist + 0.6
    );
    if (hit) wantDist = Math.max(1.1, hit.t - 0.45);

    curDist += (wantDist - curDist) * Math.min(1, dt * 12);

    const desiredX = anchorX + dirX * curDist;
    const desiredZ = anchorZ + dirZ * curDist;
    const desiredY = anchorY + heightBase * 0.35 + dirY * curDist * 0.55;

    const lerp = vehicle ? CAMERA.lerpVehicle : CAMERA.lerpFoot;
    const k = 1 - Math.exp(-lerp * dt);

    cam.x += (desiredX - cam.x) * k;
    cam.y += (Math.max(0.6, desiredY) - cam.y) * k;
    cam.z += (desiredZ - cam.z) * k;

    // Shake
    if (cam.shake > 0.001) {
      shakeTime += dt;
      const s = cam.shake;
      cam.x += Math.sin(shakeTime * 47) * s * 0.35;
      cam.y += Math.sin(shakeTime * 61) * s * 0.3;
      cam.z += Math.cos(shakeTime * 53) * s * 0.35;
      cam.shake *= Math.exp(-7 * dt);
      if (cam.shake < 0.001) cam.shake = 0;
    }

    state.cameraTarget = {
      x: anchorX,
      y: anchorY + 0.4,
      z: anchorZ,
      yaw: targetYaw,
      pitch: targetPitch,
    };
  }

  function shake(amount) {
    state.camera.shake = Math.min(1.4, state.camera.shake + amount);
  }

  function apply(rig) {
    rig.camera.position.set(state.camera.x, state.camera.y, state.camera.z);
    const t = state.cameraTarget || { x: state.camera.x, y: state.camera.y - 1, z: state.camera.z };
    rig.camera.lookAt(t.x, t.y, t.z);
  }

  return { update, shake, apply };
}
