// Collision world: AABB colliders in a uniform spatial hash.
// Handles circle-vs-AABB resolution for characters, ray-vs-AABB for hitscan.

const CELL = 16;

export function createCollisionWorld() {
  const cells = new Map();
  const colliders = [];

  function key(cx, cz) {
    return cx * 73856093 ^ cz * 19349663;
  }

  function add(collider) {
    collider.id = colliders.length;
    colliders.push(collider);
    const x0 = Math.floor(collider.minX / CELL);
    const x1 = Math.floor(collider.maxX / CELL);
    const z0 = Math.floor(collider.minZ / CELL);
    const z1 = Math.floor(collider.maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        let bucket = cells.get(k);
        if (!bucket) { bucket = []; cells.set(k, bucket); }
        bucket.push(collider);
      }
    }
    return collider;
  }

  function clear() {
    cells.clear();
    colliders.length = 0;
  }

  /** Colliders whose AABB may overlap the circle (x,z,r). */
  function query(x, z, r) {
    const out = [];
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const bucket = cells.get(key(cx, cz));
        if (!bucket) continue;
        for (const c of bucket) {
          if (out.indexOf(c) === -1) out.push(c);
        }
      }
    }
    return out;
  }

  /**
   * Push a circle out of the colliders it overlaps.
   * `pos` is {x, z, y}; returns true when a push happened.
   */
  function resolveCircle(pos, radius, feetY, headY) {
    let pushed = false;
    const near = query(pos.x, pos.z, radius + 0.5);
    for (let i = 0; i < near.length; i++) {
      const c = near[i];
      if (headY <= c.minY || feetY >= c.maxY) continue;

      const closestX = Math.max(c.minX, Math.min(c.maxX, pos.x));
      const closestZ = Math.max(c.minZ, Math.min(c.maxZ, pos.z));
      let dx = pos.x - closestX;
      let dz = pos.z - closestZ;
      let d2 = dx * dx + dz * dz;

      if (d2 > radius * radius) continue;

      if (d2 < 1e-8) {
        // Centre inside the box: push out along the shallowest axis.
        const toLeft = pos.x - c.minX;
        const toRight = c.maxX - pos.x;
        const toBack = pos.z - c.minZ;
        const toFront = c.maxZ - pos.z;
        const m = Math.min(toLeft, toRight, toBack, toFront);
        if (m === toLeft) pos.x = c.minX - radius;
        else if (m === toRight) pos.x = c.maxX + radius;
        else if (m === toBack) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      } else {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
      pushed = true;
    }
    return pushed;
  }

  /** Is the point inside any collider (ignoring ones below/above y range)? */
  function pointBlocked(x, y, z, pad = 0) {
    const near = query(x, z, pad + 0.01);
    for (const c of near) {
      if (y < c.minY || y > c.maxY) continue;
      if (x >= c.minX - pad && x <= c.maxX + pad && z >= c.minZ - pad && z <= c.maxZ + pad) return c;
    }
    return null;
  }

  /** Ray vs colliders. Returns { t, collider } of the nearest hit or null. */
  function raycast(origin, dir, maxDist) {
    // Slab test against every collider in the swept cells.
    const steps = Math.ceil(maxDist / CELL) + 1;
    const seen = new Set();
    let bestT = maxDist;
    let bestC = null;

    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * maxDist;
      const px = origin.x + dir.x * t;
      const pz = origin.z + dir.z * t;
      const bucket = query(px, pz, CELL * 0.5);
      for (const c of bucket) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);

        const hit = rayAabb(origin, dir, c, bestT);
        if (hit !== null && hit < bestT) {
          bestT = hit;
          bestC = c;
        }
      }
    }
    return bestC ? { t: bestT, collider: bestC } : null;
  }

  return { add, clear, query, resolveCircle, pointBlocked, raycast, colliders };
}

function rayAabb(o, d, c, maxT) {
  let tmin = 0;
  let tmax = maxT;

  for (const axis of ['x', 'y', 'z']) {
    const mn = axis === 'x' ? c.minX : axis === 'y' ? c.minY : c.minZ;
    const mx = axis === 'x' ? c.maxX : axis === 'y' ? c.maxY : c.maxZ;
    const oa = o[axis] ?? 0;
    const da = d[axis] ?? 0;

    if (Math.abs(da) < 1e-8) {
      if (oa < mn || oa > mx) return null;
    } else {
      let t1 = (mn - oa) / da;
      let t2 = (mx - oa) / da;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}