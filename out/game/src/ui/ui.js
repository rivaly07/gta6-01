// DOM-based UI: title screen, pause menu, game over / wasted screen, save toasts.
// Kept in the DOM so text stays crisp and layout is trivial; the canvas HUD handles the in-game bits.

import { UI_COLORS, WEAPONS } from '../config.js';

export function createUI(root, handlers) {
  const layer = document.createElement('div');
  layer.id = 'ui-layer';
  root.appendChild(layer);

  const style = document.createElement('style');
  style.textContent = `
    #ui-layer { position: fixed; inset: 0; pointer-events: none; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color: ${UI_COLORS.text}; }
    #ui-layer .screen { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: auto; }
    #ui-layer .hidden { display: none !important; }
    #ui-layer .veil { background: radial-gradient(ellipse at 50% 45%, rgba(8,12,18,0.55) 0%, rgba(4,6,9,0.93) 70%); }
    #ui-layer h1 { margin: 0; font-size: clamp(38px, 7vw, 82px); letter-spacing: 0.14em; font-weight: 800; line-height: 1;
      background: linear-gradient(180deg, #fff 10%, #b9c6d4 55%, #6e7c8c 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
      text-shadow: 0 0 42px rgba(143,227,107,0.18); }
    #ui-layer .sub { margin-top: 10px; font-size: clamp(11px, 1.5vw, 15px); letter-spacing: 0.42em; text-transform: uppercase; color: ${UI_COLORS.accent}; }
    #ui-layer .tag { margin-top: 18px; max-width: 640px; text-align: center; font-size: 15px; line-height: 1.6; color: #b6c2d0; }
    #ui-layer .panel { margin-top: 30px; background: rgba(12,17,23,0.82); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; padding: 20px 26px; min-width: 320px; }
    #ui-layer .row { display: flex; justify-content: space-between; gap: 34px; font-size: 14px; padding: 5px 0; color: #c8d2de; }
    #ui-layer .row b { color: #fff; font-weight: 600; }
    #ui-layer kbd { display: inline-block; min-width: 20px; text-align: center; background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.16);
      border-bottom-width: 2px; border-radius: 4px; padding: 2px 6px; font: 600 12px ui-monospace, monospace; color: #e6edf5; }
    #ui-layer .cta { margin-top: 28px; font-size: 17px; font-weight: 700; letter-spacing: 0.16em; color: #fff; animation: pulse 1.7s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
    #ui-layer .btns { margin-top: 26px; display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
    #ui-layer button { pointer-events: auto; font: 600 14px "Segoe UI", system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase;
      background: rgba(255,255,255,0.06); color: #e9eff6; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; padding: 11px 22px; cursor: pointer;
      transition: background 0.15s, border-color 0.15s, transform 0.1s; }
    #ui-layer button:hover { background: rgba(143,227,107,0.16); border-color: rgba(143,227,107,0.55); }
    #ui-layer button:active { transform: translateY(1px); }
    #ui-layer button.primary { background: rgba(143,227,107,0.2); border-color: rgba(143,227,107,0.65); color: #f4fff0; }
    #ui-layer .big { font-size: clamp(40px, 6.4vw, 74px); font-weight: 800; letter-spacing: 0.1em; }
    #ui-layer .wasted { color: #d63c2c; text-shadow: 0 0 34px rgba(214,60,44,0.4); }
    #ui-layer .passed { color: ${UI_COLORS.accent}; text-shadow: 0 0 34px rgba(143,227,107,0.4); }
    #ui-layer .muted { color: #93a1b1; font-size: 14px; }
    #ui-layer .stats { margin-top: 18px; font-size: 15px; color: #cdd7e2; line-height: 1.9; text-align: center; }
    #ui-layer .corner { position: absolute; bottom: 14px; right: 18px; font-size: 11px; letter-spacing: 0.18em; color: rgba(255,255,255,0.3); text-transform: uppercase; }
  `;
  document.head.appendChild(style);

  // --- Title ---
  const title = el('div', 'screen veil');
  title.innerHTML = `
    <h1>REDLINE CITY</h1>
    <div class="sub">A procedurally generated crime sandbox</div>
    <div class="tag">Sixteen blocks of bad intentions. Take the jobs, take the money, and try not to
      collect five stars doing it.</div>
    <div class="panel">
      <div class="row"><span>Move</span><b><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></b></div>
      <div class="row"><span>Sprint / Jump</span><b><kbd>Shift</kbd> <kbd>Space</kbd></b></div>
      <div class="row"><span>Enter / exit vehicle</span><b><kbd>F</kbd></b></div>
      <div class="row"><span>Fire / aim</span><b><kbd>LMB</kbd> <kbd>RMB</kbd></b></div>
      <div class="row"><span>Reload / weapons</span><b><kbd>R</kbd> <kbd>1</kbd>–<kbd>4</kbd></b></div>
      <div class="row"><span>Pause</span><b><kbd>Esc</kbd></b></div>
    </div>
    <div class="btns">
      <button class="primary" data-act="start">Start</button>
      <button data-act="continue">Continue</button>
    </div>
    <div class="corner">click to lock the mouse</div>
  `;
  layer.appendChild(title);

  // --- Pause ---
  const pause = el('div', 'screen veil hidden');
  pause.innerHTML = `
    <div class="big">PAUSED</div>
    <div class="btns">
      <button class="primary" data-act="resume">Resume</button>
      <button data-act="save">Save</button>
      <button data-act="quit">Quit to title</button>
    </div>
    <div class="muted" style="margin-top:22px">Esc resumes · progress auto-saves every ${'25'}s</div>
  `;
  layer.appendChild(pause);

  // --- Game over ---
  const over = el('div', 'screen veil hidden');
  over.innerHTML = `
    <div class="big wasted">WASTED</div>
    <div class="stats" id="over-stats"></div>
    <div class="btns">
      <button class="primary" data-act="respawn">Respawn</button>
      <button data-act="quit">Quit to title</button>
    </div>
  `;
  layer.appendChild(over);

  // --- Mission complete overlay ---
  const complete = el('div', 'screen veil hidden');
  complete.innerHTML = `
    <div class="big passed">MISSION PASSED</div>
    <div class="stats" id="complete-stats"></div>
    <div class="cta">PRESS ENTER TO CONTINUE</div>
  `;
  layer.appendChild(complete);

  title.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      handlers.onButtonClick && handlers.onButtonClick();
      const act = b.dataset.act;
      if (act === 'start') handlers.onStart(false);
      else if (act === 'continue') handlers.onStart(true);
    });
  });

  pause.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      handlers.onButtonClick && handlers.onButtonClick();
      const act = b.dataset.act;
      if (act === 'resume') handlers.onResume();
      else if (act === 'save') handlers.onSave();
      else if (act === 'quit') handlers.onQuit();
    });
  });

  over.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      handlers.onButtonClick && handlers.onButtonClick();
      const act = b.dataset.act;
      if (act === 'respawn') handlers.onRespawn();
      else if (act === 'quit') handlers.onQuit();
    });
  });

  function el(tag, cls) {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
  }

  function show(name) {
    title.classList.toggle('hidden', name !== 'title');
    pause.classList.toggle('hidden', name !== 'pause');
    over.classList.toggle('hidden', name !== 'over');
    complete.classList.toggle('hidden', name !== 'complete');
    layer.style.pointerEvents = name === 'none' ? 'none' : 'auto';
    for (const s of [title, pause, over, complete]) s.style.pointerEvents = s.classList.contains('hidden') ? 'none' : 'auto';
  }

  function setOverStats(html) {
    const node = over.querySelector('#over-stats');
    if (node) node.innerHTML = html;
  }

  function setCompleteStats(html) {
    const node = complete.querySelector('#complete-stats');
    if (node) node.innerHTML = html;
  }

  function setContinueEnabled(enabled) {
    const btn = title.querySelector('[data-act="continue"]');
    if (btn) {
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? '1' : '0.4';
      btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
    }
  }

  show('title');

  return { show, setOverStats, setCompleteStats, setContinueEnabled, layer };
}
