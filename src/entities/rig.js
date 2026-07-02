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

export function createToolMesh(kind) {
  const group = new THREE.Group();
  if (kind === "hammer_wood" || kind === "hammer_stone") {
    const steel = kind === "hammer_stone" ? 0x8b9196 : 0xaeb6bb;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.055, 0.055), toonMat(0xaa0000));
    handle.position.x = -0.18;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.25, 16), toonMat(steel));
    head.position.x = -0.36 - 0.075 + 0.015;
    group.add(handle, head);
    addOutline(handle, 1.12);
    addOutline(head, 1.08);
    group.userData.hammerHead = head;
  } else if (kind === "club") {
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.5, 10), toonMat(0x8a5a2c));
    club.rotation.z = Math.PI / 2;
    club.position.x = -0.25;
    group.add(club);
    addOutline(club, 1.1);
  } else if (kind === "sword_stone" || kind === "sword_copper") {
    const bladeColor = kind === "sword_copper" ? 0xd08a4a : 0xb9c0c6;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.03), toonMat(bladeColor));
    blade.position.x = -0.3;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.12, 4), toonMat(bladeColor));
    tip.rotation.z = Math.PI / 2;
    tip.rotation.y = Math.PI / 4;
    tip.position.x = -0.56;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.06), toonMat(0x8a6a2a));
    guard.position.x = -0.1;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), toonMat(0x5f3d1c));
    grip.position.x = -0.03;
    group.add(blade, tip, guard, grip);
    addOutline(blade, 1.1);
    addOutline(guard, 1.12);
  }
  return group;
}

// --- humanoid rig ---------------------------------------------------------------

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
    this.setDirection("front");
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
    }
    this.toolKind = kind;
    if (kind) {
      this.tool = createToolMesh(kind);
      this.inner.add(this.tool);
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
