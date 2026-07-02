import * as THREE from "three";
import { worldDirToSpriteKey } from "../core/utils.js";

// 2.5D deformed-doll rig, generalized from the original single-player lab code.
// Head + torso are thin textured boxes windowed from an 8-direction bust sheet;
// arms, legs and the held tool are 3D toon meshes. All tuned constants below are
// carried over from the tuned prototype.

const CHAR_CLEARANCE = 0.04;
const HIP_Y = 0.12;
const BODY_W = 0.5;
const BODY_H = 0.4;
const BODY_D = 0.08;
const BODY_CY = HIP_Y + BODY_H / 2;
const SHOULDER_Y = HIP_Y + BODY_H - 0.06;
const HEAD_W = 0.6;
const HEAD_H = 0.5;
const HEAD_D = 0.07;
const HEAD_CY = HIP_Y + BODY_H + HEAD_H / 2 - 0.08;
const ARM_X = BODY_W / 2 - 0.03;
const WALK_ANIM_SPEED = 11;

const HEAD_HALF_U = 0.34;
const BODY_HALF_U = 0.25;
const HEAD_V = { v0: 0.4, v1: 0.955 };
const BODY_V = { v0: 0.05, v1: 0.45 };
const ART_CENTER = 0.494;

export const FACING = {
  front: [0, 1],
  front_right: [0.707, 0.707],
  right: [1, 0],
  back_right: [0.707, -0.707],
  back: [0, -1],
  back_left: [-0.707, -0.707],
  left: [-1, 0],
  front_left: [-0.707, 0.707],
};

const LEG_SEP = 0.07;
const ARM_SEP = 0.14;
const LEG_LIFT = 0.08;
const ARM_REST_TILT = 0.34;
const LIMB_DEPTH_SCALE = 0.42;

const TOOL_GRIP_Y = -0.265;
const TOOL_MOUNT_Z = {
  front: 0.035, front_right: 0.035, right: 0.04, back_right: -0.035,
  back: -0.045, back_left: -0.055, left: 0.04, front_left: -0.04,
};
const TOOL_DIRECTION_ANGLE = {
  front: -Math.PI / 2,
  front_right: (-Math.PI * 3) / 4,
  right: Math.PI,
  back_right: (-Math.PI * 3) / 4,
  back: -Math.PI / 2,
  back_left: 0,
  left: 0,
  front_left: -Math.PI / 4,
};
const HAMMER_HEAD_STRIKE_LEAN = 1.0;
const HAMMER_HEAD_UP = new THREE.Vector3(0, 1, 0);

const DIRECTIONS = {
  front: { col: 0, row: 0 },
  front_left: { col: 1, row: 0 },
  left: { col: 2, row: 0 },
  back_left: { col: 3, row: 0 },
  back: { col: 0, row: 1 },
  back_right: { col: 1, row: 1 },
  right: { col: 2, row: 1 },
  front_right: { col: 3, row: 1 },
};

const OUTLINE_COLOR = 0x14110f;
const outlineMaterial = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
const hiddenFaceMaterial = new THREE.MeshBasicMaterial({ visible: false });

const textureLoader = new THREE.TextureLoader();
const sheetCache = new Map();

function loadSheet(url) {
  if (!sheetCache.has(url)) {
    const texture = textureLoader.load(url);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    sheetCache.set(url, texture);
  }
  return sheetCache.get(url);
}

function setCellWindow(texture, frame, u0, u1, v0, v1) {
  const cellW = 1 / 4;
  const cellH = 1 / 2;
  const cellBottomV = 1 - (frame.row + 1) * cellH;
  texture.repeat.set(cellW * (u1 - u0), cellH * (v1 - v0));
  texture.offset.set(frame.col * cellW + cellW * u0, cellBottomV + cellH * v0);
}

function addOutline(mesh, scale = 1.06, margin = 0) {
  const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
  const p = mesh.geometry.parameters;
  if (margin > 0 && p && p.width != null) {
    outline.scale.set(
      (p.width + 2 * margin) / p.width,
      (p.height + 2 * margin) / p.height,
      (p.depth + 2 * margin) / p.depth,
    );
  } else {
    outline.scale.multiplyScalar(scale);
  }
  outline.renderOrder = (mesh.renderOrder || 0) - 1;
  mesh.add(outline);
  return outline;
}

function makeFaceBox(geometry, frontTexture, backColor) {
  const frontMat = new THREE.MeshBasicMaterial({ map: frontTexture, transparent: true, alphaTest: 0.2 });
  const backMat = new THREE.MeshToonMaterial({ color: backColor });
  return new THREE.Mesh(geometry, [
    hiddenFaceMaterial, hiddenFaceMaterial, hiddenFaceMaterial, hiddenFaceMaterial, frontMat, backMat,
  ]);
}

// --- tool meshes (built along local -X, grip at origin) -------------------------

function toonMat(color) {
  return new THREE.MeshToonMaterial({ color });
}

// Each tool gets its own procedural model built from primitives, toon-shaded with
// black outlines so it matches the character art. Hammer heads keep their striking
// axis on local Y (userData.hammerHead) for the 8-direction strike orientation.
const TOOL_BUILDERS = {
  hammer_wood(group) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.033, 0.38, 8), toonMat(0x9c6b35));
    handle.rotation.z = Math.PI / 2;
    handle.position.x = -0.19;
    const gripWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.09, 8), toonMat(0x6d4522));
    gripWrap.rotation.z = Math.PI / 2;
    gripWrap.position.x = -0.05;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.26, 12), toonMat(0xc99c5f));
    head.position.x = -0.42;
    // Dark end rings so the mallet caps read clearly.
    for (const y of [-0.11, 0.11]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.084, 0.03, 12), toonMat(0x7c5730));
      ring.position.y = y;
      head.add(ring);
    }
    group.add(handle, gripWrap, head);
    addOutline(handle, 1.14);
    addOutline(head, 1.08);
    group.userData.hammerHead = head;
  },
  hammer_stone(group) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.4, 8), toonMat(0x6d4a26));
    handle.rotation.z = Math.PI / 2;
    handle.position.x = -0.2;
    // Straw rope lashing where the stone head is bound to the shaft.
    const lash1 = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.035, 8), toonMat(0xc2a557));
    lash1.rotation.z = Math.PI / 2;
    lash1.position.x = -0.33;
    // Angular chiselled stone head (striking faces on local +/-Y).
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.3, 0.13), toonMat(0x8b9196));
    head.position.x = -0.44;
    for (const y of [-0.13, 0.13]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.045, 0.145), toonMat(0x70767b));
      cap.position.y = y;
      head.add(cap);
    }
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.02), toonMat(0x9aa1a6));
    chip.position.set(0.045, 0.02, 0.066);
    head.add(chip);
    group.add(handle, lash1, head);
    addOutline(handle, 1.14);
    addOutline(head, 1.08);
    group.userData.hammerHead = head;
  },
  club(group) {
    // Fat knotted club with studs, thin grip and a pommel knob.
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.045, 0.42, 10), toonMat(0x8a5a2c));
    body.rotation.z = Math.PI / 2;
    body.position.x = -0.33;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 8), toonMat(0x6d4522));
    grip.rotation.z = Math.PI / 2;
    grip.position.x = -0.08;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), toonMat(0x5a3a1c));
    pommel.position.x = 0.01;
    for (const [angle, off] of [[0, -0.42], [2.1, -0.36], [4.2, -0.46]]) {
      const stud = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 6), toonMat(0x5a3a1c));
      stud.position.set(off, Math.cos(angle) * 0.085, Math.sin(angle) * 0.085);
      stud.rotation.x = angle + Math.PI / 2;
      group.add(stud);
    }
    group.add(body, grip, pommel);
    addOutline(body, 1.1);
    addOutline(grip, 1.14);
    addOutline(pommel, 1.12);
  },
  sword_stone(group) {
    // Rough-hewn stone blade: chunky, layered, with a leather-wrapped grip.
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.045), toonMat(0xa8b0b5));
    blade.position.x = -0.31;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.045, 0.055), toonMat(0x8b9196));
    ridge.position.x = -0.28;
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.05), toonMat(0x70767b));
    notch.position.set(-0.36, 0.045, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.14, 4), toonMat(0xa8b0b5));
    tip.rotation.z = Math.PI / 2;
    tip.rotation.y = Math.PI / 4;
    tip.position.x = -0.55;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.2, 0.07), toonMat(0x6d4a26));
    guard.position.x = -0.12;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.13, 8), toonMat(0x40301d));
    grip.rotation.z = Math.PI / 2;
    grip.position.x = -0.05;
    for (const x of [-0.08, -0.045, -0.01]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.02, 8), toonMat(0x2c2014));
      band.rotation.z = Math.PI / 2;
      band.position.x = x;
      group.add(band);
    }
    group.add(blade, ridge, notch, tip, guard, grip);
    addOutline(blade, 1.1);
    addOutline(tip, 1.1);
    addOutline(guard, 1.12);
  },
  sword_copper(group) {
    // Broad copper blade with bright edges, winged gold guard and red-wrapped grip.
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.03), toonMat(0xc97b3f));
    blade.position.x = -0.34;
    for (const y of [-0.055, 0.055]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.022, 0.034), toonMat(0xe8a86a));
      edge.position.set(-0.34, y, 0);
      group.add(edge);
    }
    const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.026, 0.034), toonMat(0x9c5a2c));
    fuller.position.x = -0.31;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.16, 4), toonMat(0xd08a4a));
    tip.rotation.z = Math.PI / 2;
    tip.rotation.y = Math.PI / 4;
    tip.position.x = -0.61;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.08), toonMat(0xd9b545));
    guard.position.x = -0.13;
    for (const y of [-0.12, 0.12]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), toonMat(0xd9b545));
      wing.position.set(-0.13, y, 0);
      group.add(wing);
    }
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.14, 8), toonMat(0xa03024));
    grip.rotation.z = Math.PI / 2;
    grip.position.x = -0.05;
    for (const x of [-0.085, -0.05, -0.015]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.02, 8), toonMat(0x701c14));
      band.rotation.z = Math.PI / 2;
      band.position.x = x;
      group.add(band);
    }
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), toonMat(0xd9b545));
    pommel.position.x = 0.02;
    group.add(blade, fuller, tip, guard, grip, pommel);
    addOutline(blade, 1.08);
    addOutline(tip, 1.1);
    addOutline(guard, 1.12);
    addOutline(pommel, 1.12);
  },
};

export function createToolMesh(kind) {
  const group = new THREE.Group();
  TOOL_BUILDERS[kind]?.(group);
  return group;
}

// --- humanoid rig ---------------------------------------------------------------

const UNDERWATER_COLOR = new THREE.Color(0x2a6fb0);

// Gather every tintable material under a node (skipping shared outline/hidden
// materials) with its base color, for the underwater submersion tint.
function collectTintTargets(node) {
  const out = [];
  node.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m === outlineMaterial || m === hiddenFaceMaterial || !m.color) continue;
      out.push({ m, base: m.color.clone() });
    }
  });
  return out;
}

function applyTint(targets, frac) {
  for (const t of targets) {
    t.m.color.copy(t.base).lerp(UNDERWATER_COLOR, frac * 0.62).multiplyScalar(1 - frac * 0.22);
  }
}

const tmpMount = new THREE.Vector3();
const tmpSwingAxis = new THREE.Vector3();
const tmpHandleDir = new THREE.Vector3();
const tmpStrikeDir = new THREE.Vector3();
const tmpAxis = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpQuat2 = new THREE.Quaternion();

export class HumanoidRig {
  constructor({ sheetUrl, colors, scale = 1 }) {
    this.colors = colors;
    this.scale = scale;
    const shared = loadSheet(sheetUrl);
    this.headTexture = shared.clone();
    this.headTexture.needsUpdate = true;
    this.bodyTexture = shared.clone();
    this.bodyTexture.needsUpdate = true;

    this.group = new THREE.Group(); // rotated to camera yaw by the owner
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.inner.scale.setScalar(scale);

    this.head = this.createHead();
    this.body = this.createBody();
    this.leftArm = this.createArm(-1);
    this.rightArm = this.createArm(1);
    this.leftLeg = this.createLeg(-1);
    this.rightLeg = this.createLeg(1);
    this.inner.add(this.head, this.body, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);

    this.tool = null;
    this.toolKind = null;
    this.direction = "front";
    this.walkTime = 0;
    this.animTime = Math.random() * 10;
    this.attackT = 0; // 0 = idle, counts down from 1 while swinging

    // Collect this rig's own tintable materials (sprite fronts + limbs) with their
    // base colors, so we can shift them toward an underwater blue when submerged.
    this._tint = collectTintTargets(this.inner);
    this._toolTint = []; // rebuilt whenever the held tool changes
    this._submersion = 0;

    this.setDirection("front");
  }

  // frac 0 = dry, 1 = fully underwater. Shifts the character toward a dim blue so a
  // submerged hero reads as being IN the water (not floating on the surface).
  setSubmersion(frac) {
    frac = Math.max(0, Math.min(1, frac));
    if (Math.abs(frac - this._submersion) < 0.01) return;
    this._submersion = frac;
    applyTint(this._tint, frac);
    applyTint(this._toolTint, frac);
  }

  createHead() {
    const group = new THREE.Group();
    group.position.y = HEAD_CY;
    const box = makeFaceBox(new THREE.BoxGeometry(HEAD_W, HEAD_H, HEAD_D), this.headTexture, this.colors.headBack);
    box.renderOrder = 14;
    group.add(box);
    return group;
  }

  createBody() {
    const group = new THREE.Group();
    group.position.y = BODY_CY;
    const box = makeFaceBox(new THREE.BoxGeometry(BODY_W, BODY_H, BODY_D), this.bodyTexture, this.colors.bodyBack);
    box.renderOrder = 12;
    group.add(box);
    return group;
  }

  createArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * ARM_X, SHOULDER_Y, 0);
    const limb = new THREE.Group();
    limb.rotation.z = side * ARM_REST_TILT;
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.1, 4, 8), toonMat(this.colors.sleeve));
    upper.position.y = -0.12;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), toonMat(this.colors.hand));
    hand.position.y = -0.26;
    const toolMount = new THREE.Group();
    limb.add(upper, hand);
    pivot.add(limb, toolMount);
    pivot.userData.tiltGroup = limb;
    pivot.userData.toolMount = toolMount;
    addOutline(upper, 1.14);
    addOutline(hand, 1.1);
    return pivot;
  }

  createLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, HIP_Y, 0);
    const legRadius = 0.05;
    const reach = HIP_Y + LEG_LIFT + CHAR_CLEARANCE;
    const bootH = 0.05;
    const thighLen = Math.max(0.05, reach - bootH - legRadius * 2);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(legRadius, thighLen, 4, 8), toonMat(this.colors.pants));
    thigh.position.y = -(reach - bootH) / 2;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, bootH, 0.16), toonMat(this.colors.boot));
    boot.position.set(0, -reach + bootH / 2, 0.03);
    pivot.add(thigh, boot);
    addOutline(thigh, 1.1);
    addOutline(boot, 1.08, 0.008);
    return pivot;
  }

  setTool(kind) {
    if (this.toolKind === kind) return;
    if (this.tool) {
      this.inner.remove(this.tool);
      this.tool = null;
      this._toolTint = [];
    }
    this.toolKind = kind;
    if (kind) {
      this.tool = createToolMesh(kind);
      this.inner.add(this.tool);
      this._toolTint = collectTintTargets(this.tool);
      if (this._submersion > 0) applyTint(this._toolTint, this._submersion);
      this.updateToolMount();
      this.updateToolAttachment();
    }
  }

  setDirection(direction) {
    this.direction = direction;
    const frame = DIRECTIONS[direction];
    setCellWindow(this.headTexture, frame, ART_CENTER - HEAD_HALF_U, ART_CENTER + HEAD_HALF_U, HEAD_V.v0, HEAD_V.v1);
    setCellWindow(this.bodyTexture, frame, ART_CENTER - BODY_HALF_U, ART_CENTER + BODY_HALF_U, BODY_V.v0, BODY_V.v1);
    this.setLimbLayout(direction);
    this.updateToolMount();
  }

  // Choose the sprite direction from a world-space facing vector + camera yaw.
  faceWorld(wx, wz, cameraYaw) {
    const key = worldDirToSpriteKey(wx, wz, cameraYaw);
    if (key !== this.direction) this.setDirection(key);
  }

  setLimbLayout(direction) {
    const [fx, fz] = FACING[direction];
    const sx = fz;
    const sz = -fx * LIMB_DEPTH_SCALE;
    this.leftLeg.position.set(-sx * LEG_SEP, HIP_Y + LEG_LIFT, -sz * LEG_SEP);
    this.rightLeg.position.set(sx * LEG_SEP, HIP_Y + LEG_LIFT, sz * LEG_SEP);
    this.leftArm.position.set(-sx * ARM_SEP, SHOULDER_Y, -sz * ARM_SEP);
    this.rightArm.position.set(sx * ARM_SEP, SHOULDER_Y, sz * ARM_SEP);
    const screenSide = Math.sign(sx);
    this.leftArm.userData.tiltGroup.rotation.z = -screenSide * ARM_REST_TILT;
    this.rightArm.userData.tiltGroup.rotation.z = screenSide * ARM_REST_TILT;
  }

  updateToolMount() {
    const mount = this.leftArm.userData.toolMount;
    const armTilt = this.leftArm.userData.tiltGroup.rotation.z;
    mount.position.set(
      -TOOL_GRIP_Y * Math.sin(armTilt),
      TOOL_GRIP_Y * Math.cos(armTilt),
      TOOL_MOUNT_Z[this.direction],
    );
  }

  startAttack() {
    this.attackT = 1;
  }

  get attacking() {
    return this.attackT > 0;
  }

  updateToolAttachment(swingAngle = 0) {
    if (!this.tool) return;
    this.leftArm.userData.toolMount.getWorldPosition(tmpMount);
    this.inner.worldToLocal(tmpMount);
    this.tool.position.copy(tmpMount);
    const theta = TOOL_DIRECTION_ANGLE[this.direction];
    this.tool.rotation.set(0.08, 0, theta);
    if (swingAngle !== 0) {
      const [fx, fz] = FACING[this.direction];
      tmpSwingAxis.set(-fz, 0, fx).normalize();
      tmpQuat.setFromAxisAngle(tmpSwingAxis, swingAngle);
      this.tool.quaternion.premultiply(tmpQuat);
    }
    // Hammer heads strike cap-first along the travel direction (see prototype notes).
    const head = this.tool.userData.hammerHead;
    if (head) {
      tmpHandleDir.set(-Math.cos(theta), -Math.sin(theta), 0);
      const [fx, fz] = FACING[this.direction];
      tmpStrikeDir.set(fx * HAMMER_HEAD_STRIKE_LEAN, -1, fz * HAMMER_HEAD_STRIKE_LEAN);
      tmpStrikeDir.addScaledVector(tmpHandleDir, -tmpStrikeDir.dot(tmpHandleDir));
      tmpAxis.copy(tmpStrikeDir).normalize();
      tmpQuat2.setFromUnitVectors(HAMMER_HEAD_UP, tmpAxis);
      head.quaternion.copy(this.tool.quaternion).invert().multiply(tmpQuat2);
    }
  }

  update(dt, walking) {
    this.walkTime = walking ? this.walkTime + dt : 0;
    this.animTime += dt;
    if (this.attackT > 0) this.attackT = Math.max(0, this.attackT - dt / 0.32);

    const phase = Math.sin(this.walkTime * WALK_ANIM_SPEED);
    const idle = Math.sin(this.animTime * 2.2);
    const [fx, fz] = FACING[this.direction];
    tmpSwingAxis.set(-fz, 0, fx).normalize();

    const legSwing = walking ? phase * 0.55 : 0;
    let armSwing = walking ? phase * 0.5 : idle * 0.05;
    // Attack: quick forward chop on the tool arm, overriding its walk swing.
    const chop = this.attackT > 0 ? Math.sin((1 - this.attackT) * Math.PI) * 1.45 : 0;
    this.leftLeg.quaternion.setFromAxisAngle(tmpSwingAxis, legSwing);
    this.rightLeg.quaternion.setFromAxisAngle(tmpSwingAxis, -legSwing);
    this.leftArm.quaternion.setFromAxisAngle(tmpSwingAxis, this.attackT > 0 ? chop : -armSwing);
    this.rightArm.quaternion.setFromAxisAngle(tmpSwingAxis, armSwing);

    const bob = walking ? Math.abs(phase) * 0.045 : (idle + 1) * 0.5 * 0.018;
    const headBob = bob + (walking ? Math.abs(phase) * 0.02 : idle * 0.008);
    this.body.position.y = BODY_CY + bob;
    this.head.position.y = HEAD_CY + headBob;
    this.leftArm.position.y = SHOULDER_Y + bob;
    this.rightArm.position.y = SHOULDER_Y + bob;
    this.updateToolAttachment(this.attackT > 0 ? chop * 0.9 : 0);
  }
}

// --- monster billboard sprite -----------------------------------------------------

export class MonsterSprite {
  constructor({ sheetAUrl, sheetBUrl, scale = 1, tint = 0xffffff, yOffset = 0 }) {
    this.texA = loadSheet(sheetAUrl).clone();
    this.texA.needsUpdate = true;
    this.texB = loadSheet(sheetBUrl).clone();
    this.texB.needsUpdate = true;
    this.material = new THREE.MeshBasicMaterial({
      map: this.texA,
      transparent: true,
      alphaTest: 0.15,
      color: tint,
    });
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.position.y = 0.5 * scale + yOffset;
    this.mesh.scale.setScalar(scale);
    this.group.add(this.mesh);
    this.direction = "front";
    this.flipTimer = 0;
    this.usingA = true;
    this.applyWindow();
  }

  applyWindow() {
    const frame = DIRECTIONS[this.direction];
    for (const tex of [this.texA, this.texB]) {
      setCellWindow(tex, frame, 0.02, 0.98, 0.02, 0.98);
    }
  }

  faceWorld(wx, wz, cameraYaw) {
    const key = worldDirToSpriteKey(wx, wz, cameraYaw);
    if (key !== this.direction) {
      this.direction = key;
      this.applyWindow();
    }
  }

  flash(color) {
    this.material.color.setHex(color);
  }

  update(dt, interval = 0.38) {
    this.flipTimer += dt;
    if (this.flipTimer >= interval) {
      this.flipTimer = 0;
      this.usingA = !this.usingA;
      this.material.map = this.usingA ? this.texA : this.texB;
    }
  }
}
