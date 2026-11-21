// Missions: three chained story missions, each with several objectives, markers in the world,
// a fail/retry path, and money rewards that accumulate.

import { MISSION } from '../config.js';
import { cityData } from '../city/generator.js';

export const MISSION_DEFS = [
  {
    id: 'pickup',
    title: 'Dead Drop',
    intro: 'A courier is waiting at the corner of Kesler & 4th. Pick up the package.',
    reward: 1500,
    objectives: [
      { kind: 'goto', text: 'Drive to the courier', radius: 4.5, marker: 'pickup' },
      { kind: 'goto', text: 'Deliver the package to the garage', radius: 4.5, marker: 'dropoff' },
      { kind: 'escape', text: 'Lose the cops', radius: 0 },
    ],
  },
  {
    id: 'repo',
    title: 'Repossession',
    intro: 'The dealership wants its car back. It is parked across town with the keys in it.',
    reward: 2600,
    objectives: [
      { kind: 'steal', text: 'Steal the marked Dominator', radius: 5.0, marker: 'car' },
      { kind: 'goto', text: 'Bring it to the lock-up', radius: 5.0, marker: 'dropoff', requireVehicle: true },
      { kind: 'evade', text: 'Shake the tail', radius: 0, seconds: 30 },
    ],
  },
  {
    id: 'payback',
    title: 'Payback',
    intro: 'Somebody torched the lock-up. Three of their crew are on the street. Settle it.',
    reward: 4200,
    objectives: [
      { kind: 'goto', text: 'Head to the meeting point', radius: 5.0, marker: 'meet' },
      { kind: 'kill', text: 'Take out the crew', count: 3 },
      { kind: 'escape', text: 'Get out of the district', radius: 0, seconds: 45 },
    ],
  },
];

export function createMissionSystem(state, pedSystem, wantedSystem, audio, effects, random) {
  let markerMesh = null;
  let markerRing = null;
  let sceneRef = null;
  let missionTargets = [];   // spawned entities for the current stage
  let stageTimer = 0;
  let killCount = 0;

  function attachScene(scene) {
    sceneRef = scene;
    const geo = new THREE.CylinderGeometry(MISSION.markerRadius, MISSION.markerRadius, 0.22, 24, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf0c34a,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    markerMesh = new THREE.Mesh(geo, mat);
    markerMesh.visible = false;
    scene.add(markerMesh);

    const beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 26, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xf0c34a,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    markerRing = new THREE.Mesh(beamGeo, beamMat);
    markerRing.visible = false;
    scene.add(markerRing);
  }

  function availableMissions() {
    return MISSION_DEFS.filter((m) => !state.mission.completed.includes(m.id));
  }

  function pickMissionPoint(index, offset = 0) {
    const pts = cityData.spawnPoints.missions;
    if (!pts.length) return { x: 0, z: 0 };
    const i = (index * 37 + offset * 11 + 5) % pts.length;
    return pts[i];
  }

  function startMission(def) {
    const m = state.mission;
    m.active = def;
    m.stageIndex = 0;
    m.timer = 0;
    m.failTimer = 0;
    m.reward = def.reward;
    m.objective = def.objectives[0].text;
    m.completedStages = [];
    state.hud.objective = def.title.toUpperCase() + ' — ' + def.objectives[0].text;
    state.hud.toast = def.title;
    state.hud.toastTimer = 3;
    audio.play('mission');

    // Assign world positions for each objective
    m.positions = def.objectives.map((o, i) => pickMissionPoint(i, m.completed.length + 3));
    m.stageTarget = null;
    beginStage(0);
  }

  function beginStage(index) {
    const m = state.mission;
    const obj = m.active.objectives[index];
    m.stageIndex = index;
    m.timer = 0;
    killCount = 0;
    stageTimer = 0;

    // Clear old mission entities
    cleanupTargets();

    if (obj.kind === 'kill') {
      // Spawn the crew nearby
      const base = m.positions[index];
      for (let i = 0; i < (obj.count || 3); i++) {
        const ang = (i / (obj.count || 3)) * Math.PI * 2;
        const ped = pedSystem.spawnPed(base.x + Math.cos(ang) * 5, base.z + Math.sin(ang) * 5);
        if (ped) {
          ped.health = 110;
          ped.hostile = true;
          ped.state = 'hostile';
          missionTargets.push(ped);
        }
      }
    }

    if (obj.kind === 'steal') {
      // Mark an existing traffic car as the target
      const base = m.positions[index];
      let best = null;
      let bestD = Infinity;
      for (const v of state.vehicles) {
        if (v.police) continue;
        const d = Math.hypot(v.x - base.x, v.z - base.z);
        if (d < bestD) { bestD = d; best = v; }
      }
      if (best) {
        m.stageTarget = best;
        m.positions[index] = { x: best.x, z: best.z };
      }
    }

    showMarker(m.positions[index]);
  }

  function showMarker(pos) {
    if (!markerMesh) return;
    if (!pos) { markerMesh.visible = false; markerRing.visible = false; return; }
    markerMesh.visible = true;
    markerMesh.position.set(pos.x, 0.12, pos.z);
    markerRing.visible = true;
    markerRing.position.set(pos.x, 13, pos.z);
  }

  function cleanupTargets() {
    for (const t of missionTargets) {
      if (t.group) pedSystem.removePed(t);
    }
    missionTargets = [];
  }

  function completeStage() {
    const m = state.mission;
    const obj = m.active.objectives[m.stageIndex];
    m.completedStages.push(obj.kind);

    const next = m.stageIndex + 1;
    if (next >= m.active.objectives.length) {
      finishMission(true);
      return;
    }
    audio.play('mission');
    state.hud.toast = 'OBJECTIVE COMPLETE';
    state.hud.toastTimer = 1.8;
    beginStage(next);
    state.hud.objective = m.active.title.toUpperCase() + ' — ' + m.active.objectives[next].text;
  }

  function finishMission(success) {
    const m = state.mission;
    if (!m.active) return;

    if (success) {
      state.player.money += m.reward;
      m.completed.push(m.active.id);
      state.hud.toast = `MISSION COMPLETE  +$${m.reward}`;
      state.hud.toastTimer = 4;
      state.hud.objective = '';
      audio.play('cash');
      if (state.onMissionComplete) state.onMissionComplete(m.active);
      m.bannerText = 'MISSION PASSED';
      m.bannerTimer = 3.2;
    } else {
      m.failedCount++;
      state.hud.toast = 'MISSION FAILED';
      state.hud.toastTimer = 3;
      state.hud.objective = '';
      audio.play('fail');
      m.failText = m.failReason || 'You blew it.';
      m.failTimer = 3.2;
    }

    m.active = null;
    m.stageIndex = 0;
    m.stageTarget = null;
    cleanupTargets();
    if (markerMesh) { markerMesh.visible = false; markerRing.visible = false; }
  }

  function fail(reason) {
    if (!state.mission.active) return;
    state.mission.failReason = reason;
    finishMission(false);
  }

  function onPedKilled(ped) {
    const m = state.mission;
    if (!m.active) return;
    const obj = m.active.objectives[m.stageIndex];
    if (!obj) return;

    if (obj.kind === 'kill' && missionTargets.includes(ped)) {
      killCount++;
      state.hud.toast = `${killCount} / ${obj.count}`;
      state.hud.toastTimer = 1.2;
      if (killCount >= obj.count) completeStage();
    }

    if (obj.kind === 'escape' || obj.kind === 'evade') {
      // Killing during an escape is fine
    } else if (obj.kind === 'goto' && !ped.hostile) {
      // Civilian casualties during a delivery: not a fail, just heat
    }
  }

  function update(dt) {
    const m = state.mission;
    const p = state.player;

    if (m.bannerTimer > 0) m.bannerTimer -= dt;
    if (m.failTimer > 0) m.failTimer -= dt;

    if (!m.active) {
      // Offer the next mission when the player is near a mission point
      const avail = availableMissions();
      if (avail.length) {
        const offer = avail[0];
        const point = pickMissionPoint(0, m.completed.length * 3 + 7);
        if (markerMesh && !markerMesh.visible) showMarker(point);

        const d = Math.hypot(p.x - point.x, p.z - point.z);
        if (d < MISSION.markerRadius + 1.2 && !p.dead) {
          startMission(offer);
        }
      }
      return;
    }

    const obj = m.active.objectives[m.stageIndex];
    if (!obj) return;

    m.timer += dt;
    stageTimer += dt;

    // Marker animation
    if (markerMesh && markerMesh.visible) {
      markerMesh.rotation.y += dt * 0.8;
      const pulse = 1 + Math.sin(m.timer * 3) * 0.06;
      markerMesh.scale.set(pulse, 1, pulse);
      if (markerRing) markerRing.rotation.y -= dt * 0.5;
    }

    // Update the steal target marker to follow the car
    if (obj.kind === 'steal' && m.stageTarget && m.stageTarget.mesh) {
      m.positions[m.stageIndex] = { x: m.stageTarget.x, z: m.stageTarget.z };
      showMarker(m.positions[m.stageIndex]);
    }

    switch (obj.kind) {
      case 'goto':
      case 'meet':
      case 'dropoff':
      case 'pickup': {
        const target = m.positions[m.stageIndex];
        const d = Math.hypot(p.x - target.x, p.z - target.z);
        if (obj.requireVehicle && !p.inVehicle) break;
        if (d < obj.radius) completeStage();
        break;
      }
      case 'steal': {
        const target = m.stageTarget;
        if (!target) { fail('The car got away.'); break; }
        if (target.isPlayer || p.inVehicle === target) {
          m.stageTarget = null;
          completeStage();
        }
        break;
      }
      case 'kill': {
        // handled by onPedKilled
        if (stageTimer > 180) fail('The crew scattered.');
        break;
      }
      case 'escape': {
        if (state.wanted.stars === 0) completeStage();
        if (obj.seconds && stageTimer > obj.seconds) completeStage();
        break;
      }
      case 'evade': {
        if (state.wanted.stars === 0) {
          if (!m.evadeTimer) m.evadeTimer = 0;
          m.evadeTimer += dt;
          if (m.evadeTimer > 2.5) { m.evadeTimer = 0; completeStage(); }
        } else {
          m.evadeTimer = 0;
        }
        if (obj.seconds && stageTimer > obj.seconds) fail('They caught up with you.');
        break;
      }
      default:
        break;
    }
  }

  return { attachScene, update, onPedKilled, startMission, fail, availableMissions, finishMission };
}
