import * as THREE from "three";

const MAP_SIZE = 16;
const TILE_SIZE = 1;
const MOVE_DURATION = 0.22;
const WALK_ANIM_SPEED = 11;
const CAMERA_ROTATE_STEP = Math.PI / 4;

// --- 2.5D deformed character layout ------------------------------------------
// All parts live in playerBillboard local space. y = 0 sits CHAR_CLEARANCE above
// the terrain top, and the boots are built to reach back down to the ground.
const CHAR_CLEARANCE = 0.04; // boots-to-ground gap so feet read as planted
const HIP_Y = 0.12; // hip / leg-attach height; legs are short stubs down to the ground
const BODY_W = 0.46;
const BODY_H = 0.42;
const BODY_D = 0.08;
const BODY_CY = HIP_Y + BODY_H / 2;
const SHOULDER_Y = HIP_Y + BODY_H - 0.06;
const HEAD_W = 0.56;
const HEAD_H = 0.5;
const HEAD_D = 0.07;
const HEAD_CY = HIP_Y + BODY_H + HEAD_H / 2 - 0.08; // slight overlap with the body box
const ARM_X = BODY_W / 2 - 0.03; // shoulder pivot tucked inside the torso edge

// Camera is a fixed quarter view, so the character faces a fixed yaw toward it
// (instead of full billboarding). That keeps the thin boxes from looking like
// flat paper: we see their front + a sliver of side/top.
const CAMERA_HEIGHT = 7.0;
const CAMERA_RADIUS = Math.hypot(6.5, 8.0);
const INITIAL_CAMERA_YAW = Math.atan2(6.5, 8.0);
// Camera follow as a time-based exponential decay (per second) instead of a fixed
// per-frame lerp factor, so the smoothing is frame-rate independent. ~7.7 matches
// the previous feel of `lerp(..., 0.12)` at 60fps: 1 - exp(-7.7/60) ≈ 0.12.
const CAMERA_FOLLOW_RATE = 7.7;
const swingAxis = new THREE.Vector3(); // reused: per-direction limb swing axis

// Front-face texture windows. The sprite art is NOT centered in each cell and its
// horizontal center shifts per direction, so the center (cx, measured from the
// sprite's alpha) is stored per direction and the window is centered on it; a
// fixed window would push the head/body off to one side. The head band runs from
// the neck to the exact cap top so the box top aligns with the hat; the body band
// runs from the shoulders down to the hips (the sheet has no arms, so the full
// torso width can be shown).
const HEAD_HALF_U = 0.24; // half-width of the head window (cell fraction)
const BODY_HALF_U = 0.19; // half-width of the torso window
const HEAD_V = { v0: 0.575, v1: 0.93 };
const BODY_V = { v0: 0.3, v1: 0.58 };
const ART_CENTERS = {
  front: { h: 0.6, b: 0.607 },
  front_right: { h: 0.35, b: 0.375 },
  right: { h: 0.445, b: 0.468 },
  back_right: { h: 0.517, b: 0.517 },
  back: { h: 0.609, b: 0.607 },
  back_left: { h: 0.383, b: 0.389 },
  left: { h: 0.509, b: 0.486 },
  front_left: { h: 0.563, b: 0.542 },
};

// Facing vector per direction in billboard-local ground plane (x = screen right,
// z = toward viewer). Drives 8-direction arm/leg placement.
const FACING = {
  front: [0, 1],
  front_right: [0.707, 0.707],
  right: [1, 0],
  back_right: [0.707, -0.707],
  back: [0, -1],
  back_left: [-0.707, -0.707],
  left: [-1, 0],
  front_left: [-0.707, 0.707],
};
const LEG_SEP = 0.07; // narrow: legs tuck partly into the torso bottom
const ARM_SEP = 0.14;
const LEG_LIFT = 0.08; // raise leg attach so the tops embed into the body
const ARM_REST_TILT = 0.34; // rad (~19deg): arms angle outward from the shoulder
const LIMB_DEPTH_SCALE = 0.42; // compress front-back separation (the character is thin)

// Palette pulled from the sprite so the 3D parts / box sides don't clash.
const COLORS = {
  capBlue: 0x3358a6,
  capBlueDark: 0x223f74,
  jacketBlue: 0x2f63a8,
  jacketBlueDark: 0x21477c,
  glove: 0x7b4a22,
  pants: 0xd8c79c,
  boot: 0x6b3f1d,
  back: 0x394a63,
  outline: 0x14110f,
};

// Torso-only sheet (head + body down to the hips, no arms, no legs). Generated
// from assets/player_image.png by tmp/keygreen.mjs (chroma-green -> alpha).
const bodySheetUrl = new URL("../assets/player_body_8dir.png", import.meta.url).href;

const DIRECTIONS = {
  front: { col: 0, row: 0 },
  front_right: { col: 3, row: 1 },
  right: { col: 2, row: 1 },
  back_right: { col: 1, row: 1 },
  back: { col: 0, row: 1 },
  back_left: { col: 3, row: 0 },
  left: { col: 2, row: 0 },
  front_left: { col: 1, row: 0 },
};

const INPUT_TO_DIRECTION = new Map([
  ["0,1", "front"],
  ["1,1", "front_right"],
  ["1,0", "right"],
  ["1,-1", "back_right"],
  ["0,-1", "back"],
  ["-1,-1", "back_left"],
  ["-1,0", "left"],
  ["-1,1", "front_left"],
]);

const terrainHeights = [
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 0, 0],
  [0, 1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 2, 1, 1, 1, 0],
  [0, 1, 1, 1, 2, 2, 2, 2, 1, 1, 2, 3, 2, 1, 1, 0],
  [1, 1, 1, 2, 2, 3, 3, 2, 2, 1, 2, 3, 2, 2, 1, 1],
  [1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 2, 2, 2, 1, 1, 1],
  [1, 1, 2, 3, 3, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1],
  [1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 2, 1, 1, 2, 2, 3, 2, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 1, 1, 0],
  [0, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 2, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
];

const debugGrid = document.querySelector("#debug-grid");
const debugDirection = document.querySelector("#debug-direction");
const debugState = document.querySelector("#debug-state");

const app = document.querySelector("#app");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb5c9);
scene.fog = new THREE.Fog(0x8fb5c9, 16, 28);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const ambientLight = new THREE.HemisphereLight(0xffffff, 0x63724f, 2.4);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
sunLight.position.set(5, 8, 4);
scene.add(sunLight);

const blockGeometry = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, TILE_SIZE);
const materials = {
  grass: new THREE.MeshLambertMaterial({ color: 0x66a944 }),
  dirt: new THREE.MeshLambertMaterial({ color: 0x8b5f35 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x7b8489 }),
};

const terrainGroup = new THREE.Group();
scene.add(terrainGroup);

for (let z = 0; z < MAP_SIZE; z += 1) {
  for (let x = 0; x < MAP_SIZE; x += 1) {
    const height = getHeight(x, z);
    for (let y = 0; y < height; y += 1) {
      const isTop = y === height - 1;
      const material = height >= 3 && isTop ? materials.stone : isTop ? materials.grass : materials.dirt;
      const block = new THREE.Mesh(blockGeometry, material);
      block.position.set(gridToWorld(x), y + 0.5, gridToWorld(z));
      terrainGroup.add(block);
    }
  }
}

// Two independent samplers of the same sheet: one windowed to the head, one to
// the torso. Cloning keeps the image shared but gives each its own UV transform.
const textureLoader = new THREE.TextureLoader();
const headTexture = loadPixelTexture(bodySheetUrl);
const bodyTexture = headTexture.clone();
bodyTexture.needsUpdate = true;

const outlineMaterial = new THREE.MeshBasicMaterial({ color: COLORS.outline, side: THREE.BackSide });
// Top/bottom faces of the textured boxes are hidden: the sprite art is rounded, so
// a full-width horizontal cap face pokes out above it as a stray bar. Thickness
// comes from the vertical side faces, which is what reads at this quarter angle.
const hiddenFaceMaterial = new THREE.MeshBasicMaterial({ visible: false });

const playerRoot = new THREE.Group();
scene.add(playerRoot);

const playerBillboard = new THREE.Group();
playerRoot.add(playerBillboard);

const character = createHybridPlayer();
playerBillboard.add(character.group);

const shadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
});
const playerShadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), shadowMaterial);
playerShadow.rotation.x = -Math.PI / 2;
playerShadow.scale.set(1.25, 1, 0.82); // horizontal ellipse
scene.add(playerShadow);

const keys = new Set();
const player = {
  grid: { x: 7, z: 8 },
  direction: "front",
  state: "idle",
  moving: false,
  moveStart: new THREE.Vector3(),
  moveEnd: new THREE.Vector3(),
  moveElapsed: 0,
  // Normalized segment-progress velocities (0 = start/stop at rest, 1 = cruise) at
  // the two ends of the current tile segment. They let consecutive tiles join with
  // matching velocity so continuous walking cruises at constant speed instead of
  // re-easing (stop-start) at every grid boundary.
  segEntryVel: 0,
  segExitVel: 0,
  walkTime: 0,
  animTime: 0,
};
const cameraOrbit = {
  yaw: INITIAL_CAMERA_YAW,
};

setHybridDirection(player.direction);
snapPlayerToGrid();
updateCamera(true);
updateCharacterFacing();
updatePlayerAnimation();
updateDebug();

window.addEventListener("keydown", (event) => {
  const cameraRotateDirection = getCameraRotateDirection(event);
  if (isMovementKey(event.key)) {
    event.preventDefault();
    keys.add(normalizeKey(event.key));
  } else if (cameraRotateDirection !== 0) {
    event.preventDefault();
    rotateCamera(cameraRotateDirection);
  }
});

window.addEventListener("keyup", (event) => {
  if (isMovementKey(event.key)) {
    event.preventDefault();
    keys.delete(normalizeKey(event.key));
  }
});

renderer.domElement.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function frame(delta) {
  if (player.moving) {
    updateMovement(delta);
  } else {
    tryStartMove();
  }

  player.walkTime += player.state === "walking" ? delta : -player.walkTime;
  player.animTime += delta;
  updatePlayerAnimation();
  updateCamera(false, delta);
  updateCharacterFacing();
  updateDebug();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(() => frame(clock.getDelta()));

function loadPixelTexture(url) {
  const texture = textureLoader.load(url);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// --- character assembly -------------------------------------------------------

function createHybridPlayer() {
  const group = new THREE.Group();
  const head = createHeadPart();
  const body = createBodyPart();
  const leftArm = createArmPart(-1);
  const rightArm = createArmPart(1);
  const leftLeg = createLegPart(-1);
  const rightLeg = createLegPart(1);
  group.add(head.group, body.group, leftArm, rightArm, leftLeg, rightLeg);
  return { group, head, body, leftArm, rightArm, leftLeg, rightLeg };
}

// Box ordered: +X, -X, +Y, -Y, +Z(front), -Z(back). The front face carries the
// windowed sprite texture; the other faces are flat color so the part reads as a
// thin solid instead of a single plane.
function makeFaceBox(geometry, frontTexture, sideColor, backColor) {
  const frontMat = new THREE.MeshBasicMaterial({
    map: frontTexture,
    transparent: true,
    alphaTest: 0.2,
  });
  const sideMat = new THREE.MeshToonMaterial({ color: sideColor });
  const backMat = new THREE.MeshToonMaterial({ color: backColor });
  // order: +X, -X, +Y(hidden), -Y(hidden), +Z(front), -Z(back)
  const box = new THREE.Mesh(geometry, [sideMat, sideMat, hiddenFaceMaterial, hiddenFaceMaterial, frontMat, backMat]);
  return box;
}

function createHeadPart() {
  const group = new THREE.Group();
  group.position.y = HEAD_CY;
  const box = makeFaceBox(
    new THREE.BoxGeometry(HEAD_W, HEAD_H, HEAD_D),
    headTexture,
    COLORS.capBlue, // sides = cap blue
    COLORS.capBlueDark, // back
  );
  // Hide the head box's side faces. HEAD_W is wider than the (narrow, off-center)
  // profile art, so on side views the solid cap-blue side strip pokes out past the
  // head silhouette as a thin line. The body box below still supplies the 2.5D depth.
  box.material[0] = hiddenFaceMaterial; // +X
  box.material[1] = hiddenFaceMaterial; // -X
  box.renderOrder = 14;
  group.add(box);
  // No back-side outline shell on the textured boxes: the sprite art already has
  // a baked black contour, and a shell would show through the front's transparent
  // margins as a black rectangle. Box thickness comes from the solid side faces.
  return { group, box };
}

function createBodyPart() {
  const group = new THREE.Group();
  group.position.y = BODY_CY;
  const box = makeFaceBox(
    new THREE.BoxGeometry(BODY_W, BODY_H, BODY_D),
    bodyTexture,
    COLORS.jacketBlue, // sides
    COLORS.back, // back
  );
  // Same as the head: hide the side faces so the solid jacket-blue thickness strip
  // doesn't poke out behind the torso on side views. Depth comes from the 3D limbs.
  box.material[0] = hiddenFaceMaterial; // +X
  box.material[1] = hiddenFaceMaterial; // -X
  box.renderOrder = 12;
  group.add(box);
  return { group, box };
}

function createArmPart(side) {
  const pivot = new THREE.Group();
  pivot.position.set(side * ARM_X, SHOULDER_Y, 0);
  // Inner group: rest the arm angled outward from the shoulder (not parallel to
  // the torso). Swing happens on `pivot`, so this tilt stays independent of it.
  const limb = new THREE.Group();
  limb.rotation.z = side * ARM_REST_TILT; // splay the hand outward; sign refreshed per direction in setLimbLayout
  const sleeveMat = new THREE.MeshToonMaterial({ color: COLORS.jacketBlue });
  const gloveMat = new THREE.MeshToonMaterial({ color: COLORS.glove });
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.1, 4, 8), sleeveMat); // ~2/3 width
  upper.position.y = -0.12;
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), gloveMat); // ~2/3 width
  glove.position.y = -0.26;
  limb.add(upper, glove);
  pivot.add(limb);
  pivot.userData.tiltGroup = limb; // so setLimbLayout can re-aim the splay per direction
  addOutline(upper, 1.14);
  addOutline(glove, 1.1);
  return pivot;
}

function createLegPart(side) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.12, HIP_Y, 0);
  const pantsMat = new THREE.MeshToonMaterial({ color: COLORS.pants });
  const bootMat = new THREE.MeshToonMaterial({ color: COLORS.boot });
  const legRadius = 0.05; // ~2/3 width
  const reach = HIP_Y + LEG_LIFT + CHAR_CLEARANCE; // lifted hip pivot -> ground
  const bootH = 0.05;
  const thighLen = Math.max(0.05, reach - bootH - legRadius * 2);
  const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(legRadius, thighLen, 4, 8), pantsMat);
  thigh.position.y = -(reach - bootH) / 2;
  const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, bootH, 0.16), bootMat);
  boot.position.set(0, -reach + bootH / 2, 0.03);
  pivot.add(thigh, boot);
  addOutline(thigh, 1.1);
  addOutline(boot, 1.08, 0.008); // constant-width border so the short boot keeps a clear outline
  return pivot;
}

// Cheap silhouette: a slightly larger back-faced black shell behind the mesh.
// `scale` is a uniform multiplier. For thin boxes, pass `margin` (world units) to
// add a roughly constant border on every axis instead — a uniform scale would make
// the outline on the thin axis (e.g. a short boot) nearly invisible.
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

// --- movement / state ---------------------------------------------------------

function tryStartMove() {
  const screenInput = getScreenInputVector();
  if (!screenInput) {
    setPlayerState("idle");
    return;
  }

  const nextDirection = INPUT_TO_DIRECTION.get(`${screenInput.x},${screenInput.z}`);
  player.direction = nextDirection;
  setHybridDirection(nextDirection);

  const worldDelta = getCameraRelativeGridDelta(screenInput);
  const target = { x: player.grid.x + worldDelta.x, z: player.grid.z + worldDelta.z };
  if (!canMoveTo(player.grid, target, worldDelta)) {
    setPlayerState("idle");
    return;
  }

  // Entry velocity: cruise (1) if this segment continues a walk already in motion,
  // otherwise ease in from rest (0).
  player.segEntryVel = player.state === "walking" ? 1 : 0;
  // Exit velocity: cruise (1) if the same input would carry us into a valid next
  // tile, so we pass through the boundary at speed; otherwise ease out to a stop.
  // (If the key is released mid-segment we just finish at cruise and stop once —
  // a single stop, not the per-tile pulsing this avoids.)
  const nextTarget = { x: target.x + worldDelta.x, z: target.z + worldDelta.z };
  player.segExitVel = canMoveTo(target, nextTarget, worldDelta) ? 1 : 0;

  player.moving = true;
  player.moveElapsed = 0;
  player.moveStart.copy(playerRoot.position);
  player.moveEnd.set(gridToWorld(target.x), getPlayerGroundY(target.x, target.z), gridToWorld(target.z));
  player.grid = target;
  setPlayerState("walking");
}

// Hermite interpolation of segment progress with the two endpoint velocities.
// m0=m1=0 -> smoothstep (isolated step); m0=0,m1=1 -> ease-in only; m0=1,m1=0 ->
// ease-out only; m0=m1=1 -> linear (constant-speed cruise). Adjacent segments that
// share a velocity (e.g. both 1) therefore join without a velocity discontinuity.
function easeSegment(t, m0, m1) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) + (t3 - t2) * m1;
}

function updateMovement(delta) {
  player.moveElapsed += delta;

  // Cross any completed tile boundaries, carrying the leftover time into the next
  // segment so continuous walking doesn't lose a sliver of a frame at each tile.
  while (player.moving && player.moveElapsed >= MOVE_DURATION) {
    const overshoot = player.moveElapsed - MOVE_DURATION;
    playerRoot.position.copy(player.moveEnd);
    snapPlayerToGrid();
    player.moving = false;
    if (getScreenInputVector()) {
      tryStartMove();
      if (player.moving) {
        player.moveElapsed = overshoot;
      }
    } else {
      setPlayerState("idle");
    }
  }

  if (player.moving) {
    const t = Math.min(player.moveElapsed / MOVE_DURATION, 1);
    const eased = easeSegment(t, player.segEntryVel, player.segExitVel);
    playerRoot.position.lerpVectors(player.moveStart, player.moveEnd, eased);
    updateShadowPosition();
  }
}

function getScreenInputVector() {
  const x = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const z = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  if (x === 0 && z === 0) {
    return null;
  }
  return { x, z };
}

function getCameraRelativeGridDelta(screenInput) {
  const cameraForward = new THREE.Vector3();
  camera.getWorldDirection(cameraForward);
  cameraForward.y = 0;
  cameraForward.normalize();

  const screenDown = cameraForward.multiplyScalar(-1);
  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  cameraRight.y = 0;
  cameraRight.normalize();

  const worldVector = cameraRight.multiplyScalar(screenInput.x).add(screenDown.multiplyScalar(screenInput.z));
  return quantizeWorldVector(worldVector);
}

function quantizeWorldVector(vector) {
  if (vector.lengthSq() === 0) {
    return { x: 0, z: 0 };
  }

  vector.normalize();
  const threshold = 0.38;
  const x = Math.abs(vector.x) < threshold ? 0 : Math.sign(vector.x);
  const z = Math.abs(vector.z) < threshold ? 0 : Math.sign(vector.z);
  return { x, z };
}

function canMoveTo(from, to, delta) {
  if (!canStepBetween(from, to)) {
    return false;
  }

  if (delta.x !== 0 && delta.z !== 0) {
    const sideX = { x: from.x + delta.x, z: from.z };
    const sideZ = { x: from.x, z: from.z + delta.z };
    return canStepBetween(from, sideX) && canStepBetween(from, sideZ);
  }

  return true;
}

function canStepBetween(from, to) {
  if (!isInsideMap(to.x, to.z)) {
    return false;
  }

  const currentHeight = getHeight(from.x, from.z);
  const targetHeight = getHeight(to.x, to.z);
  return targetHeight >= 1 && Math.abs(targetHeight - currentHeight) <= 1;
}

function setPlayerState(state) {
  if (player.state === state) {
    return;
  }
  player.state = state;
}

function setHybridDirection(direction) {
  const frame = DIRECTIONS[direction];
  const c = ART_CENTERS[direction];
  setCellWindow(headTexture, frame, c.h - HEAD_HALF_U, c.h + HEAD_HALF_U, HEAD_V.v0, HEAD_V.v1);
  setCellWindow(bodyTexture, frame, c.b - BODY_HALF_U, c.b + BODY_HALF_U, BODY_V.v0, BODY_V.v1);
  setLimbLayout(direction);
}

// Map a sub-rectangle (0..1 within one direction cell) onto a texture's UV transform.
function setCellWindow(texture, frame, u0, u1, v0, v1) {
  const cellW = 1 / 4;
  const cellH = 1 / 2;
  const cellBottomV = 1 - (frame.row + 1) * cellH;
  texture.repeat.set(cellW * (u1 - u0), cellH * (v1 - v0));
  texture.offset.set(frame.col * cellW + cellW * u0, cellBottomV + cellH * v0);
}

// Place both arms and legs for all 8 directions: separated along the axis
// perpendicular to facing, with the front-back component compressed so the thin
// character's limbs don't splay out in depth on profile views.
function setLimbLayout(direction) {
  const [fx, fz] = FACING[direction];
  const sx = fz; // perpendicular-to-facing, screen-x component
  const sz = -fx * LIMB_DEPTH_SCALE; // perpendicular, depth component (compressed)
  character.leftLeg.position.set(-sx * LEG_SEP, HIP_Y + LEG_LIFT, -sz * LEG_SEP);
  character.rightLeg.position.set(sx * LEG_SEP, HIP_Y + LEG_LIFT, sz * LEG_SEP);
  character.leftArm.position.set(-sx * ARM_SEP, SHOULDER_Y, -sz * ARM_SEP);
  character.rightArm.position.set(sx * ARM_SEP, SHOULDER_Y, sz * ARM_SEP);
  // Back/diagonal-back views swap the arms' screen sides, so the fixed rest tilt
  // would point inward. Re-aim the splay outward based on each arm's current side.
  const screenSide = Math.sign(sx); // left arm sits at -sx, right arm at +sx
  character.leftArm.userData.tiltGroup.rotation.z = -screenSide * ARM_REST_TILT;
  character.rightArm.userData.tiltGroup.rotation.z = screenSide * ARM_REST_TILT;
}

function snapPlayerToGrid() {
  playerRoot.position.set(gridToWorld(player.grid.x), getPlayerGroundY(player.grid.x, player.grid.z), gridToWorld(player.grid.z));
  updateShadowPosition();
}

function updateShadowPosition() {
  const groundHeight = getHeight(player.grid.x, player.grid.z);
  playerShadow.position.set(playerRoot.position.x, groundHeight + 0.018, playerRoot.position.z);
}

function getPlayerGroundY(x, z) {
  return getHeight(x, z) + CHAR_CLEARANCE;
}

function updateCamera(immediate, delta = 0) {
  const target = playerRoot.position.clone();
  target.y += 0.55;
  const desiredPosition = target.clone().add(
    new THREE.Vector3(
      Math.sin(cameraOrbit.yaw) * CAMERA_RADIUS,
      CAMERA_HEIGHT,
      Math.cos(cameraOrbit.yaw) * CAMERA_RADIUS,
    ),
  );

  if (immediate) {
    camera.position.copy(desiredPosition);
  } else {
    // Frame-rate-independent exponential smoothing: the fraction covered this frame
    // depends on elapsed time, so the follow speed is the same at 30, 60 or 144 fps.
    const alpha = 1 - Math.exp(-CAMERA_FOLLOW_RATE * delta);
    camera.position.lerp(desiredPosition, alpha);
  }

  camera.lookAt(target);
}

function updateCharacterFacing() {
  // Fixed quarter-view yaw toward the camera (no full billboarding) so the thin
  // boxes show real thickness. The 8-direction sprite still swaps frames.
  playerBillboard.rotation.set(0, cameraOrbit.yaw, 0);
}

function rotateCamera(steps) {
  cameraOrbit.yaw = normalizeAngle(cameraOrbit.yaw + steps * CAMERA_ROTATE_STEP);
  updateCamera(true);
  updateCharacterFacing();
}

function normalizeAngle(angle) {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

// Light deformed-doll motion: bob + limb swing while walking, tiny breathing idle.
function updatePlayerAnimation() {
  const walking = player.state === "walking";
  const phase = Math.sin(player.walkTime * WALK_ANIM_SPEED);
  const idle = Math.sin(player.animTime * 2.2);

  // Swing limbs fore/aft ALONG the facing direction so legs/arms read as walking
  // in every direction (incl. profile). The axis is horizontal and perpendicular
  // to facing; left/right and arm/leg use opposite phase.
  const [fx, fz] = FACING[player.direction];
  swingAxis.set(-fz, 0, fx).normalize();

  const legSwing = walking ? phase * 0.55 : 0;
  const armSwing = walking ? phase * 0.5 : idle * 0.05;
  character.leftLeg.quaternion.setFromAxisAngle(swingAxis, legSwing);
  character.rightLeg.quaternion.setFromAxisAngle(swingAxis, -legSwing);
  character.leftArm.quaternion.setFromAxisAngle(swingAxis, -armSwing);
  character.rightArm.quaternion.setFromAxisAngle(swingAxis, armSwing);

  const bob = walking ? Math.abs(phase) * 0.045 : (idle + 1) * 0.5 * 0.018;
  const headBob = bob + (walking ? Math.abs(phase) * 0.02 : idle * 0.008);
  character.body.group.position.y = BODY_CY + bob;
  character.head.group.position.y = HEAD_CY + headBob;
  character.leftArm.position.y = SHOULDER_Y + bob;
  character.rightArm.position.y = SHOULDER_Y + bob;
}

function updateDebug() {
  debugGrid.textContent = `${player.grid.x}, ${player.grid.z}, h=${getHeight(player.grid.x, player.grid.z)}`;
  debugDirection.textContent = player.direction;
  debugState.textContent = player.state;
}

function getHeight(x, z) {
  return terrainHeights[z]?.[x] ?? 0;
}

function isInsideMap(x, z) {
  return x >= 0 && x < MAP_SIZE && z >= 0 && z < MAP_SIZE;
}

function gridToWorld(value) {
  return (value - MAP_SIZE / 2 + 0.5) * TILE_SIZE;
}

function normalizeKey(key) {
  return key.toLowerCase();
}

function isMovementKey(key) {
  return ["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(normalizeKey(key));
}

function getCameraRotateDirection(event) {
  if (event.code === "BracketLeft" || event.key === "[" || event.key === "{") {
    return -1;
  }
  if (event.code === "BracketRight" || event.key === "]" || event.key === "}") {
    return 1;
  }
  return 0;
}
