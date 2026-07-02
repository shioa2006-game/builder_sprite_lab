import * as THREE from "three";
import { B } from "../world/blocks.js";
import { itemForBlock } from "./items.js";

// Blueprint cell lists are generated relative to an anchor (min x/z corner) and
// a base y resolved from the terrain when the blueprint activates.

function hutCells() {
  const cells = [];
  const W = 4, D = 3, H = 2; // outer footprint, wall height
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      for (let z = 0; z < D; z += 1) {
        const border = x === 0 || x === W - 1 || z === 0 || z === D - 1;
        if (!border) continue;
        const isDoor = x === 1 && z === D - 1; // front-center opening
        if (isDoor) {
          if (y === 0) cells.push({ dx: x, dy: 0, dz: z, block: B.DOOR });
          continue; // y=1 above the door stays open
        }
        cells.push({ dx: x, dy: y, dz: z, block: B.WALL });
      }
    }
  }
  // Roof.
  for (let x = 0; x < W; x += 1) {
    for (let z = 0; z < D; z += 1) {
      cells.push({ dx: x, dy: H, dz: z, block: B.PLANK });
    }
  }
  // Interior beds.
  cells.push({ dx: 1, dy: 0, dz: 1, block: B.BED });
  cells.push({ dx: 2, dy: 0, dz: 1, block: B.BED });
  return cells;
}

function farmCells() {
  const cells = [];
  for (let x = 0; x < 4; x += 1) {
    for (let z = 0; z < 3; z += 1) {
      cells.push({ dx: x, dy: -1, dz: z, block: B.FARMLAND }); // sunk into the ground
    }
  }
  cells.push({ dx: 4, dy: 0, dz: 1, block: B.SCARECROW });
  return cells;
}

function shrineCells() {
  const cells = [];
  const W = 5, D = 4;
  for (let x = 0; x < W; x += 1) {
    for (let z = 0; z < D; z += 1) {
      cells.push({ dx: x, dy: 0, dz: z, block: B.STONE }); // raised platform
    }
  }
  for (const [x, z] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]]) {
    cells.push({ dx: x, dy: 1, dz: z, block: B.LOG });
    cells.push({ dx: x, dy: 2, dz: z, block: B.LOG });
  }
  for (let x = 0; x < W; x += 1) {
    for (let z = 0; z < D; z += 1) {
      cells.push({ dx: x, dy: 3, dz: z, block: B.THATCH });
    }
  }
  cells.push({ dx: 2, dy: 1, dz: 1, block: B.ALTAR });
  cells.push({ dx: 2, dy: 0, dz: D + 1, block: B.TORII }); // gate in front
  cells.push({ dx: 0, dy: 1, dz: D, block: B.TORCH });
  cells.push({ dx: W - 1, dy: 1, dz: D, block: B.TORCH });
  return cells;
}

export const BLUEPRINTS = {
  hut: { name: "ちいさな小屋", build: hutCells },
  farm: { name: "はじまりの畑", build: farmCells },
  shrine: { name: "職業の社", build: shrineCells },
};

const GHOST_COLORS = {
  [B.WALL]: 0xf2ecdc,
  [B.PLANK]: 0xc99c5f,
  [B.DOOR]: 0x8a5a2c,
  [B.BED]: 0xc2a557,
  [B.FARMLAND]: 0x6d4a28,
  [B.SCARECROW]: 0xc2a557,
  [B.STONE]: 0x8b9196,
  [B.LOG]: 0x7c5730,
  [B.THATCH]: 0xc2a557,
  [B.ALTAR]: 0x9fd8ff,
  [B.TORII]: 0xc23b2a,
  [B.TORCH]: 0xffb347,
};

export class BlueprintManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.active = null; // {id, name, cells: [{x,y,z,block,ghost}], group}
    this.onComplete = null;
    this.completed = new Set();
    world.onChange(() => this.refresh());
  }

  activate(id, anchor, baseY) {
    this.clear();
    const def = BLUEPRINTS[id];
    const group = new THREE.Group();
    const cells = def.build().map((c) => {
      const x = anchor.x + c.dx;
      const y = baseY + c.dy;
      const z = anchor.z + c.dz;
      const mat = new THREE.MeshBasicMaterial({
        color: GHOST_COLORS[c.block] ?? 0xffffff,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      });
      const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.92, 0.92), mat);
      ghost.position.set(x + 0.5, y + 0.5, z + 0.5);
      // Edge wireframe drawn with depthTest off so a still-empty cell's outline is
      // visible THROUGH placed blocks (roof/walls) — the last hidden floor/interior
      // cells stay findable instead of being buried under the structure.
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(ghost.geometry),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }),
      );
      edge.renderOrder = 6;
      ghost.add(edge);
      group.add(ghost);
      return { x, y, z, block: c.block, ghost };
    });

    // Locator beacon: a tall soft beam of light at the footprint centre so the
    // build site is findable from across the island (blueprints sit at fixed
    // spots that can be far from the player when they activate).
    let sx = 0, sz = 0;
    for (const c of cells) {
      sx += c.x;
      sz += c.z;
    }
    const cx = sx / cells.length + 0.5;
    const cz = sz / cells.length + 0.5;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.6, 24, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beam.position.set(cx, baseY + 12, cz);
    beam.renderOrder = 3;
    group.add(beam);

    this.scene.add(group);
    this.active = { id, name: def.name, cells, group, beam, done: false };
    this.refresh();
    return this.active;
  }

  clear() {
    if (this.active) {
      this.scene.remove(this.active.group);
      this.active = null;
    }
  }

  // A cell is satisfied when the world block matches the requirement. Cells that
  // are blocked by a wrong solid block (e.g. a tree trunk in the footprint) are
  // flagged as obstacles and coloured red so the player knows to clear them.
  refresh() {
    const bp = this.active;
    if (!bp || bp.done) return;
    let remaining = 0;
    for (const cell of bp.cells) {
      const world = this.world.get(cell.x, cell.y, cell.z);
      const ok = world === cell.block;
      cell.ghost.visible = !ok;
      const obstacle = !ok && world !== B.AIR && world !== B.WATER;
      cell.obstacle = obstacle;
      cell.ghost.material.color.setHex(obstacle ? 0xff5a4a : GHOST_COLORS[cell.block] ?? 0xffffff);
      // Edge wireframe (drawn through walls): red for obstacles, gold otherwise.
      const edge = cell.ghost.children[0];
      if (edge) edge.material.color.setHex(obstacle ? 0xff5a4a : 0xffe08a);
      if (!ok) remaining += 1;
    }
    if (remaining === 0) {
      bp.done = true;
      this.completed.add(bp.id);
      const id = bp.id;
      this.clear();
      if (this.onComplete) this.onComplete(id);
    }
  }

  // Ghost cell at a world position (so placement can auto-match requirements).
  requiredAt(x, y, z) {
    if (!this.active) return null;
    return this.active.cells.find((c) => c.x === x && c.y === y && c.z === z && this.world.get(x, y, z) !== c.block) ?? null;
  }

  // Remaining material list: {itemId: count}
  remainingMaterials() {
    if (!this.active) return null;
    const out = new Map();
    for (const cell of this.active.cells) {
      if (this.world.get(cell.x, cell.y, cell.z) === cell.block) continue;
      const item = itemForBlock(cell.block);
      if (!item) continue;
      out.set(item, (out.get(item) ?? 0) + 1);
    }
    return out;
  }

  update(time) {
    if (!this.active) return;
    const pulse = 0.22 + (Math.sin(time * 3) + 1) * 0.09;
    const obstaclePulse = 0.4 + (Math.sin(time * 6) + 1) * 0.15; // brighter, faster = "clear me"
    for (const cell of this.active.cells) {
      if (cell.ghost.visible) cell.ghost.material.opacity = cell.obstacle ? obstaclePulse : pulse;
    }
    if (this.active.beam) {
      this.active.beam.material.opacity = 0.22 + (Math.sin(time * 2) + 1) * 0.07;
      this.active.beam.rotation.y = time * 0.3;
    }
  }
}
