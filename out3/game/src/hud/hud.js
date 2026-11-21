// HUD: 2D canvas overlay. Minimap with blips, wanted stars, health/armour, money,
// weapon+ammo, speedometer, objective banner, toasts, crosshair.

import { UI_COLORS, WEAPONS, WORLD } from '../config.js';
import { cityData } from '../city/generator.js';

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let W = 1280;
  let H = 720;

  // Pre-rendered static minimap of the whole city (drawn once)
  let cityMap = null;
  const MAP_RES = 512;
  const MAP_SPAN = WORLD.blocksX * WORLD.blockSize + 40;

  function resize(width, height) {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = width;
    H = height;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
  }

  function buildCityMap() {
    const c = document.createElement('canvas');
    c.width = MAP_RES;
    c.height = MAP_RES;
    const g = c.getContext('2d');

    const half = MAP_SPAN / 2;
    const toPx = (v) => ((v + half) / MAP_SPAN) * MAP_RES;

    g.fillStyle = '#14181e';
    g.fillRect(0, 0, MAP_RES, MAP_RES);

    // Blocks
    g.fillStyle = '#232a33';
    for (const b of cityData.blocks) {
      const x0 = toPx(b.x - b.width / 2);
      const z0 = toPx(b.z - b.depth / 2);
      const w = (b.width / MAP_SPAN) * MAP_RES;
      const h = (b.depth / MAP_SPAN) * MAP_RES;
      g.fillRect(x0, z0, w, h);
    }

    // Buildings
    for (const lot of cityData.lots) {
      if (!lot.building) continue;
      const b = lot.building;
      const shade = 90 + Math.min(70, b.height * 1.1);
      g.fillStyle = `rgb(${shade * 0.72 | 0}, ${shade * 0.8 | 0}, ${shade | 0})`;
      const x0 = toPx(b.x - b.width / 2);
      const z0 = toPx(b.z - b.depth / 2);
      g.fillRect(x0, z0, (b.width / MAP_SPAN) * MAP_RES, (b.depth / MAP_SPAN) * MAP_RES);
    }

    // Roads
    g.strokeStyle = '#4a525c';
    g.lineWidth = Math.max(1.5, (WORLD.roadWidth / MAP_SPAN) * MAP_RES);
    for (const road of cityData.roads) {
      g.beginPath();
      if (road.axis === 'z') {
        g.moveTo(toPx(road.x), toPx(road.from));
        g.lineTo(toPx(road.x), toPx(road.to));
      } else {
        g.moveTo(toPx(road.from), toPx(road.z));
        g.lineTo(toPx(road.to), toPx(road.z));
      }
      g.stroke();
    }

    cityMap = c;
  }

  function drawMinimap(state) {
    const size = Math.round(Math.min(190, Math.min(W, H) * 0.24));
    const pad = 18;
    const cx = pad + size / 2;
    const cy = H - pad - size / 2;
    const radius = size / 2;

    ctx.save();
    // Circular clip
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Background
    ctx.fillStyle = '#101419';
    ctx.fillRect(cx - radius, cy - radius, size, size);

    // Draw the city map rotated so the player faces up
    const p = state.player;
    const zoom = 2.05;  // pixels per metre on the minimap
    const scale = (MAP_RES / MAP_SPAN) * zoom;

    ctx.translate(cx, cy);
    ctx.rotate(p.yaw);
    ctx.scale(scale, scale);
    ctx.translate(-p.x, -p.z);

    if (cityMap) {
      ctx.globalAlpha = 0.95;
      ctx.drawImage(cityMap, -MAP_SPAN / 2, -MAP_SPAN / 2, MAP_SPAN, MAP_SPAN);
      ctx.globalAlpha = 1;
    }

    // Blips in world space
    const blip = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, z, r / scale, 0, Math.PI * 2);
      ctx.fill();
    };

    // Traffic
    for (const v of state.vehicles) {
      if (v.isPlayer) continue;
      if (v.police) blip(v.x, v.z, UI_COLORS.danger, 3.6);
      else blip(v.x, v.z, '#5b7fa8', 2.2);
    }

    // Peds
    for (const ped of state.peds) {
      if (ped.state === 'dead') continue;
      blip(ped.x, ped.z, 'rgba(200,205,215,0.55)', 1.5);
    }

    // Mission marker
    if (state.mission.active && state.mission.positions) {
      const pos = state.mission.positions[state.mission.stageIndex];
      if (pos) blip(pos.x, pos.z, UI_COLORS.gold, 4.2);
    }

    ctx.restore();

    // Player arrow (always centre, pointing up)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Frame
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // North tick
    ctx.translate(cx, cy);
    ctx.rotate(p.yaw);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(0, -radius + 2);
    ctx.lineTo(4, -radius + 11);
    ctx.lineTo(-4, -radius + 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawStars(state) {
    const stars = state.wanted.stars;
    const size = 22;
    const gap = 4;
    const total = 5;
    const x0 = W - 18 - total * (size + gap);
    const y = 18;

    for (let i = 0; i < total; i++) {
      const on = i < stars;
      const flashing = state.hud.starsFlash > 0 && on && Math.floor(state.hud.starsFlash * 8) % 2 === 0;
      drawStar(x0 + i * (size + gap) + size / 2, y + size / 2, size * 0.46, on ? (flashing ? '#fff3b0' : UI_COLORS.gold) : 'rgba(255,255,255,0.12)');
    }
  }

  function drawStar(cx, cy, r, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    if (color !== 'rgba(255,255,255,0.12)') {
      ctx.shadowColor = 'rgba(240,195,74,0.75)';
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function bar(x, y, w, h, value, max, color, backColor) {
    ctx.fillStyle = backColor || 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    const frac = Math.max(0, Math.min(1, value / max));
    if (frac > 0) {
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, (w - 2) * frac, h - 2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawVitals(state) {
    const p = state.player;
    const x = 18;
    const y = H - 246;
    const w = 168;

    // Health
    bar(x, y, w, 15, p.health, 100, '#3fbf6a', 'rgba(0,0,0,0.6)');
    // Armour
    bar(x, y + 19, w, 9, p.armour, 100, '#4d8fd6', 'rgba(0,0,0,0.6)');

    // Money
    ctx.font = 'bold 26px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#0a0d10';
    ctx.fillText(`$${p.money.toLocaleString('en-US')}`, x + 2, y - 10 + 1);
    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillText(`$${p.money.toLocaleString('en-US')}`, x, y - 10);
  }

  function drawWeapon(state) {
    const p = state.player;
    if (p.inVehicle) return;
    const w = WEAPONS[p.weapon];
    const x = W - 18;
    const y = H - 26;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';

    ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(`${p.ammo[p.weapon] ?? 0}`, x + 2, y + 2);
    ctx.fillStyle = p.ammo[p.weapon] > 0 ? UI_COLORS.text : UI_COLORS.danger;
    ctx.fillText(`${p.ammo[p.weapon] ?? 0}`, x, y);

    ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = UI_COLORS.dim;
    ctx.fillText(`/ ${p.reserve[p.weapon] ?? 0}`, x, y - 32);

    ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = UI_COLORS.text;
    ctx.fillText(w.label.toUpperCase(), x, y - 56);

    if (p.reloadTimer > 0) {
      ctx.fillStyle = UI_COLORS.gold;
      ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('RELOADING', x, y - 78);
    }
  }

  function drawSpeedometer(state) {
    const p = state.player;
    if (!p.inVehicle) return;
    const speed = Math.abs(state.hud.speed);
    const cx = W - 96;
    const cy = H - 96;
    const r = 62;

    ctx.save();
    ctx.translate(cx, cy);

    // Dial
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI * 0.78, Math.PI * 2.22);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 9;
    ctx.stroke();

    const frac = Math.min(1, speed / 180);
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI * 0.78, Math.PI * 0.78 + Math.PI * 1.44 * frac);
    ctx.strokeStyle = frac > 0.8 ? UI_COLORS.danger : UI_COLORS.accent;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.fillStyle = UI_COLORS.text;
    ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(speed), 0, -4);
    ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = UI_COLORS.dim;
    ctx.fillText('KM/H', 0, 20);
    ctx.restore();
  }

  function drawObjective(state) {
    const text = state.hud.objective;
    if (!text) return;

    ctx.save();
    ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
    const metrics = ctx.measureText(text);
    const w = Math.min(W - 60, metrics.width + 46);
    const x = (W - w) / 2;
    const y = 22;

    ctx.fillStyle = 'rgba(8, 11, 15, 0.78)';
    roundRect(x, y, w, 40, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,195,74,0.55)';
    ctx.lineWidth = 1.5;
    roundRect(x, y, w, 40, 6);
    ctx.stroke();

    ctx.fillStyle = UI_COLORS.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, y + 21);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCrosshair(state) {
    const p = state.player;
    if (p.inVehicle || p.dead) return;
    const cx = W / 2;
    const cy = H / 2;
    const spread = 6 + (WEAPONS[p.weapon].spread * 260);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - spread - 6, cy); ctx.lineTo(cx - spread, cy);
    ctx.moveTo(cx + spread, cy); ctx.lineTo(cx + spread + 6, cy);
    ctx.moveTo(cx, cy - spread - 6); ctx.lineTo(cx, cy - spread);
    ctx.moveTo(cx, cy + spread); ctx.lineTo(cx, cy + spread + 6);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);

    if (state.hud.hitMarker > 0) {
      ctx.strokeStyle = `rgba(255,90,60,${state.hud.hitMarker * 4})`;
      ctx.lineWidth = 2.4;
      const s = 7;
      ctx.beginPath();
      ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx - s + 5, cy - s + 5);
      ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx + s - 5, cy - s + 5);
      ctx.moveTo(cx - s, cy + s); ctx.lineTo(cx - s + 5, cy + s - 5);
      ctx.moveTo(cx + s, cy + s); ctx.lineTo(cx + s - 5, cy + s - 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawToast(state) {
    if (state.hud.toastTimer <= 0) return;
    const alpha = Math.min(1, state.hud.toastTimer * 2);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(state.hud.toast, W / 2 + 2, H * 0.3 + 2);
    ctx.fillStyle = UI_COLORS.text;
    ctx.fillText(state.hud.toast, W / 2, H * 0.3);
    ctx.restore();
  }

  function drawDamageVignette(state) {
    const f = state.hud.damageFlash;
    if (f <= 0.01) return;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(180,20,20,0)');
    g.addColorStop(1, `rgba(170,20,20,${Math.min(0.72, f * 0.85)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawMissionBanner(state) {
    const m = state.mission;
    if (m.bannerTimer > 0) {
      const a = Math.min(1, m.bannerTimer);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8,12,16,0.8)';
      ctx.fillRect(0, H * 0.42 - 44, W, 88);
      ctx.fillStyle = UI_COLORS.accent;
      ctx.font = 'bold 52px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.bannerText, W / 2, H * 0.42);
      ctx.restore();
    }
    if (m.failTimer > 0) {
      const a = Math.min(1, m.failTimer);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(30,6,6,0.82)';
      ctx.fillRect(0, H * 0.42 - 50, W, 100);
      ctx.fillStyle = UI_COLORS.danger;
      ctx.font = 'bold 46px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('MISSION FAILED', W / 2, H * 0.42 - 8);
      ctx.font = 'bold 19px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = UI_COLORS.dim;
      ctx.fillText(m.failText + '  —  return to the marker to retry', W / 2, H * 0.42 + 30);
      ctx.restore();
    }
  }

  function draw(state) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (state.screen !== 'play') return;

    drawDamageVignette(state);
    drawMinimap(state);
    drawVitals(state);
    drawStars(state);
    drawWeapon(state);
    drawSpeedometer(state);
    drawObjective(state);
    drawCrosshair(state);
    drawToast(state);
    drawMissionBanner(state);

    if (state.player.dead) {
      ctx.save();
      ctx.fillStyle = `rgba(90,8,8,${Math.min(0.55, state.player.deadTimer * 0.35)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function clear() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
  }

  resize(window.innerWidth, window.innerHeight);
  buildCityMap();

  return { resize, draw, clear, ctx, get width() { return W; }, get height() { return H; } };
}
