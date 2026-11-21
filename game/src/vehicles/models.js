// Vehicle meshes built from primitives. Three distinct silhouettes plus a police cruiser.

import { VEHICLE_TYPES } from '../config.js';

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
const rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.28, 8);
rimGeo.rotateZ(Math.PI / 2);
const rimMat = new THREE.MeshLambertMaterial({ color: 0x8d949c });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2632, transparent: true, opacity: 0.82 });
const lightMatFront = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
const lightMatRear = new THREE.MeshBasicMaterial({ color: 0xcc2b1c });
const headlightGeo = new THREE.BoxGeometry(0.34, 0.16, 0.1);
const taillightGeo = new THREE.BoxGeometry(0.3, 0.14, 0.08);

export function buildVehicleMesh(typeKey, colourOverride) {
  const t = VEHICLE_TYPES[typeKey];
  const group = new THREE.Group();
  const [bw, bh, bl] = t.body;
  const [cw, ch, cl] = t.cabin;

  const paint = new THREE.MeshLambertMaterial({ color: colourOverride ?? t.colour });
  const accent = new THREE.MeshLambertMaterial({ color: t.accent });

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bl), paint);
  body.position.y = 0.36 + bh / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Lower skirt / chassis
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.01, 0.26, bl * 0.97), accent);
  skirt.position.y = 0.34;
  skirt.castShadow = true;
  group.add(skirt);

  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cl), paint);
  cabin.position.set(0, 0.36 + bh + ch / 2 - 0.04, -0.12);
  cabin.castShadow = true;
  group.add(cabin);

  // Windows: thin boxes slightly proud of the cabin
  const winH = ch * 0.62;
  const winGeo = new THREE.BoxGeometry(cw * 1.005, winH, cl * 0.92);
  const windows = new THREE.Mesh(winGeo, glassMat);
  windows.position.set(0, 0.36 + bh + ch * 0.5 - 0.02, -0.12);
  group.add(windows);

  // Windscreen rake hint: a thin slanted slab at the front of the cabin
  const rake = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.94, 0.06, ch * 0.7), glassMat);
  rake.position.set(0, 0.36 + bh + ch * 0.72, -0.12 + cl * 0.44);
  rake.rotation.x = -0.55;
  group.add(rake);

  // Lights
  const headY = 0.36 + bh * 0.62;
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(headlightGeo, lightMatFront);
    hl.position.set(sx * (bw / 2 - 0.3), headY, bl / 2 - 0.02);
    group.add(hl);

    const tl = new THREE.Mesh(taillightGeo, lightMatRear);
    tl.position.set(sx * (bw / 2 - 0.28), headY, -bl / 2 + 0.02);
    group.add(tl);
  }

  // Wheels
  const wheelY = 0.36;
  const frontZ = bl * 0.32;
  const rearZ = -bl * 0.32;
  const sideX = bw / 2 - 0.06;
  const wheels = [];
  for (const [wx, wz] of [[-sideX, frontZ], [sideX, frontZ], [-sideX, rearZ], [sideX, rearZ]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, wheelY, wz);
    w.castShadow = true;
    group.add(w);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    w.add(rim);
    wheels.push(w);
  }

  // Type-specific extras
  if (typeKey === 'muscle') {
    // Bonnet scoop + spoiler
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.7), accent);
    scoop.position.set(0, 0.36 + bh + 0.06, bl * 0.26);
    group.add(scoop);

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.92, 0.07, 0.34), accent);
    spoiler.position.set(0, 0.36 + bh + 0.28, -bl / 2 + 0.2);
    group.add(spoiler);
    for (const sx of [-0.62, 0.62]) {
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.08), accent);
      stalk.position.set(sx, 0.36 + bh + 0.14, -bl / 2 + 0.22);
      group.add(stalk);
    }
  }

  if (typeKey === 'suv') {
    // Roof rack
    const rack = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.9, 0.07, cl * 0.8), accent);
    rack.position.set(0, 0.36 + bh + ch + 0.03, -0.12);
    group.add(rack);
    for (const sx of [-0.7, 0.7]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, cl * 0.82), accent);
      rail.position.set(sx, 0.36 + bh + ch + 0.09, -0.12);
      group.add(rail);
    }
  }

  if (typeKey === 'sedan') {
    // Chrome beltline
    const belt = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.008, 0.05, bl * 0.6), new THREE.MeshLambertMaterial({ color: 0xaab2ba }));
    belt.position.set(0, 0.36 + bh * 0.98, 0);
    group.add(belt);
  }

  // Police extras: light bar + livery stripes
  let sirenBar = null;
  if (typeKey === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.8, 0.14, 0.3), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.position.set(0, 0.36 + bh + ch + 0.08, -0.12);
    group.add(bar);

    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2244ff });
    const redLamp = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.36, 0.12, 0.26), redMat);
    redLamp.position.set(-cw * 0.2, 0.36 + bh + ch + 0.09, -0.12);
    group.add(redLamp);
    const blueLamp = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.36, 0.12, 0.26), blueMat);
    blueLamp.position.set(cw * 0.2, 0.36 + bh + ch + 0.09, -0.12);
    group.add(blueLamp);
    sirenBar = { red: redLamp, blue: blueLamp, redMat, blueMat };

    // Side stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.012, 0.22, bl * 0.86), new THREE.MeshLambertMaterial({ color: 0xdfe6ee }));
    stripe.position.set(0, 0.36 + bh * 0.5, 0);
    group.add(stripe);

    const badge = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.014, 0.1, bl * 0.3), new THREE.MeshLambertMaterial({ color: 0x1a2f5c }));
    badge.position.set(0, 0.36 + bh * 0.72, bl * 0.2);
    group.add(badge);
  }

  group.userData = { wheels, sirenBar, body, type: typeKey };
  return group;
}

export function setSirenPhase(group, phase) {
  const bar = group.userData.sirenBar;
  if (!bar) return;
  const on = Math.floor(phase * 6) % 2 === 0;
  bar.red.visible = on;
  bar.blue.visible = !on;
  bar.redMat.color.setHex(on ? 0xff2222 : 0x3a0a0a);
  bar.blueMat.color.setHex(on ? 0x0a0a3a : 0x2244ff);
}
