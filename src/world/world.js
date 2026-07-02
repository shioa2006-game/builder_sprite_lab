import { B, BLOCK_DEFS, isSolidFor } from "./blocks.js";
import { mulberry32, clamp, lerp } from "../core/utils.js";

export const WORLD = {
  W: 64, // x (west -> east)
  D: 64, // z (north -> south)
  H: 24, // y
  WATER_LEVEL: 3, // top water cell
  SEED: 20260702,
};

// Landmark positions the story references (kept in one place).
export const PLACES = {
  spawn: { x: 33, z: 54 }, // beach where the hero washes ashore
  base: { x: 32, z: 44 }, // flattened plateau: the settlement
  banner: { x: 32, y: 0, z: 44 }, // y resolved after generation
  hut: { x: 26, z: 42 }, // blueprint anchors (min corner)
  farm: { x: 36, z: 44 },
  shrine: { x: 28, z: 16 }, // on the mountain slope
  mountain: { x: 30, z: 12 },
};

export class VoxelWorld {
  constructor() {
    const { W, D, H } = WORLD;
    this.data = new Uint8Array(W * D * H);
    this.pristine = null;
    this.listeners = [];
    this.blockDamage = new Map(); // cellKey -> accumulated raid damage (fences/doors)
  }

  idx(x, y, z) {
    return (z * WORLD.W + x) * WORLD.H + y;
  }

  inBounds(x, y, z) {
    return x >= 0 && x < WORLD.W && y >= 0 && y < WORLD.H && z >= 0 && z < WORLD.D;
  }

  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return y < 0 ? B.STONE : B.AIR;
    return this.data[this.idx(x, y, z)];
  }

  set(x, y, z, id, silent = false) {
    if (!this.inBounds(x, y, z)) return;
    const i = this.idx(x, y, z);
    const prev = this.data[i];
    if (prev === id) return;
    this.data[i] = id;
    if (!silent) {
      for (const fn of this.listeners) fn(x, y, z, id, prev);
    }
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  isSolidAt(x, y, z, kind = "player") {
    return isSolidFor(this.get(x, y, z), kind);
  }

  // Ground level (y you can stand at) at a column: 1 above the topmost solid block.
  groundY(x, z) {
    for (let y = WORLD.H - 1; y >= 0; y -= 1) {
      const id = this.get(x, y, z);
      if (id !== B.AIR && BLOCK_DEFS[id]?.solid === true) return y + 1;
    }
    return 1;
  }

  isWaterAt(x, y, z) {
    return this.get(x, y, z) === B.WATER;
  }

  // Ground surface Y ignoring tree foliage (logs/leaves), for placing structures
  // and blueprints flush on the terrain even under an overhanging canopy (plain
  // groundY would return the leaf ceiling and float the building in mid-air).
  terrainSurfaceY(x, z) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    for (let y = WORLD.H - 1; y >= 0; y -= 1) {
      const id = this.get(xi, y, zi);
      if (id === B.LOG || id === B.LEAVES) continue;
      if (id !== B.AIR && BLOCK_DEFS[id]?.solid === true) return y + 1;
    }
    return 1;
  }

  // Top surface Y of the first real ground block at or below `fromY` in a column.
  // Used for shadows so an entity under a tree casts its shadow on the ground it
  // stands on, not on the canopy above it (groundY scans from the very top and
  // would return the leaf ceiling because leaves are solid).
  groundYBelow(x, z, fromY) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    for (let y = Math.min(WORLD.H - 1, Math.floor(fromY)); y >= 0; y -= 1) {
      const id = this.get(xi, y, zi);
      if (id !== B.AIR && BLOCK_DEFS[id]?.solid === true) return y + 1;
    }
    return 1;
  }

  // World Y of the water surface in a column (top of the highest water cell), or
  // null if the column has no water. Used for swim buoyancy.
  waterSurfaceY(x, z) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    for (let y = WORLD.H - 1; y >= 0; y -= 1) {
      if (this.get(xi, y, zi) === B.WATER) return y + 1;
    }
    return null;
  }

  // Amanatides & Woo voxel traversal. Returns {x,y,z,id,nx,ny,nz,dist} or null.
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x) || 1;
    const stepY = Math.sign(dir.y) || 1;
    const stepZ = Math.sign(dir.z) || 1;
    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
    const frac = (v) => v - Math.floor(v);
    let tMaxX = dir.x !== 0 ? (dir.x > 0 ? (1 - frac(origin.x)) : frac(origin.x)) * tDeltaX : Infinity;
    let tMaxY = dir.y !== 0 ? (dir.y > 0 ? (1 - frac(origin.y)) : frac(origin.y)) * tDeltaY : Infinity;
    let tMaxZ = dir.z !== 0 ? (dir.z > 0 ? (1 - frac(origin.z)) : frac(origin.z)) * tDeltaZ : Infinity;
    let nx = 0, ny = 0, nz = 0;
    let dist = 0;
    for (let i = 0; i < 256; i += 1) {
      const id = this.get(x, y, z);
      if (id !== B.AIR && id !== B.WATER) {
        return { x, y, z, id, nx, ny, nz, dist };
      }
      if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
        dist = tMaxX;
        x += stepX;
        tMaxX += tDeltaX;
        nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY <= tMaxZ) {
        dist = tMaxY;
        y += stepY;
        tMaxY += tDeltaY;
        nx = 0; ny = -stepY; nz = 0;
      } else {
        dist = tMaxZ;
        z += stepZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
      if (dist > maxDist) return null;
    }
    return null;
  }

  // --- generation ---------------------------------------------------------------

  generate(seed = WORLD.SEED) {
    const { W, D, H } = WORLD;
    this.data.fill(B.AIR);
    const rand = mulberry32(seed);

    // Coarse value-noise grid, bilinearly sampled.
    const NG = 9;
    const noise = [];
    for (let i = 0; i < NG * NG; i += 1) noise.push(rand());
    const sampleNoise = (fx, fz) => {
      const gx = clamp((fx / W) * (NG - 1), 0, NG - 1.001);
      const gz = clamp((fz / D) * (NG - 1), 0, NG - 1.001);
      const x0 = Math.floor(gx), z0 = Math.floor(gz);
      const tx = gx - x0, tz = gz - z0;
      const n00 = noise[z0 * NG + x0], n10 = noise[z0 * NG + x0 + 1];
      const n01 = noise[(z0 + 1) * NG + x0], n11 = noise[(z0 + 1) * NG + x0 + 1];
      return lerp(lerp(n00, n10, tx), lerp(n01, n11, tx), tz);
    };

    const cx = 32, cz = 32;
    const heights = new Int16Array(W * D);
    for (let z = 0; z < D; z += 1) {
      for (let x = 0; x < W; x += 1) {
        const dx = x - cx;
        const dz = (z - cz) * 1.08;
        const d = Math.hypot(dx, dz) / 29;
        const edge = d + (sampleNoise(x * 2.3 + 40, z * 2.3) - 0.5) * 0.24;
        const land = clamp((1 - edge) * 3.2, 0, 1);
        let h = land <= 0 ? 1 : 2 + land * (2.4 + sampleNoise(x, z) * 2.4);
        // Mountain in the north.
        const mdx = x - PLACES.mountain.x;
        const mdz = z - PLACES.mountain.z;
        const md = Math.hypot(mdx, mdz);
        if (land > 0.4) {
          h += Math.max(0, 1 - md / 14) ** 1.7 * 11 * (0.75 + sampleNoise(x * 3, z * 3) * 0.5);
        }
        // Flatten the settlement plateau and the beach approach.
        const bd = Math.hypot(x - PLACES.base.x, z - PLACES.base.z);
        if (bd < 11) h = lerp(5, h, clamp((bd - 6) / 5, 0, 1));
        const sd = Math.hypot(x - PLACES.spawn.x, z - PLACES.spawn.z);
        if (sd < 7) h = lerp(4, h, clamp((sd - 4) / 3, 0, 1));
        // Shrine ledge on the mountain slope.
        const hd = Math.hypot(x - (PLACES.shrine.x + 3), z - (PLACES.shrine.z + 2));
        if (hd < 7) h = lerp(11, h, clamp((hd - 4.5) / 2.5, 0, 1));
        let hh = clamp(Math.round(h), 1, H - 8);
        // Carve a proper basin around the island: columns at/below the waterline
        // that are clearly open sea drop to the sea floor, so the ocean is a solid
        // ~3-deep body instead of see-through 1-block shallows that read as land.
        if (hh <= WORLD.WATER_LEVEL && land < 0.4) hh = 1;
        heights[z * W + x] = hh;
      }
    }

    for (let z = 0; z < D; z += 1) {
      for (let x = 0; x < W; x += 1) {
        const h = heights[z * W + x];
        const beach = h <= WORLD.WATER_LEVEL + 1;
        for (let y = 0; y < h; y += 1) {
          const isTop = y === h - 1;
          let id;
          if (h >= 10) id = isTop && rand() < 0.1 ? B.ORE : B.STONE;
          else if (beach) id = B.SAND;
          else if (isTop) id = B.GRASS;
          else id = y < h - 3 ? B.STONE : B.DIRT;
          this.set(x, y, z, id, true);
        }
        for (let y = h; y <= WORLD.WATER_LEVEL; y += 1) {
          this.set(x, y, z, B.WATER, true);
        }
      }
    }

    // Copper veins embedded in the mountain flanks (exposed by digging).
    for (let i = 0; i < 40; i += 1) {
      const x = PLACES.mountain.x + Math.floor((rand() - 0.5) * 22);
      const z = PLACES.mountain.z + Math.floor((rand() - 0.5) * 22);
      if (!this.inBounds(x, 0, z)) continue;
      const h = heights[z * WORLD.W + x];
      const y = 2 + Math.floor(rand() * Math.max(1, h - 3));
      if (this.get(x, y, z) === B.STONE) this.set(x, y, z, B.ORE, true);
    }

    // Trees and straw bushes on grass, denser forest in the west.
    for (let z = 2; z < D - 2; z += 1) {
      for (let x = 2; x < W - 2; x += 1) {
        const h = heights[z * W + x];
        if (this.get(x, h - 1, z) !== B.GRASS) continue;
        const nearBase = Math.hypot(x - PLACES.base.x, z - PLACES.base.z) < 9;
        const treeP = nearBase ? 0.008 : x < 26 ? 0.05 : 0.016;
        const r = rand();
        if (r < treeP) this.plantTree(x, h, z, rand);
        else if (r < treeP + 0.03) this.set(x, h, z, B.BUSH, true);
      }
    }

    // A few starter trees close to spawn so the first quest flows.
    this.plantTree(29, this.groundY(29, 51), 51, rand);
    this.plantTree(37, this.groundY(37, 52), 52, rand);
    this.plantTree(35, this.groundY(35, 49), 49, rand);

    this.pristine = this.data.slice();
  }

  plantTree(x, y, z, rand) {
    const trunk = 3 + Math.floor(rand() * 2);
    for (let i = 0; i < trunk; i += 1) this.set(x, y + i, z, B.LOG, true);
    const ty = y + trunk;
    for (let dy = -1; dy <= 1; dy += 1) {
      const r = dy === 1 ? 0 : 1;
      for (let dx = -r; dx <= r; dx += 1) {
        for (let dz = -r; dz <= r; dz += 1) {
          if (Math.abs(dx) === 1 && Math.abs(dz) === 1 && rand() < 0.4) continue;
          const cx = x + dx, cy = ty + dy, cz = z + dz;
          if (this.get(cx, cy, cz) === B.AIR) this.set(cx, cy, cz, B.LEAVES, true);
        }
      }
    }
  }

  // --- save / load ----------------------------------------------------------------

  serializeEdits() {
    const out = [];
    for (let i = 0; i < this.data.length; i += 1) {
      if (this.data[i] !== this.pristine[i]) out.push([i, this.data[i]]);
    }
    return out;
  }

  applyEdits(edits) {
    for (const [i, id] of edits) this.data[i] = id;
  }
}
