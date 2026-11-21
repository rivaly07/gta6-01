// Effects: particle pool for sparks, smoke, blood, tyre smoke; muzzle flashes; tracers.
// One InstancedMesh per particle family keeps the draw call count flat.

const MAX_PARTICLES = 420;
const MAX_TRACERS = 48;

export function createEffectsSystem(scene) {
  // --- Particles: instanced quads (billboarded by shader-free trick: always face camera via
  // per-frame quaternion copy would cost too much, so we use small boxes with additive material) ---
  const particleGeo = new THREE.PlaneGeometry(1, 1);
  const particleMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const particles = new THREE.InstancedMesh(particleGeo, particleMat, MAX_PARTICLES);
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.frustumCulled = false;
  particles.count = 0;
  scene.add(particles);

  const dummy = new THREE.Object3D();
  const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
  particles.instanceColor = colorAttr;
  particles.instanceColor.setUsage(THREE.DynamicDrawUsage);

  const pool = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    pool.push({
      active: false,
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      life: 0, maxLife: 1,
      size: 0.1, sizeGrow: 0,
      r: 1, g: 1, b: 1,
      gravity: 0,
      drag: 0.98,
    });
  }

  // --- Tracers: line segments ---
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(MAX_TRACERS * 6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracerMat = new THREE.LineBasicMaterial({
    color: 0xffe9a8,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const tracerLines = new THREE.LineSegments(tracerGeo, tracerMat);
  tracerLines.frustumCulled = false;
  scene.add(tracerLines);
  const tracers = [];

  // --- Muzzle flash: a single reusable light + billboard ---
  const flashLight = new THREE.PointLight(0xffcf7a, 0, 14, 2);
  scene.add(flashLight);
  let flashTimer = 0;

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xfff0b0,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), flashMat);
  flashMesh.visible = false;
  scene.add(flashMesh);

  function alloc() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!pool[i].active) return pool[i];
    }
    return pool[0]; // overwrite oldest
  }

  function emit(x, y, z, opts) {
    const p = alloc();
    p.active = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = opts.vx || 0;
    p.vy = opts.vy || 0;
    p.vz = opts.vz || 0;
    p.life = opts.life || 0.5;
    p.maxLife = p.life;
    p.size = opts.size || 0.12;
    p.sizeGrow = opts.sizeGrow || 0;
    p.r = opts.r ?? 1; p.g = opts.g ?? 1; p.b = opts.b ?? 1;
    p.gravity = opts.gravity || 0;
    p.drag = opts.drag ?? 0.97;
  }

  function sparks(x, y, z, dir) {
    for (let i = 0; i < 7; i++) {
      const sx = (Math.random() - 0.5) * 6 - dir.x * 2;
      const sy = Math.random() * 4;
      const sz = (Math.random() - 0.5) * 6 - dir.z * 2;
      emit(x, y, z, {
        vx: sx, vy: sy, vz: sz,
        life: 0.22 + Math.random() * 0.24,
        size: 0.055,
        r: 1, g: 0.75, b: 0.3,
        gravity: -14,
        drag: 0.94,
      });
    }
    // Dust puff
    emit(x, y, z, {
      vx: 0, vy: 0.7, vz: 0,
      life: 0.5, size: 0.22, sizeGrow: 1.4,
      r: 0.55, g: 0.55, b: 0.5,
      drag: 0.9,
    });
  }

  function blood(x, y, z) {
    for (let i = 0; i < 6; i++) {
      emit(x, y, z, {
        vx: (Math.random() - 0.5) * 2.4,
        vy: Math.random() * 2.2,
        vz: (Math.random() - 0.5) * 2.4,
        life: 0.35 + Math.random() * 0.3,
        size: 0.075,
        r: 0.62, g: 0.06, b: 0.08,
        gravity: -9,
        drag: 0.93,
      });
    }
  }

  function tyreSmoke(x, y, z, intensity) {
    const n = Math.min(4, Math.ceil(intensity * 3));
    for (let i = 0; i < n; i++) {
      emit(x + (Math.random() - 0.5) * 0.6, y + 0.15, z + (Math.random() - 0.5) * 0.6, {
        vx: (Math.random() - 0.5) * 1.4,
        vy: 0.6 + Math.random() * 0.7,
        vz: (Math.random() - 0.5) * 1.4,
        life: 0.7 + Math.random() * 0.6,
        size: 0.24,
        sizeGrow: 2.2,
        r: 0.72, g: 0.72, b: 0.74,
        drag: 0.94,
      });
    }
  }

  function explosion(x, y, z) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 11;
      emit(x, y + 0.5, z, {
        vx: Math.cos(a) * s,
        vy: Math.random() * 9,
        vz: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.7,
        size: 0.3 + Math.random() * 0.3,
        sizeGrow: 2.5,
        r: 1, g: 0.55 + Math.random() * 0.3, b: 0.15,
        gravity: -6,
        drag: 0.9,
      });
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      emit(x, y + 0.8, z, {
        vx: Math.cos(a) * 3,
        vy: 1.5 + Math.random() * 3,
        vz: Math.sin(a) * 3,
        life: 1.4 + Math.random() * 1.1,
        size: 0.55,
        sizeGrow: 2.6,
        r: 0.22, g: 0.21, b: 0.2,
        gravity: 0.6,
        drag: 0.95,
      });
    }
  }

  function muzzleFlash(origin, yaw, pitch) {
    const fwdX = -Math.sin(yaw) * Math.cos(pitch);
    const fwdY = Math.sin(pitch);
    const fwdZ = -Math.cos(yaw) * Math.cos(pitch);
    flashMesh.position.set(origin.x + fwdX * 0.8, origin.y + fwdY * 0.8 + 0.05, origin.z + fwdZ * 0.8);
    flashMesh.visible = true;
    flashLight.position.copy(flashMesh.position);
    flashLight.intensity = 6;
    flashTimer = 0.06;
  }

  function tracer(from, to) {
    tracers.push({ from: { ...from }, to: { ...to }, life: 0.07 });
    if (tracers.length > MAX_TRACERS) tracers.shift();
  }

  function update(dt, camera) {
    // Particles
    let count = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }

      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.vz *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.25; }
      p.size += p.sizeGrow * dt;

      const k = p.life / p.maxLife;
      dummy.position.set(p.x, p.y, p.z);
      if (camera) dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(p.size * (0.4 + k * 0.6));
      dummy.updateMatrix();
      particles.setMatrixAt(count, dummy.matrix);
      colorAttr.setXYZ(count, p.r * k, p.g * k, p.b * k);
      count++;
    }
    particles.count = count;
    particles.instanceMatrix.needsUpdate = true;
    colorAttr.needsUpdate = true;

    // Tracers
    let tCount = 0;
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= dt;
      if (t.life <= 0) { tracers.splice(i, 1); continue; }
    }
    for (const t of tracers) {
      if (tCount >= MAX_TRACERS) break;
      tracerPos[tCount * 6 + 0] = t.from.x;
      tracerPos[tCount * 6 + 1] = t.from.y;
      tracerPos[tCount * 6 + 2] = t.from.z;
      tracerPos[tCount * 6 + 3] = t.to.x;
      tracerPos[tCount * 6 + 4] = t.to.y;
      tracerPos[tCount * 6 + 5] = t.to.z;
      tCount++;
    }
    tracerGeo.setDrawRange(0, tCount * 2);
    tracerGeo.attributes.position.needsUpdate = true;

    // Muzzle flash decay
    if (flashTimer > 0) {
      flashTimer -= dt;
      flashLight.intensity = Math.max(0, flashLight.intensity - dt * 90);
      if (flashTimer <= 0) {
        flashMesh.visible = false;
        flashLight.intensity = 0;
      }
    }
  }

  function clear() {
    for (const p of pool) p.active = false;
    tracers.length = 0;
    particles.count = 0;
  }

  return { update, sparks, blood, tyreSmoke, explosion, muzzleFlash, tracer, clear, emit };
}
