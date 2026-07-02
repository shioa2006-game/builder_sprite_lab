import * as THREE from "three";
import { B } from "../world/blocks.js";
import { WORLD } from "../world/world.js";
import { itemIcon } from "../game/items.js";

export const GRAVITY = -22;

// Base entity: feet-centered position + AABB voxel collision.
export class Entity {
  constructor(kind, halfW, height) {
    this.kind = kind; // 'player' | 'villager' | 'monster'
    this.halfW = halfW;
    this.height = height;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.onGround = false;
    this.inWater = false;
    this.hp = 10;
    this.maxHp = 10;
    this.invuln = 0;
    this.dead = false;
  }

  collides(world, px, py, pz) {
    const x0 = Math.floor(px - this.halfW);
    const x1 = Math.floor(px + this.halfW);
    const y0 = Math.floor(py);
    const y1 = Math.floor(py + this.height - 0.02);
    const z0 = Math.floor(pz - this.halfW);
    const z1 = Math.floor(pz + this.halfW);
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        for (let z = z0; z <= z1; z += 1) {
          if (world.isSolidAt(x, y, z, this.kind)) return true;
        }
      }
    }
    return false;
  }

  // stepHeight > 0 lets the entity auto-climb a low ledge when a horizontal move
  // is blocked (used for swimming out of water: the shore bank is 1 block high and
  // the weak in-water jump can't clear it via the horizontal-first collision order).
  moveWithCollision(world, dt, stepHeight = 0) {
    const { pos, vel } = this;
    let stepped = false;
    // Try to move `pos[axis]` to `target`; if blocked, optionally step up onto a ledge.
    const tryAxis = (axis) => {
      const target = pos[axis] + vel[axis] * dt;
      const probe = { x: pos.x, y: pos.y, z: pos.z };
      probe[axis] = target;
      if (!this.collides(world, probe.x, probe.y, probe.z)) {
        pos[axis] = target;
        return;
      }
      if (stepHeight > 0 && !stepped) {
        for (let lift = 0.5; lift <= stepHeight + 1e-3; lift += 0.5) {
          if (!this.collides(world, probe.x, pos.y + lift, probe.z)) {
            pos.y += lift;
            pos[axis] = target;
            stepped = true;
            return;
          }
        }
      }
      this.hitWall = true;
      vel[axis] = 0;
    };
    tryAxis("x");
    tryAxis("z");
    // Y
    this.onGround = false;
    let ny = pos.y + vel.y * dt;
    if (this.collides(world, pos.x, ny, pos.z)) {
      if (vel.y < 0) {
        this.onGround = true;
        ny = Math.floor(ny) + 1.0001;
        // If still colliding (partial overlap), keep the previous y.
        if (this.collides(world, pos.x, ny, pos.z)) ny = pos.y;
      } else {
        ny = pos.y;
      }
      vel.y = 0;
    }
    pos.y = Math.max(0.5, ny);
    // Clamp to map bounds.
    pos.x = Math.min(WORLD.W - 1.5, Math.max(1.5, pos.x));
    pos.z = Math.min(WORLD.D - 1.5, Math.max(1.5, pos.z));
    this.inWater = world.get(Math.floor(pos.x), Math.floor(pos.y + 0.3), Math.floor(pos.z)) === B.WATER;
  }

  takeDamage(amount, fromPos, knockback = 6) {
    if (this.invuln > 0 || this.dead) return false;
    this.hp -= amount;
    this.invuln = 0.6;
    if (fromPos) {
      const dx = this.pos.x - fromPos.x;
      const dz = this.pos.z - fromPos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / d) * knockback;
      this.vel.z += (dz / d) * knockback;
      this.vel.y = Math.max(this.vel.y, 3.5);
    }
    return true;
  }
}

// --- item drops -------------------------------------------------------------------

const dropTextureCache = new Map();

function dropTexture(itemId) {
  if (!dropTextureCache.has(itemId)) {
    const img = new Image();
    img.src = itemIcon(itemId);
    const texture = new THREE.Texture(img);
    img.onload = () => {
      texture.needsUpdate = true;
    };
    texture.colorSpace = THREE.SRGBColorSpace;
    dropTextureCache.set(itemId, texture);
  }
  return dropTextureCache.get(itemId);
}

export class ItemDrop {
  constructor(itemId, count, x, y, z) {
    this.itemId = itemId;
    this.count = count;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3((Math.random() - 0.5) * 2.5, 4.5, (Math.random() - 0.5) * 2.5);
    this.age = 0;
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: dropTexture(itemId), transparent: true, depthWrite: false }),
    );
    this.sprite.scale.setScalar(0.42);
    this.collected = false;
  }

  update(dt, world, playerPos) {
    this.age += dt;
    // Magnet toward the player.
    const d = this.pos.distanceTo(playerPos);
    if (this.age > 0.4 && d < 1.9) {
      const pull = playerPos.clone().sub(this.pos).normalize().multiplyScalar(9);
      this.vel.lerp(pull, Math.min(1, dt * 8));
      if (d < 0.55) this.collected = true;
    } else {
      this.vel.y += GRAVITY * 0.6 * dt;
    }
    this.pos.addScaledVector(this.vel, dt);
    const ground = world.groundY(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 0.3;
    if (this.pos.y < ground) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.vel.x *= 0.8;
      this.vel.z *= 0.8;
    }
    this.sprite.position.copy(this.pos);
    this.sprite.position.y += Math.sin(this.age * 3) * 0.06 + 0.1;
  }
}
