// Input: keyboard + mouse, with a frame-scoped edge-triggered action set.
// Pointer lock is used for camera look while playing.

const held = new Set();
const pressed = new Set();
const released = new Set();

let mouseDX = 0;
let mouseDY = 0;
let mouseLeft = false;
let mouseRight = false;
let mouseLeftPressed = false;
let pointerLocked = false;
let canvasEl = null;

const listeners = [];

export function initInput(canvas) {
  canvasEl = canvas;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    held.add(e.code);
    pressed.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });

  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
    released.add(e.code);
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouseLeft = true; mouseLeftPressed = true; }
    if (e.button === 2) mouseRight = true;
    if (!pointerLocked && canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch { /* ignore */ }
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseLeft = false;
    if (e.button === 2) mouseRight = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (pointerLocked) {
      mouseDX += e.movementX || 0;
      mouseDY += e.movementY || 0;
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvasEl;
  });

  window.addEventListener('blur', () => {
    held.clear();
    mouseLeft = false;
    mouseRight = false;
  });

  // Register a callback for key edges (menus)
  window.addEventListener('keydown', (e) => {
    for (const fn of listeners) fn(e.code, e);
  });
}

export function onKey(fn) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function isHeld(code) { return held.has(code); }
export function anyHeld(codes) {
  for (const c of codes) if (held.has(c)) return true;
  return false;
}
export function wasPressed(code) { return pressed.has(code); }
export function anyPressed(codes) {
  for (const c of codes) if (pressed.has(c)) return true;
  return false;
}
export function wasReleased(code) { return released.has(code); }

export function mouse() {
  return { dx: mouseDX, dy: mouseDY, left: mouseLeft, right: mouseRight, leftPressed: mouseLeftPressed };
}

export function isPointerLocked() { return pointerLocked; }

export function requestLock() {
  if (canvasEl && canvasEl.requestPointerLock) {
    try { canvasEl.requestPointerLock(); } catch { /* ignore */ }
  }
}

export function releaseLock() {
  if (document.exitPointerLock) document.exitPointerLock();
}

/** Call once at the end of every frame. */
export function endFrameInput() {
  pressed.clear();
  released.clear();
  mouseDX = 0;
  mouseDY = 0;
  mouseLeftPressed = false;
}

export function clearHeld() {
  held.clear();
  mouseLeft = false;
  mouseRight = false;
}

export function movementAxis() {
  let f = 0;
  let r = 0;
  if (held.has('KeyW') || held.has('ArrowUp')) f += 1;
  if (held.has('KeyS') || held.has('ArrowDown')) f -= 1;
  if (held.has('KeyD') || held.has('ArrowRight')) r += 1;
  if (held.has('KeyA') || held.has('ArrowLeft')) r -= 1;
  const len = Math.hypot(f, r);
  if (len > 1) { f /= len; r /= len; }
  return { forward: f, right: r };
}
