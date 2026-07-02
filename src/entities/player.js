import * as THREE from "three";
import { Entity, GRAVITY } from "./entity.js";
import { HumanoidRig } from "./rig.js";
import { ITEMS } from "../game/items.js";

const SHEET_URL = new URL("../../assets/adventurer_boy_body_8dir.png", import.meta.url).href;

const PLAYER_COLORS = {
  sleeve: 0x2856a8,
  hand: 0x7b4a22,
  pants: 0xc9b78e,
  boot: 0x6b3f1d,
  headBack: 0x203f74,
  bodyBack: 0x24467e,
};

const WALK_SPEED = 4.4;
const WATER_SPEED = 2.1;
const JUMP_VELOCITY = 8.2;

export class Player extends Entity {
  constructor(scene) {
    super("player", 0.3, 1.15);
    this.baseMaxHp = 20;
    this.maxHp = 20;
    this.hp = 20;
    this.rig = new HumanoidRig({ sheetUrl: SHEET_URL, colors: PLAYER_COLORS });
    this.root = new THREE.Group();
    this.root.add(this.rig.group);
    scene.add(this.root);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(1.25, 0.82, 1);
    scene.add(this.shadow);

    this.facing = new THREE.Vector2(0, 1); // world-space facing (x, z)
    this.walking = false;
    this.attackCooldown = 0;
    this.hasCape = false;
  }

  // moveInput: screen-space {x, z} from WASD, already camera-independent.
  update(dt, world, moveInput, cameraYaw, wantJump) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const speed = this.inWater ? WATER_SPEED : WALK_SPEED;
    let mx = 0;
    let mz = 0;
    if (moveInput) {
      const c = Math.cos(cameraYaw);
      const s = Math.sin(cameraYaw);
      const len = Math.hypot(moveInput.x, moveInput.z) || 1;
      const sx = moveInput.x / len;
      const sz = moveInput.z / len;
      mx = c * sx + s * sz;
      mz = -s * sx + c * sz;
      this.facing.set(mx, mz);
    }
    this.walking = !!moveInput;

    // Horizontal velocity: direct control + knockback decay.
    const control = this.walking ? 1 : 0;
    this.vel.x = this.vel.x * Math.max(0, 1 - dt * 14) + mx * speed * control * Math.min(1, dt * 60) * 14 * dt;
    this.vel.z = this.vel.z * Math.max(0, 1 - dt * 14) + mz * speed * control * Math.min(1, dt * 60) * 14 * dt;
    if (this.walking) {
      // Snap to target speed for tight control, keeping knockback impulses.
      const kx = this.vel.x - mx * speed;
      const kz = this.vel.z - mz * speed;
      const kd = Math.hypot(kx, kz);
      const keep = Math.max(0, kd - dt * 30) / (kd || 1);
      this.vel.x = mx * speed + kx * keep;
      this.vel.z = mz * speed + kz * keep;
    }

    if (this.inWater) {
      this.vel.y += GRAVITY * 0.25 * dt;
      this.vel.y = Math.max(this.vel.y, -2.5);
      if (wantJump) this.vel.y = 3.2;
    } else {
      this.vel.y += GRAVITY * dt;
      if (wantJump && this.onGround) this.vel.y = JUMP_VELOCITY;
    }
    this.hitWall = false;
    this.moveWithCollision(world, dt);

    // Visuals.
    this.root.position.copy(this.pos);
    this.rig.group.rotation.y = cameraYaw;
    this.rig.faceWorld(this.facing.x, this.facing.y, cameraYaw);
    this.rig.update(dt, this.walking);
    const gy = world.groundY(Math.floor(this.pos.x), Math.floor(this.pos.z));
    this.shadow.position.set(this.pos.x, gy + 0.02, this.pos.z);
    // Damage blink.
    this.rig.group.visible = this.invuln <= 0 || Math.floor(this.invuln * 14) % 2 === 0;
  }

  faceToward(x, z) {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.01) this.facing.set(dx, dz);
  }

  heldItem(inventory) {
    const slot = inventory.held();
    return slot ? { id: slot.id, def: ITEMS[slot.id] } : null;
  }

  updateEquipmentBonuses(inventory) {
    this.hasCape = inventory.has("cape");
    const bonus = this.hasCape ? ITEMS.cape.hp : 0;
    const newMax = this.baseMaxHp + bonus;
    if (newMax !== this.maxHp) {
      this.hp = Math.min(newMax, this.hp + Math.max(0, newMax - this.maxHp));
      this.maxHp = newMax;
    }
  }

  defense() {
    return this.hasCape ? ITEMS.cape.def : 0;
  }
}
