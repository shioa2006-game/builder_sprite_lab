import * as THREE from "three";
import { B, BLOCK_DEFS, isCube, getBlockAtlas, tileUV } from "./blocks.js";
import { WORLD } from "./world.js";

const CHUNK = 16;

// face: [normal, 4 corners (offsets from cell min corner), texSlot(0 top,1 side,2 bottom)]
const FACES = [
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], slot: 0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], slot: 2 },
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], slot: 1 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], slot: 1 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], slot: 1 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], slot: 1 },
];
// UV corners matching the winding above (u along the face, v up).
const FACE_UVS = [
  [0, 0], [1, 0], [1, 1], [0, 1],
];

export class ChunkRenderer {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.chunksX = Math.ceil(WORLD.W / CHUNK);
    this.chunksZ = Math.ceil(WORLD.D / CHUNK);
    this.meshes = new Map(); // "cx,cz" -> {solid, water}
    this.dirty = new Set();

    const atlas = getBlockAtlas();
    this.solidMaterial = new THREE.MeshLambertMaterial({ map: atlas.texture });
    this.leavesMaterial = new THREE.MeshLambertMaterial({ map: atlas.texture, transparent: false });
    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: atlas.texture,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      vertexColors: true, // per-vertex depth shading (deep water darker)
      side: THREE.DoubleSide, // map-edge / drop-off water walls face outward; show both sides
    });

    world.onChange((x, y, z) => this.markDirtyAt(x, z));
    this.buildAll();
  }

  markDirtyAt(x, z) {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    this.dirty.add(`${cx},${cz}`);
    // Border edits change the neighbour chunk's visible faces too.
    if (x % CHUNK === 0 && cx > 0) this.dirty.add(`${cx - 1},${cz}`);
    if (x % CHUNK === CHUNK - 1 && cx < this.chunksX - 1) this.dirty.add(`${cx + 1},${cz}`);
    if (z % CHUNK === 0 && cz > 0) this.dirty.add(`${cx},${cz - 1}`);
    if (z % CHUNK === CHUNK - 1 && cz < this.chunksZ - 1) this.dirty.add(`${cx},${cz + 1}`);
  }

  buildAll() {
    for (let cz = 0; cz < this.chunksZ; cz += 1) {
      for (let cx = 0; cx < this.chunksX; cx += 1) {
        this.rebuildChunk(cx, cz);
      }
    }
    this.dirty.clear();
  }

  flushDirty() {
    for (const key of this.dirty) {
      const [cx, cz] = key.split(",").map(Number);
      this.rebuildChunk(cx, cz);
    }
    this.dirty.clear();
  }

  rebuildChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const prev = this.meshes.get(key);
    if (prev) {
      for (const m of [prev.solid, prev.water]) {
        if (m) {
          this.scene.remove(m);
          m.geometry.dispose();
        }
      }
    }

    const solid = { pos: [], nor: [], uv: [], idx: [], col: [] };
    const water = { pos: [], nor: [], uv: [], idx: [], col: [] };
    const { world } = this;
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;

    for (let z = z0; z < Math.min(z0 + CHUNK, WORLD.D); z += 1) {
      for (let x = x0; x < Math.min(x0 + CHUNK, WORLD.W); x += 1) {
        for (let y = 0; y < WORLD.H; y += 1) {
          const id = world.get(x, y, z);
          if (id === B.AIR) continue;
          if (id === B.WATER) {
            // Water is a VOLUME, not just a top sheet: draw every face that meets
            // open air — the surface plus the exposed walls at map edges, drop-offs
            // and dug channels. Faces toward water or solid stay hidden. Each cell
            // is shaded by its depth below the surface so the body reads as deep
            // water down to the floor instead of a thin film over the sand.
            let dTop = 1;
            while (world.get(x, y + dTop, z) === B.WATER) dTop += 1;
            const shade = Math.max(0.34, 1 - (dTop - 1) * 0.2);
            for (let f = 0; f < FACES.length; f += 1) {
              const face = FACES[f];
              const nb = world.get(x + face.n[0], y + face.n[1], z + face.n[2]);
              if (nb !== B.AIR) continue;
              // Sink the surface (top face, and the top edge of the surface cell's
              // side walls) so it sits just below the block top, matching before.
              const sink = f === 0 || dTop === 1 ? -0.12 : 0;
              this.emitFace(water, x, y, z, face, "water", sink, shade);
            }
            continue;
          }
          if (!isCube(id)) continue;
          const def = BLOCK_DEFS[id];
          for (const face of FACES) {
            const nid = world.get(x + face.n[0], y + face.n[1], z + face.n[2]);
            const ndef = BLOCK_DEFS[nid];
            const neighborHides = nid !== B.AIR && ndef && ndef.opaque;
            if (neighborHides) continue;
            if (id === B.LEAVES && nid === B.LEAVES) continue;
            this.emitFace(solid, x, y, z, face, def.tex[face.slot], 0);
          }
        }
      }
    }

    const entry = { solid: null, water: null };
    if (solid.pos.length) {
      entry.solid = this.makeMesh(solid, this.solidMaterial);
      this.scene.add(entry.solid);
    }
    if (water.pos.length) {
      entry.water = this.makeMesh(water, this.waterMaterial);
      entry.water.renderOrder = 2;
      this.scene.add(entry.water);
    }
    this.meshes.set(key, entry);
  }

  emitFace(buf, x, y, z, face, tileName, sinkY, shade = null) {
    const [u0, v0, u1, v1] = tileUV(tileName);
    const base = buf.pos.length / 3;
    for (let i = 0; i < 4; i += 1) {
      const c = face.c[i];
      buf.pos.push(x + c[0], y + c[1] + (c[1] === 1 ? sinkY : 0), z + c[2]);
      buf.nor.push(face.n[0], face.n[1], face.n[2]);
      const [fu, fv] = FACE_UVS[i];
      buf.uv.push(u0 + (u1 - u0) * fu, v0 + (v1 - v0) * fv);
      if (shade != null) buf.col.push(shade, shade, shade);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  makeMesh(buf, material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(buf.pos, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(buf.nor, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buf.uv, 2));
    if (buf.col && buf.col.length) {
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(buf.col, 3));
    }
    geometry.setIndex(buf.idx);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.userData.isTerrain = true;
    return mesh;
  }
}
