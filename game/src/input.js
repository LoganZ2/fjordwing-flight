// FJORDWING — Responsive Keyboard + optional Mouse Yoke flight controls.

import { clamp, lerp } from './math.js';

export class FlightInput {
  constructor(targetElement) {
    this.keys = new Set();
    this.mouseYokeEnabled = false;
    this.mouseNormX = 0;
    this.mouseNormY = 0;
    this.smoothPitch = 0;
    this.smoothRoll = 0;
    this.smoothYaw = 0;
    this.pendingActions = [];
    this.onUserGesture = null;

    window.addEventListener('keydown', (e) => {
      if (this.onUserGesture) this.onUserGesture();
      const code = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
        e.preventDefault();
      }
      if (!e.repeat) {
        if (code === 'KeyV') this.pendingActions.push('flaps');
        else if (code === 'KeyG') this.pendingActions.push('gear');
        else if (code === 'KeyC') this.pendingActions.push('camera');
        else if (code === 'KeyP' || code === 'Escape') this.pendingActions.push('pause');
        else if (code === 'KeyR') this.pendingActions.push('restart');
        else if (code === 'KeyM') this.pendingActions.push('mute');
        else if (code === 'KeyY') {
          this.mouseYokeEnabled = !this.mouseYokeEnabled;
          this.pendingActions.push('yoke');
        } else if (code === 'Digit1') this.pendingActions.push('mission_1');
        else if (code === 'Digit2') this.pendingActions.push('mission_2');
        else if (code === 'Digit3') this.pendingActions.push('mission_3');
        else if (code === 'Digit4') this.pendingActions.push('mission_4');
      }
      this.keys.add(code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
    });

    targetElement.addEventListener('pointerdown', () => {
      if (this.onUserGesture) this.onUserGesture();
    });

    window.addEventListener('pointermove', (e) => {
      const w = window.innerWidth || 1280;
      const h = window.innerHeight || 720;
      this.mouseNormX = clamp((e.clientX / w) * 2 - 1, -1, 1);
      this.mouseNormY = clamp((e.clientY / h) * 2 - 1, -1, 1);
    });
  }

  toggleMouseYoke() {
    this.mouseYokeEnabled = !this.mouseYokeEnabled;
    return this.mouseYokeEnabled;
  }

  sample(dt) {
    const k = this.keys;
    let rawPitch = 0;
    let rawRoll = 0;
    let rawYaw = 0;

    // Aviation convention: S / ArrowDown pulls stick back (nose UP), W / ArrowUp pitches nose DOWN
    if (k.has('KeyS') || k.has('ArrowDown')) rawPitch += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) rawPitch -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) rawRoll += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) rawRoll -= 1;
    if (k.has('KeyE')) rawYaw += 1;
    if (k.has('KeyQ')) rawYaw -= 1;

    // Optional Mouse Yoke blends smoothly when keyboard stick isn't actively pressed
    if (this.mouseYokeEnabled && rawPitch === 0 && rawRoll === 0) {
      const deadzone = 0.08;
      const mx = Math.abs(this.mouseNormX) > deadzone ? (this.mouseNormX - Math.sign(this.mouseNormX) * deadzone) / (1 - deadzone) : 0;
      const my = Math.abs(this.mouseNormY) > deadzone ? (this.mouseNormY - Math.sign(this.mouseNormY) * deadzone) / (1 - deadzone) : 0;
      rawRoll = clamp(mx * 1.15, -1, 1);
      rawPitch = clamp(my * 1.1, -1, 1);
    }

    const blend = clamp(dt * 11.5, 0, 1);
    this.smoothPitch = lerp(this.smoothPitch, rawPitch, blend);
    this.smoothRoll = lerp(this.smoothRoll, rawRoll, blend);
    this.smoothYaw = lerp(this.smoothYaw, rawYaw, blend);

    let throttleDelta = 0;
    if (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Equal')) throttleDelta += 1;
    if (k.has('ControlLeft') || k.has('ControlRight') || k.has('Minus')) throttleDelta -= 1;

    const actions = this.pendingActions.splice(0, this.pendingActions.length);
    return {
      pitch: this.smoothPitch,
      roll: this.smoothRoll,
      yaw: this.smoothYaw,
      throttleDelta,
      afterburner: k.has('Space'),
      brake: k.has('KeyB'),
      toggleFlaps: actions.includes('flaps'),
      toggleGear: actions.includes('gear'),
      actions,
      mouseYokeEnabled: this.mouseYokeEnabled,
      mouseNormX: this.mouseNormX,
      mouseNormY: this.mouseNormY,
    };
  }
}
