// Voidgarden — keyboard and mouse state.
// One job: remember what is held down, what was just pressed, and where the
// pointer is, in screen pixels. The simulation converts pointer pixels to
// world coordinates; this file never knows the world exists.

export class Input {
  constructor() {
    this.down = new Set(); // codes held right now
    this.pressed = new Set(); // codes pressed since last consume()
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mousePressed = false; // left button pressed since last consume()
    this.rightPressed = false;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => { this.down.delete(e.code); };
    this._onBlur = () => { this.down.clear(); this.mouseDown = false; };
    this._onMouseMove = (e) => { this.mouseX = e.clientX; this.mouseY = e.clientY; };
    this._onMouseDown = (e) => {
      if (e.button === 0) { this.mouseDown = true; this.mousePressed = true; }
      if (e.button === 2) { this.rightPressed = true; }
    };
    this._onMouseUp = (e) => { if (e.button === 0) this.mouseDown = false; };
    this._onContextMenu = (e) => { e.preventDefault(); };
  }

  attach(target) {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    target.addEventListener('mousemove', this._onMouseMove);
    target.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    target.addEventListener('contextmenu', this._onContextMenu);
  }

  // Edge-triggered queries; call once per fixed step, then consume().
  wasPressed(code) {
    return this.pressed.has(code);
  }

  wasClicked() {
    return this.mousePressed;
  }

  wasRightClicked() {
    return this.rightPressed;
  }

  // Movement axis from WASD or arrows, normalized.
  moveAxis() {
    let x = 0;
    let y = 0;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) x -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) x += 1;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) y -= 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  firing() {
    return this.mouseDown || this.down.has('Space');
  }

  // Clear all edge-triggered flags. Called at the end of each fixed step.
  consume() {
    this.pressed.clear();
    this.mousePressed = false;
    this.rightPressed = false;
  }
}
