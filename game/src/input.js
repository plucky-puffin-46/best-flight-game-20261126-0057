// Keyboard and mouse for the rally. The stick is the arrow keys (or the
// mouse, when mouse-steer is on: push the pointer up to climb, down to dive,
// sideways to bank). W and S work the throttle, Q and E trim a little yaw
// through the roll, C changes the camera, P pauses, and Enter starts or
// restarts. Everything is read as held state plus one-shot actions, so the
// flight loop polls numbers, never events.

export const ACTION_START = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;
export const ACTION_RESET = 8;

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'KeyP', 'KeyM', 'KeyR', 'Enter',
]);

/**
 * Attaches listeners to the window and returns the input's live state:
 * { pitch, roll, throttleDelta, mouseSteer, takeActions() }.
 * pitch is -1..1 with positive meaning climb; roll positive banks right.
 */
export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseSteer = false;
  let mouseX = 0;
  let mouseY = 0;

  window.addEventListener('keydown', (event) => {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_START;
    if (event.code === 'KeyP') actions |= ACTION_PAUSE;
    if (event.code === 'KeyC') actions |= ACTION_CAMERA;
    if (event.code === 'KeyR') actions |= ACTION_RESET;
    if (event.code === 'KeyM') mouseSteer = !mouseSteer;
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => held.clear());
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  });
  canvas.addEventListener('mousedown', () => {
    actions |= ACTION_START;
  });

  return {
    /** Stick pitch: -1 (dive) .. 1 (climb), keys first, then the mouse. */
    get pitch() {
      let v = 0;
      if (held.has('ArrowUp')) v += 1;
      if (held.has('ArrowDown')) v -= 1;
      if (v === 0 && mouseSteer) v = -mouseY * 0.9;
      return Math.max(-1, Math.min(1, v));
    },
    /** Stick roll: -1 (bank left) .. 1 (bank right). */
    get roll() {
      let v = 0;
      if (held.has('ArrowLeft') || held.has('KeyA')) v -= 1;
      if (held.has('ArrowRight') || held.has('KeyD')) v += 1;
      if (held.has('KeyQ')) v -= 0.45;
      if (held.has('KeyE')) v += 0.45;
      if (v === 0 && mouseSteer) v = mouseX * 0.9;
      return Math.max(-1, Math.min(1, v));
    },
    /** Throttle lever movement a second: W opens it, S closes it. */
    get throttleDelta() {
      let v = 0;
      if (held.has('KeyW')) v += 1;
      if (held.has('KeyS')) v -= 1;
      return v;
    },
    get mouseSteer() {
      return mouseSteer;
    },
    /** Returns and clears the one-shot actions since the last call. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
