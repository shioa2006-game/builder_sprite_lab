import * as THREE from "three";
import { B } from "./blocks.js";
import { WORLD } from "./world.js";
import { cellKey } from "../core/utils.js";

// Prop blocks are rendered as individual little meshes. Builders return a group
// whose origin sits at the cell's min corner ground center (x+0.5, y, z+0.5).

const MAT = {
  wood: new THREE.MeshToonMaterial({ color: 0x8a5a2c }),
  woodDark: new THREE.MeshToonMaterial({ color: 0x5f3d1c }),
  plank: new THREE.MeshToonMaterial({ color: 0xc99c5f }),
  straw: new THREE.MeshToonMaterial({ color: 0xc2a557 }),
  strawDark: new THREE.MeshToonMaterial({ color: 0x96793a }),
  stone: new THREE.MeshToonMaterial({ color: 0x8b9196 }),
  steel: new THREE.MeshToonMaterial({ color: 0xaeb6bb }),
  red: new THREE.MeshToonMaterial({ color: 0xc23b2a }),
  white: new THREE.MeshToonMaterial({ color: 0xf2ecdc }),
  green: new THREE.MeshToonMaterial({ color: 0x4c9440 }),
  greenDark: new THREE.MeshToonMaterial({ color: 0x356b2b }),
  gold: new THREE.MeshToonMaterial({ color: 0xd9b545 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffb347 }),
  glow: new THREE.MeshBasicMaterial({ color: 0x9fd8ff }),
  cloth: new THREE.MeshToonMaterial({ color: 0x2f5db0, side: THREE.DoubleSide }),
};

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cylinder(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

function cone(r, h, mat, x = 0, y = 0, z = 0, seg = 6) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

const BUILDERS = {
  [B.FENCE](world, x, y, z) {
    const g = new THREE.Group();
    g.add(box(0.14, 0.95, 0.14, MAT.wood, 0, 0.475, 0));
    const link = (dx, dz) => {
      const nid = world.get(x + dx, y, z + dz);
      if (nid === B.FENCE || nid === B.DOOR) {
        g.add(box(dx !== 0 ? 0.5 : 0.09, 0.09, dz !== 0 ? 0.5 : 0.09, MAT.woodDark, dx * 0.25, 0.72, dz * 0.25));
        g.add(box(dx !== 0 ? 0.5 : 0.09, 0.09, dz !== 0 ? 0.5 : 0.09, MAT.woodDark, dx * 0.25, 0.38, dz * 0.25));
      }
    };
    link(1, 0); link(-1, 0); link(0, 1); link(0, -1);
    return g;
  },
  [B.SPIKES]() {
    const g = new THREE.Group();
    g.add(box(0.9, 0.06, 0.9, MAT.woodDark, 0, 0.03, 0));
    for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25], [0, 0]]) {
      g.add(cone(0.09, 0.34, MAT.steel, dx, 0.23, dz));
    }
    return g;
  },
  [B.TORCH]() {
    const g = new THREE.Group();
    g.add(box(0.09, 0.62, 0.09, MAT.wood, 0, 0.31, 0));
    const flame = cone(0.12, 0.24, MAT.flame, 0, 0.72, 0);
    flame.name = "flame";
    g.add(flame);
    g.userData.torch = true;
    return g;
  },
  [B.DOOR]() {
    const g = new THREE.Group();
    const frame = new THREE.Group();
    frame.add(box(0.1, 1.9, 0.12, MAT.woodDark, -0.45, 0.95, 0));
    frame.add(box(0.1, 1.9, 0.12, MAT.woodDark, 0.45, 0.95, 0));
    frame.add(box(1.0, 0.1, 0.12, MAT.woodDark, 0, 1.9, 0));
    const hinge = new THREE.Group();
    hinge.position.set(-0.4, 0, 0);
    const panel = box(0.8, 1.8, 0.08, MAT.plank, 0.4, 0.9, 0);
    panel.add(box(0.1, 0.1, 0.12, MAT.woodDark, 0.28, 0.05, 0));
    hinge.add(panel);
    hinge.name = "hinge";
    g.add(frame, hinge);
    g.userData.door = true;
    return g;
  },
  [B.WORKBENCH]() {
    const g = new THREE.Group();
    g.add(box(0.95, 0.12, 0.75, MAT.plank, 0, 0.62, 0));
    for (const [dx, dz] of [[-0.38, -0.28], [0.38, -0.28], [-0.38, 0.28], [0.38, 0.28]]) {
      g.add(box(0.1, 0.62, 0.1, MAT.woodDark, dx, 0.31, dz));
    }
    g.add(box(0.28, 0.1, 0.2, MAT.steel, -0.2, 0.73, 0.1));
    g.add(cylinder(0.04, 0.04, 0.3, MAT.wood, 0.15, 0.72, -0.12).rotateZ(Math.PI / 2.4));
    return g;
  },
  [B.BED]() {
    const g = new THREE.Group();
    g.add(box(0.92, 0.18, 0.6, MAT.straw, 0, 0.14, 0));
    g.add(box(0.92, 0.08, 0.6, MAT.strawDark, 0, 0.04, 0));
    g.add(box(0.26, 0.12, 0.4, MAT.white, -0.28, 0.28, 0));
    return g;
  },
  [B.CROP1]() {
    const g = new THREE.Group();
    for (const [dx, dz] of [[-0.22, -0.22], [0.22, -0.2], [-0.2, 0.22], [0.2, 0.2]]) {
      g.add(box(0.05, 0.28, 0.05, MAT.green, dx, 0.14, dz));
    }
    g.userData.sway = true;
    return g;
  },
  [B.CROP2]() {
    const g = new THREE.Group();
    for (const [dx, dz] of [[-0.22, -0.22], [0.22, -0.2], [-0.2, 0.22], [0.2, 0.2], [0, 0]]) {
      g.add(box(0.06, 0.55, 0.06, MAT.greenDark, dx, 0.27, dz));
      g.add(box(0.14, 0.1, 0.14, MAT.green, dx, 0.58, dz));
    }
    g.userData.sway = true;
    return g;
  },
  [B.CROP3]() {
    const g = new THREE.Group();
    for (const [dx, dz] of [[-0.22, -0.22], [0.22, -0.2], [-0.2, 0.22], [0.2, 0.2], [0, 0]]) {
      g.add(box(0.06, 0.7, 0.06, MAT.straw, dx, 0.35, dz));
      const head = box(0.12, 0.22, 0.12, MAT.gold, dx + 0.06, 0.74, dz);
      head.rotation.z = -0.5;
      g.add(head);
    }
    g.userData.sway = true;
    return g;
  },
  [B.ALTAR]() {
    const g = new THREE.Group();
    g.add(box(0.95, 0.3, 0.95, MAT.stone, 0, 0.15, 0));
    g.add(box(0.7, 0.3, 0.7, MAT.stone, 0, 0.45, 0));
    g.add(box(0.5, 0.12, 0.5, MAT.white, 0, 0.66, 0));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), MAT.glow);
    orb.position.y = 0.92;
    orb.name = "orb";
    g.add(orb);
    return g;
  },
  [B.TORII]() {
    const g = new THREE.Group();
    g.add(cylinder(0.09, 0.11, 1.9, MAT.red, -0.55, 0.95, 0));
    g.add(cylinder(0.09, 0.11, 1.9, MAT.red, 0.55, 0.95, 0));
    const top = box(1.7, 0.14, 0.18, MAT.red, 0, 1.95, 0);
    top.rotation.z = 0;
    g.add(top);
    g.add(box(1.4, 0.1, 0.14, MAT.red, 0, 1.62, 0));
    g.add(box(1.76, 0.08, 0.2, MAT.woodDark, 0, 2.05, 0));
    return g;
  },
  [B.SCARECROW]() {
    const g = new THREE.Group();
    g.add(box(0.08, 1.3, 0.08, MAT.wood, 0, 0.65, 0));
    g.add(box(0.8, 0.08, 0.08, MAT.wood, 0, 1.0, 0));
    g.add(cone(0.3, 0.26, MAT.straw, 0, 1.45, 0, 8));
    g.add(box(0.2, 0.2, 0.18, MAT.strawDark, 0, 1.26, 0));
    return g;
  },
  [B.BANNER]() {
    const g = new THREE.Group();
    g.add(cylinder(0.05, 0.06, 2.2, MAT.woodDark, 0, 1.1, 0));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), MAT.gold).translateY(2.24));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6, 6, 1), MAT.cloth);
    flag.position.set(0.48, 1.85, 0);
    flag.name = "flag";
    g.add(flag);
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), MAT.gold);
    emblem.position.set(0.48, 1.85, 0.012);
    emblem.name = "emblem";
    g.add(emblem);
    g.userData.banner = true;
    return g;
  },
  [B.BUSH]() {
    const g = new THREE.Group();
    for (const [dx, dz, s] of [[-0.15, -0.1, 1], [0.18, 0.05, 0.8], [0, 0.16, 0.9]]) {
      g.add(cone(0.16 * s, 0.42 * s, MAT.straw, dx, 0.21 * s, dz, 5));
    }
    return g;
  },
};

const MAX_TORCH_LIGHTS = 8;

export class PropRenderer {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.props = new Map(); // cellKey -> group
    this.time = 0;
    this.lightPool = [];
    for (let i = 0; i < MAX_TORCH_LIGHTS; i += 1) {
      const light = new THREE.PointLight(0xffa54f, 0, 7, 1.6);
      light.visible = false;
      scene.add(light);
      this.lightPool.push(light);
    }
    this.lightTimer = 0;

    world.onChange((x, y, z, id, prev) => {
      this.syncCell(x, y, z);
      // Fences/doors connect visually to neighbours.
      if ([id, prev].some((v) => v === B.FENCE || v === B.DOOR)) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (this.world.get(x + dx, y, z + dz) === B.FENCE) this.syncCell(x + dx, y, z + dz);
        }
      }
    });
    this.buildAll();
  }

  buildAll() {
    for (let z = 0; z < WORLD.D; z += 1) {
      for (let x = 0; x < WORLD.W; x += 1) {
        for (let y = 0; y < WORLD.H; y += 1) {
          if (BUILDERS[this.world.get(x, y, z)]) this.syncCell(x, y, z);
        }
      }
    }
  }

  // Full rebuild after bulk world edits (e.g. loading a save).
  rebuildAll() {
    for (const prop of this.props.values()) this.group.remove(prop);
    this.props.clear();
    this.buildAll();
  }

  syncCell(x, y, z) {
    const key = cellKey(x, y, z);
    const existing = this.props.get(key);
    if (existing) {
      this.group.remove(existing);
      this.props.delete(key);
    }
    const id = this.world.get(x, y, z);
    const builder = BUILDERS[id];
    if (!builder) return;
    const prop = builder(this.world, x, y, z);
    prop.position.set(x + 0.5, y, z + 0.5);
    prop.userData.cell = { x, y, z };
    prop.userData.blockId = id;
    this.group.add(prop);
    this.props.set(key, prop);
  }

  update(dt, playerPos, isNight) {
    this.time += dt;
    for (const prop of this.props.values()) {
      if (prop.userData.door) {
        const hinge = prop.getObjectByName("hinge");
        const d = Math.hypot(prop.position.x - playerPos.x, prop.position.z - playerPos.z);
        const target = d < 1.6 ? -Math.PI / 2.2 : 0;
        hinge.rotation.y += (target - hinge.rotation.y) * Math.min(1, dt * 8);
      }
      if (prop.userData.banner) {
        const flag = prop.getObjectByName("flag");
        const positions = flag.geometry.attributes.position;
        for (let i = 0; i < positions.count; i += 1) {
          const x = positions.getX(i);
          positions.setZ(i, Math.sin(this.time * 4 + x * 3.5) * 0.06 * (x + 0.45));
        }
        positions.needsUpdate = true;
      }
      if (prop.userData.sway) {
        prop.rotation.z = Math.sin(this.time * 1.8 + prop.position.x) * 0.05;
      }
      if (prop.userData.torch) {
        const flame = prop.getObjectByName("flame");
        const s = 1 + Math.sin(this.time * 9 + prop.position.x * 7) * 0.18;
        flame.scale.set(s, 1.15 - s * 0.15, s);
      }
    }

    // Reassign the point-light pool to the torches nearest the player (throttled).
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.5;
      const torches = [];
      for (const prop of this.props.values()) {
        if (!prop.userData.torch) continue;
        const d = prop.position.distanceToSquared(playerPos);
        torches.push([d, prop]);
      }
      torches.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < this.lightPool.length; i += 1) {
        const light = this.lightPool[i];
        if (i < torches.length) {
          const prop = torches[i][1];
          light.position.set(prop.position.x, prop.position.y + 0.8, prop.position.z);
          light.visible = true;
          light.intensity = isNight ? 14 : 5;
        } else {
          light.visible = false;
        }
      }
    }
  }
}
