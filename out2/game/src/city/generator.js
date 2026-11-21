// Procedural city generator - deterministic from a seed.
// Roads, blocks, buildings with canvas-generated facade textures, instanced props.
// Emits colliders (AABBs) for the physics layer.

import { WORLD, COLORS } from '../config.js';

export const cityData = {
  blocks: [],
  lots: [],
  roads: [],
  intersections: [],
  sidewalks: [],
  props: [],
  colliders: [],       // { minX, maxX, minZ, maxZ, minY, maxY, kind }
  spawnPoints: { vehicles: [], pedestrians: [], missions: [], police: [] },
  lanePaths: [],       // traffic lane centre lines
  bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
};

const BUILDING_TYPES = [
  { name: 'office',    w: [14, 22], d: [14, 22], h: [22, 54], palette: ['#46566a', '#54657c', '#39485a', '#63748c'], lit: 0.34 },
  { name: 'apartment', w: [10, 16], d: [10, 16], h: [14, 34], palette: ['#8a7462', '#9b8570', '#6f5b4b', '#a89078'], lit: 0.42 },
  { name: 'warehouse', w: [18, 28], d: [14, 22], h: [8, 15],  palette: ['#5d5d5d', '#4b4b4b', '#6c6c6c', '#3d3d3d'], lit: 0.12 },
  { name: 'shop',      w: [9, 14],  d: [10, 15], h: [6, 12],  palette: ['#8d6350', '#7a5142', '#9d7360', '#66463a'], lit: 0.55 },
  { name: 'tower',     w: [15, 21], d: [15, 21], h: [46, 86], palette: ['#3b4c60', '#4d5f74', '#2e3d4e', '#5c6f86'], lit: 0.30 },
];

const PROP_TYPES = [
  { name: 'streetlight', weight: 3, height: 5.5 },
  { name: 'trashcan',    weight: 4, height: 0.9 },
  { name: 'bench',       weight: 2, height: 0.8 },
  { name: 'tree',        weight: 5, height: 6.5 },
  { name: 'hydrant',     weight: 2, height: 0.7 },
  { name: 'mailbox',     weight: 2, height: 1.2 },
  { name: 'planter',     weight: 3, height: 0.9 },
];

function mulberry(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Canvas facade textures: cheaper and better looking than thousands of meshes.
// ---------------------------------------------------------------------------

const facadeCache = new Map();

function facadeTexture(kind, hex, litRatio) {
  const key = kind + hex + litRatio;
  if (facadeCache.has(key)) return facadeCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 128, 128);

  // Concrete grain
  const img = ctx.getImageData(0, 0, 128, 128);
  const d = img.data;
  let g = 0x9e3779b9;
  for (let i = 0; i < d.length; i += 4) {
    g = (g * 1664525 + 1013904223) >>> 0;
    const n = ((g >>> 16) & 7) - 3;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  // Window grid: 4 x 4 per tile
  const cols = 4;
  const rows = 4;
  const cw = 128 / cols;
  const ch = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = ((r * 13 + c * 29 + kind.length * 7) % 100) / 100 < litRatio;
      ctx.fillStyle = lit ? 'rgba(255, 214, 150, 0.92)' : 'rgba(18, 22, 34, 0.9)';
      ctx.fillRect(c * cw + cw * 0.18, r * ch + ch * 0.2, cw * 0.64, ch * 0.5);
      if (!lit) {
        ctx.fillStyle = 'rgba(120, 150, 190, 0.14)';
        ctx.fillRect(c * cw + cw * 0.18, r * ch + ch * 0.2, cw * 0.64, ch * 0.18);
      }
    }
  }

  // Floor band
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  for (let r = 0; r <= rows; r++) ctx.fillRect(0, r * ch - 1, 128, 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  facadeCache.set(key, texture);
  return texture;
}

let roofMaterial = null;
function getRoofMaterial() {
  if (!roofMaterial) {
    roofMaterial = new THREE.MeshLambertMaterial({ color: 0x2f3238 });
  }
  return roofMaterial;
}

// ---------------------------------------------------------------------------

export function initCity(seed, scene) {
  const random = mulberry(seed);
  cityData.blocks.length = 0;
  cityData.lots.length = 0;
  cityData.roads.length = 0;
  cityData.intersections.length = 0;
  cityData.sidewalks.length = 0;
  cityData.props.length = 0;
  cityData.colliders.length = 0;
  cityData.lanePaths.length = 0;
  cityData.spawnPoints = { vehicles: [], pedestrians: [], missions: [], police: [] };

  const NX = WORLD.blocksX;
  const NZ = WORLD.blocksZ;
  const BS = WORLD.blockSize;
  const RW = WORLD.roadWidth;
  const SW = WORLD.sidewalkWidth;

  const halfX = (NX * BS) / 2;
  const halfZ = (NZ * BS) / 2;
  cityData.bounds = { minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ };

  // ---- Roads -------------------------------------------------------------
  for (let bx = 0; bx <= NX; bx++) {
    const x = -halfX + bx * BS;
    cityData.roads.push({
      axis: 'z', x, z: 0, width: RW, from: -halfZ, to: halfZ,
    });
    cityData.lanePaths.push({ axis: 'z', x: x - RW * 0.22, from: -halfZ, to: halfZ, dir: -1 });
    cityData.lanePaths.push({ axis: 'z', x: x + RW * 0.22, from: -halfZ, to: halfZ, dir: 1 });
  }
  for (let bz = 0; bz <= NZ; bz++) {
    const z = -halfZ + bz * BS;
    cityData.roads.push({
      axis: 'x', x: 0, z, width: RW, from: -halfX, to: halfX,
    });
    cityData.lanePaths.push({ axis: 'x', x: 0, z: z - RW * 0.22, from: -halfX, to: halfX, dir: 1 });
    cityData.lanePaths.push({ axis: 'x', x: 0, z: z + RW * 0.22, from: -halfX, to: halfX, dir: -1 });
  }

  for (let bx = 0; bx <= NX; bx++) {
    for (let bz = 0; bz <= NZ; bz++) {
      cityData.intersections.push({ x: -halfX + bx * BS, z: -halfZ + bz * BS, bx, bz });
    }
  }

  // ---- Blocks, lots, buildings ------------------------------------------
  const buildings = [];

  for (let bx = 0; bx < NX; bx++) {
    for (let bz = 0; bz < NZ; bz++) {
      const cx = -halfX + (bx + 0.5) * BS;
      const cz = -halfZ + (bz + 0.5) * BS;
      const innerW = BS - RW - SW * 2;
      const innerD = BS - RW - SW * 2;

      const block = { x: cx, z: cz, width: innerW, depth: innerD, bx, bz, lots: [] };

      const lotsX = random() < 0.45 ? 2 : 3;
      const lotsZ = random() < 0.45 ? 2 : 3;
      const lw = innerW / lotsX;
      const ld = innerD / lotsZ;

      for (let lx = 0; lx < lotsX; lx++) {
        for (let lz = 0; lz < lotsZ; lz++) {
          const px = cx - innerW / 2 + lw * (lx + 0.5);
          const pz = cz - innerD / 2 + ld * (lz + 0.5);

          // Taller towers toward the middle of the map
          const centreBias = 1 - Math.min(1, Math.hypot(px, pz) / (halfX * 1.1));
          const hasBuilding = random() < 0.62 + centreBias * 0.3;

          const lot = {
            x: px, z: pz, width: lw, depth: ld,
            type: hasBuilding ? 'building' : 'open',
            building: null, block,
          };

          if (hasBuilding) {
            const t = pickBuildingType(random, centreBias);
            const bw = Math.min(lw - 2.2, randRange(random, t.w[0], t.w[1]));
            const bd = Math.min(ld - 2.2, randRange(random, t.d[0], t.d[1]));
            const bh = randRange(random, t.h[0], t.h[1]) * (0.72 + centreBias * 0.5);

            const b = {
              type: t.name,
              x: px, z: pz,
              width: Math.max(6, bw),
              depth: Math.max(6, bd),
              height: Math.max(5, bh),
              color: t.palette[Math.floor(random() * t.palette.length)],
              lit: t.lit,
              rotation: (random() < 0.5 ? 0 : Math.PI / 2) + (random() < 0.15 ? randRange(random, -0.2, 0.2) : 0),
            };
            lot.building = b;
            buildings.push(b);

            cityData.colliders.push({
              minX: px - b.width / 2, maxX: px + b.width / 2,
              minZ: pz - b.depth / 2, maxZ: pz + b.depth / 2,
              minY: 0, maxY: b.height, kind: 'building',
            });

            cityData.spawnPoints.missions.push({
              x: px, z: pz + b.depth / 2 + 4, y: 0, block,
            });
            cityData.spawnPoints.police.push({ x: px, z: pz, y: 0 });
          } else {
            const spots = Math.floor((lw * ld) / 60);
            for (let i = 0; i < Math.min(spots, 3); i++) {
              cityData.spawnPoints.vehicles.push({
                x: px + randRange(random, -lw * 0.3, lw * 0.3),
                z: pz + randRange(random, -ld * 0.3, ld * 0.3),
                y: 0,
                rotation: random() < 0.5 ? 0 : Math.PI / 2,
              });
            }
          }

          block.lots.push(lot);
          cityData.lots.push(lot);
        }
      }

      // Sidewalk quads (visual + walkable)
      const swOffX = innerW / 2 + SW / 2;
      const swOffZ = innerD / 2 + SW / 2;
      cityData.sidewalks.push({ x: cx - swOffX, z: cz, width: SW, depth: innerD + SW * 2 });
      cityData.sidewalks.push({ x: cx + swOffX, z: cz, width: SW, depth: innerD + SW * 2 });
      cityData.sidewalks.push({ x: cx, z: cz - swOffZ, width: innerW, depth: SW });
      cityData.sidewalks.push({ x: cx, z: cz + swOffZ, width: innerW, depth: SW });

      // Pedestrian spawn anchors at block corners
      cityData.spawnPoints.pedestrians.push({ x: cx - swOffX, z: cz - swOffZ });
      cityData.spawnPoints.pedestrians.push({ x: cx + swOffX, z: cz + swOffZ });
      cityData.spawnPoints.pedestrians.push({ x: cx + swOffX, z: cz - swOffZ });

      cityData.blocks.push(block);
    }
  }

  // ---- Props -------------------------------------------------------------
  const propCounts = { streetlight: 0, trashcan: 0, bench: 0, tree: 0, hydrant: 0, mailbox: 0, planter: 0 };

  // Streetlights along every block edge
  for (let bx = 0; bx < NX; bx++) {
    for (let bz = 0; bz < NZ; bz++) {
      const cx = -halfX + (bx + 0.5) * BS;
      const cz = -halfZ + (bz + 0.5) * BS;
      const edge = (BS - RW) / 2 - 1.0;
      const positions = [
        { x: cx - edge, z: cz - edge },
        { x: cx + edge, z: cz + edge },
      ];
      for (const p of positions) {
        if (random() < 0.75) {
          cityData.props.push({ x: p.x, z: p.z, y: 0, type: 'streetlight', rotation: Math.floor(random() * 4) * (Math.PI / 2) });
          propCounts.streetlight++;
        }
      }
      // Filler props
      for (let i = 0; i < 3; i++) {
        const t = pickPropType(random);
        if (t.name === 'streetlight') continue;
        cityData.props.push({
          x: cx + randRange(random, -edge, edge),
          z: cz + (random() < 0.5 ? -edge : edge),
          y: 0, type: t.name, rotation: random() * Math.PI * 2,
        });
        propCounts[t.name] = (propCounts[t.name] || 0) + 1;
      }
    }
  }

  // ---- Meshes ------------------------------------------------------------
  buildMeshes(scene, buildings, propCounts);

  return cityData;
}

function randRange(r, a, b) {
  return a + r() * (b - a);
}

function pickBuildingType(random, centreBias) {
  const r = random();
  if (centreBias > 0.55) {
    if (r < 0.45) return BUILDING_TYPES[4]; // tower
    if (r < 0.85) return BUILDING_TYPES[0]; // office
    return BUILDING_TYPES[1];
  }
  if (r < 0.28) return BUILDING_TYPES[0];
  if (r < 0.56) return BUILDING_TYPES[1];
  if (r < 0.78) return BUILDING_TYPES[3];
  return BUILDING_TYPES[2];
}

function pickPropType(random) {
  const total = PROP_TYPES.reduce((s, p) => s + p.weight, 0);
  let r = random() * total;
  for (const p of PROP_TYPES) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return PROP_TYPES[0];
}

function buildMeshes(scene, buildings, propCounts) {
  // --- Ground ---
  const groundGeo = new THREE.PlaneGeometry(4000, 4000);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x14181a });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Roads (merged into one geometry per axis) ---
  const roadMat = new THREE.MeshLambertMaterial({ color: COLORS.road });
  const roadGroup = new THREE.Group();

  const roadParts = [];
  for (const road of cityData.roads) {
    const w = road.axis === 'z' ? road.width : road.to - road.from;
    const d = road.axis === 'z' ? road.to - road.from : road.width;
    const cx = road.axis === 'z' ? road.x : 0;
    const cz = road.axis === 'z' ? 0 : road.z;
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    geo.translate(cx, 0.01, cz);
    roadParts.push(geo);
  }
  const roadMerged = mergeGeometries(roadParts);
  const roadMesh = new THREE.Mesh(roadMerged, roadMat);
  roadMesh.receiveShadow = true;
  roadGroup.add(roadMesh);

  // Lane dashes
  const dashParts = [];
  for (const lane of cityData.lanePaths) {
    if (lane.dir < 0) continue; // one dash set per road
    const len = 2.2;
    const gap = 5.5;
    for (let t = lane.from; t < lane.to; t += gap) {
      const geo = new THREE.PlaneGeometry(lane.axis === 'z' ? 0.16 : len, lane.axis === 'z' ? len : 0.16);
      geo.rotateX(-Math.PI / 2);
      geo.translate(lane.axis === 'z' ? lane.x : t, 0.02, lane.axis === 'z' ? t : lane.z);
      dashParts.push(geo);
    }
  }
  const dashMesh = new THREE.Mesh(
    mergeGeometries(dashParts),
    new THREE.MeshBasicMaterial({ color: 0xb8b070 })
  );
  roadGroup.add(dashMesh);
  scene.add(roadGroup);

  // --- Sidewalks ---
  const swParts = [];
  for (const s of cityData.sidewalks) {
    const geo = new THREE.BoxGeometry(s.width, 0.18, s.depth);
    geo.translate(s.x, 0.09, s.z);
    swParts.push(geo);
  }
  const swMesh = new THREE.Mesh(
    mergeGeometries(swParts),
    new THREE.MeshLambertMaterial({ color: COLORS.sidewalk })
  );
  swMesh.receiveShadow = true;
  scene.add(swMesh);

  // --- Buildings: one merged geometry per (type, colour) bucket ---
  const buckets = new Map();
  for (const b of buildings) {
    const key = b.type + '|' + b.color + '|' + b.lit;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(b);
  }

  for (const [key, list] of buckets) {
    const [type, color, litStr] = key.split('|');
    const parts = [];
    for (const b of list) {
      const geo = new THREE.BoxGeometry(b.width, b.height, b.depth);
      geo.rotateY(b.rotation);
      geo.translate(b.x, b.height / 2, b.z);
      parts.push(geo);
    }
    const merged = mergeGeometries(parts, true);

    const tex = facadeTexture(type, color, parseFloat(litStr));
    const material = new THREE.MeshLambertMaterial({ map: tex });

    // UV scale: 1 tile per 8m x 8m so windows read at street level
    const uv = merged.attributes.uv;
    const pos = merged.attributes.position;
    const normal = merged.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(normal.getX(i));
      const ny = Math.abs(normal.getY(i));
      const nz = Math.abs(normal.getZ(i));
      if (ny > 0.5) {
        uv.setXY(i, 0.02, 0.02);
      } else if (nx > nz) {
        uv.setXY(i, pos.getZ(i) / 9, pos.getY(i) / 9);
      } else {
        uv.setXY(i, pos.getX(i) / 9, pos.getY(i) / 9);
      }
    }
    uv.needsUpdate = true;

    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // --- Props: instanced meshes ---
  buildProps(scene);
}

function buildProps(scene) {
  const byType = new Map();
  for (const p of cityData.props) {
    if (!byType.has(p.type)) byType.set(p.type, []);
    byType.get(p.type).push(p);
  }

  const dummy = new THREE.Object3D();

  for (const [type, list] of byType) {
    const n = list.length;
    if (n === 0) continue;

    if (type === 'streetlight') {
      const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 5.5, 6);
      poleGeo.translate(0, 2.75, 0);
      const poleMat = new THREE.MeshLambertMaterial({ color: 0x3d4148 });
      const poles = new THREE.InstancedMesh(poleGeo, poleMat, n);
      poles.castShadow = true;

      const headGeo = new THREE.BoxGeometry(0.9, 0.16, 0.34);
      headGeo.translate(0, 5.5, 0.3);
      const headMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
      const heads = new THREE.InstancedMesh(headGeo, headMat, n);

      list.forEach((p, i) => {
        dummy.position.set(p.x, 0, p.z);
        dummy.rotation.set(0, p.rotation, 0);
        dummy.updateMatrix();
        poles.setMatrixAt(i, dummy.matrix);
        heads.setMatrixAt(i, dummy.matrix);
      });
      poles.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      scene.add(poles, heads);

      // Only a few real point lights: the nearest ones
      const lightBudget = Math.min(6, n);
      for (let i = 0; i < lightBudget; i++) {
        const p = list[Math.floor((i / lightBudget) * n)];
        const light = new THREE.PointLight(0xffe0a0, 0.55, 26, 2);
        light.position.set(p.x, 5.2, p.z);
        scene.add(light);
      }
      continue;
    }

    if (type === 'tree') {
      const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 2.4, 6);
      trunkGeo.translate(0, 1.2, 0);
      const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x3b2a1c }), n);
      trunks.castShadow = true;

      const leafGeo = new THREE.IcosahedronGeometry(1.9, 1);
      leafGeo.translate(0, 4.1, 0);
      const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x24401f }), n);
      leaves.castShadow = true;

      list.forEach((p, i) => {
        const s = 0.8 + ((i * 37) % 40) / 100;
        dummy.position.set(p.x, 0, p.z);
        dummy.rotation.set(0, p.rotation, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
        leaves.setMatrixAt(i, dummy.matrix);
      });
      trunks.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
      dummy.scale.set(1, 1, 1);
      scene.add(trunks, leaves);

      for (const p of list) {
        cityData.colliders.push({
          minX: p.x - 0.35, maxX: p.x + 0.35,
          minZ: p.z - 0.35, maxZ: p.z + 0.35,
          minY: 0, maxY: 2.4, kind: 'prop',
        });
      }
      continue;
    }

    let geo, mat, castShadow = true;
    switch (type) {
      case 'trashcan':
        geo = new THREE.CylinderGeometry(0.28, 0.24, 0.9, 8);
        geo.translate(0, 0.45, 0);
        mat = new THREE.MeshLambertMaterial({ color: 0x2b3320 });
        break;
      case 'bench':
        geo = new THREE.BoxGeometry(1.6, 0.45, 0.55);
        geo.translate(0, 0.42, 0);
        mat = new THREE.MeshLambertMaterial({ color: 0x4a3a26 });
        break;
      case 'hydrant':
        geo = new THREE.CylinderGeometry(0.16, 0.2, 0.7, 8);
        geo.translate(0, 0.35, 0);
        mat = new THREE.MeshLambertMaterial({ color: 0xa8231c });
        break;
      case 'mailbox':
        geo = new THREE.BoxGeometry(0.34, 0.55, 0.24);
        geo.translate(0, 0.95, 0);
        mat = new THREE.MeshLambertMaterial({ color: 0x1e3f7a });
        break;
      case 'planter':
        geo = new THREE.BoxGeometry(1.2, 0.7, 0.7);
        geo.translate(0, 0.35, 0);
        mat = new THREE.MeshLambertMaterial({ color: 0x3a3326 });
        break;
      default:
        continue;
    }

    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    list.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.rotation, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);

    const half = type === 'bench' ? 0.8 : type === 'planter' ? 0.6 : 0.3;
    for (const p of list) {
      cityData.colliders.push({
        minX: p.x - half, maxX: p.x + half,
        minZ: p.z - half, maxZ: p.z + half,
        minY: 0, maxY: 1.0, kind: 'prop',
      });
    }
  }
}

// Minimal geometry merge (positions, normals, uv, index) - avoids pulling in BufferGeometryUtils.
function mergeGeometries(geometries, hasIndex = true) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geometries) {
    vertexCount += g.attributes.position.count;
    if (g.index) indexCount += g.index.count;
    else indexCount += g.attributes.position.count;
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);

  let vo = 0;
  let io = 0;
  for (const g of geometries) {
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    positions.set(pos.array, vo * 3);
    if (nor) normals.set(nor.array, vo * 3);
    if (uv) uvs.set(uv.array, vo * 2);

    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) indices[io + i] = idx[i] + vo;
      io += idx.length;
    } else {
      for (let i = 0; i < pos.count; i++) indices[io + i] = i + vo;
      io += pos.count;
    }
    vo += pos.count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

export function getCityData() {
  return cityData;
}

/** Nearest point on any road to (x, z) - used for spawning and navigation. */
export function nearestRoadPoint(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const road of cityData.roads) {
    if (road.axis === 'z') {
      const cz = Math.max(road.from, Math.min(road.to, z));
      const d = (x - road.x) ** 2 + (z - cz) ** 2;
      if (d < bestD) { bestD = d; best = { x: road.x, z: cz, axis: 'z' }; }
    } else {
      const cx = Math.max(road.from, Math.min(road.to, x));
      const d = (x - cx) ** 2 + (z - road.z) ** 2;
      if (d < bestD) { bestD = d; best = { x: cx, z: road.z, axis: 'x' }; }
    }
  }
  return best;
}

/** Clamp a position inside the city bounds. */
export function clampToCity(pos, margin = 4) {
  const b = cityData.bounds;
  pos.x = Math.max(b.minX + margin, Math.min(b.maxX - margin, pos.x));
  pos.z = Math.max(b.minZ + margin, Math.min(b.maxZ - margin, pos.z));
  return pos;
}