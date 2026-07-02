// Keyboard + mouse input with per-frame edge detection.

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.pressedKeys = new Set(); // cleared each frame
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0 };
    this.buttons = new Set();
    this.pressedButtons = new Set();
    this.wheelDelta = 0;
    this.enabled = true; // false while a modal UI owns input

    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.pressedKeys.add(k);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "tab"].includes(k)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.buttons.clear();
    });

    window.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    domElement.addEventListener("mousedown", (e) => {
      this.buttons.add(e.button);
      this.pressedButtons.add(e.button);
    });
    window.addEventListener("mouseup", (e) => this.buttons.delete(e.button));
    domElement.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener(
      "wheel",
      (e) => {
        this.wheelDelta += Math.sign(e.deltaY);
      },
      { passive: true },
    );
  }

  down(key) {
    return this.enabled && this.keys.has(key);
  }

  pressed(key) {
    return this.enabled && this.pressedKeys.has(key);
  }

  // Modal UIs (menus, dialogue) still need to read key presses while gameplay input
  // is disabled, so these two skip the `enabled` gate.
  rawPressed(key) {
    return this.pressedKeys.has(key);
  }

  buttonDown(button) {
    return this.enabled && this.buttons.has(button);
  }

  buttonPressed(button) {
    return this.enabled && this.pressedButtons.has(button);
  }

  rawButtonPressed(button) {
    return this.pressedButtons.has(button);
  }

  consumeWheel() {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return this.enabled ? d : 0;
  }

  endFrame() {
    this.pressedKeys.clear();
    this.pressedButtons.clear();
  }
}
