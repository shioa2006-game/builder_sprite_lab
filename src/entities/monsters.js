import * as THREE from "three";
import { Entity, GRAVITY } from "./entity.js";
import { MonsterSprite } from "./rig.js";
import { B } from "../world/blocks.js";
import { WORLD } from "../world/world.js";

const SLIME_A = new URL("../../assets/nonhumanoids/slime_idle_a_8dir.png", import.meta.url).href;
const SLIME_B = new URL("../../assets/nonhumanoids/slime_idle_b_8dir.png", import.meta.url).href;
const BAT_A = new URL("../../assets/nonhumanoids/night_bat_idle_a_8dir.png", import.meta.url).href;
const BAT_B = new URL("../../assets/nonhumanoids/night_bat_idle_b_8dir.png", import.meta.url).href;

export const MONSTER_TYPES = {
  slime: {
    name: "スライム",
    sheets: [SLIME_A, SLIME_B],
    hp: 7, atk: 2, scale: 0.9, flying: false, aggro: 6, speed: 3.0,
    drops: [["jelly", 1, 2]],
    tint: 0xffffff,
  },
  bat: {
    name: "おおこうもり",
    sheets: [BAT_A, BAT_B],
    hp: 5, atk: 2, scale: 0.85, flying: true, aggro: 8, speed: 2.9,
    drops: [["wing", 1, 2]],
    tint: 0xffffff,
  },
  boss: {
    name: "書喰いのスライム",
    sheets: [SLIME_A, SLIME_B],
    hp: 70, atk: 5, scale: 2.6, flying: false, aggro: 40, speed: 2.4,
    drops: [["jelly", 6, 10], ["copper", 2, 3]],
    tint: 0xff8f8f,
    boss: true,
  },
};

export class Monster extends Entity {
  constructor(type, x, y, z, opts = {}) {
    const def = MONSTER_TYPES[type];
    super("monster", def.flying ? 0.32 : 0.36 * def.scale, def.flying ? 0.6 : 0.75 * def.scale);
    this.type = type;
    this.def = def;
    this.raid = !!opts.raid;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.pos.set(x, y, z);
    this.anchor = new THREE.Vector3(x, y, z);
    this.sprite = new MonsterSprite({
      sheetAUrl: def.sheets[0],
      sheetBUrl: def.sheets[1],
      scale: def.scale,
      tint: def.tint,
      yOffset: def.flying ? 0.4 : 0,
    });
    this.root = new THREE.Group();
    this.root.add(this.sprite.group);
    this.root.position.copy(this.pos);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.3 * def.scale, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.root.add(this.shadow);

    // Tiny HP bar (hidden until damaged).
    this.hpBar = new THREE.Group();
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x201810, depthWrite: false }));
    bg.scale.set(0.72 * def.scale, 0.09, 1);
    const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xe0503a, depthWrite: false }));
    fg.scale.set(0.68 * def.scale, 0.06, 1);
    this.hpBar.add(bg, fg);
    this.hpBarFg = fg;
    this.hpBar.position.y = def.scale * (def.flying ? 1.55 : 1.15);
    this.hpBar.visible = false;
    this.root.add(this.hpBar);

    this.moveTimer = Math.random() * 2;
    this.attackCd = 0;
    this.stuckTime = 0;
    this.facingDir = new THREE.Vector2(0, 1);
    this.deathT = 0;
    this.flashT = 0;
    this.spikeCd = 0;
  }

  chooseTarget(ctx) {
    if (this.raid) {
      // Raiders head for the banner, but peel off onto nearby defenders.
      let best = null;
      let bestD = 5.0;
      for (const e of [ctx.player, ...ctx.villagers]) {
        if (e.dead || e.down) continue;
        const d = this.pos.distanceTo(e.pos);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best) return { entity: best, pos: best.pos };
      // Otherwise gnaw on the banner itself.
      return { entity: ctx.bannerEntity, pos: ctx.bannerEntity.pos };
    }
    const d = this.pos.distanceTo(ctx.player.pos);
    const aggro = this.def.aggro * (ctx.isNight ? 1.4 : 1);
    if (!ctx.player.dead && d < aggro) return { entity: ctx.player, pos: ctx.player.pos };
    return null;
  }

  update(dt, ctx) {
    if (this.dead) {
      this.deathT += dt;
      const s = Math.max(0, 1 - this.deathT * 3);
      this.sprite.group.scale.setScalar(s);
      this.root.position.copy(this.pos);
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.spikeCd = Math.max(0, this.spikeCd - dt);
    this.sprite.material.color.setHex(this.flashT > 0 ? 0xff4040 : this.def.tint);

    const target = this.chooseTarget(ctx);
    const speed = this.def.speed;

    if (this.def.flying) {
      this.updateBat(dt, ctx, target, speed);
    } else {
      this.updateSlime(dt, ctx, target, speed);
    }

    // Spike traps.
    const cellId = ctx.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z));
    if (cellId === B.SPIKES && this.spikeCd <= 0) {
      this.spikeCd = 0.8;
      ctx.hurtMonster(this, 3, null);
    }

    // Contact attack.
    if (target?.entity && this.attackCd <= 0) {
      const e = target.entity;
      const d = this.pos.distanceTo(e.pos);
      if (d < this.halfW + e.halfW + 0.35 && Math.abs(this.pos.y - e.pos.y) < 1.4) {
        this.attackCd = 1.1;
        ctx.attackEntity(e, this.def.atk, this.pos);
      }
    }

    // Raiders gnaw through fences/doors when stuck.
    if (this.raid && this.stuckTime > 1.0) {
      const fx = Math.floor(this.pos.x + this.facingDir.x * 0.9);
      const fz = Math.floor(this.pos.z + this.facingDir.y * 0.9);
      for (let dy = 0; dy <= 1; dy += 1) {
        const y = Math.floor(this.pos.y) + dy;
        const id = ctx.world.get(fx, y, fz);
        if (id === B.FENCE || id === B.DOOR) {
          ctx.damageBlock(fx, y, fz, this.def.boss ? 6 : 2);
          this.stuckTime = 0;
          break;
        }
      }
      if (this.stuckTime > 2.4) {
        // Give up and sidestep.
        this.facingDir.rotateAround(new THREE.Vector2(), (Math.random() - 0.5) * 2);
        this.stuckTime = 0;
      }
    }

    // Visuals.
    this.root.position.copy(this.pos);
    this.sprite.faceWorld(this.facingDir.x, this.facingDir.y, ctx.cameraYaw);
    this.sprite.mesh.rotation.y = ctx.cameraYaw;
    this.sprite.update(dt);
    const gy = ctx.world.groundYBelow(this.pos.x, this.pos.z, this.pos.y + 0.1);
    this.shadow.position.y = gy - this.pos.y + 0.02;
    this.hpBar.visible = this.hp < this.maxHp;
    this.hpBarFg.scale.x = 0.68 * this.def.scale * Math.max(0, this.hp / this.maxHp);
    this.sprite.group.visible = this.invuln <= 0.3 || Math.floor(this.invuln * 16) % 2 === 0;
  }

  updateSlime(dt, ctx, target, speed) {
    this.vel.y += GRAVITY * dt;
    // Ground friction between hops.
    if (this.onGround) {
      this.vel.x *= Math.max(0, 1 - dt * 6);
      this.vel.z *= Math.max(0, 1 - dt * 6);
    }
    this.moveTimer -= dt;
    if (this.onGround && this.moveTimer <= 0) {
      let dir = null;
      if (target) {
        dir = new THREE.Vector2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
        this.moveTimer = this.def.boss ? 0.9 : 0.55 + Math.random() * 0.3;
      } else {
        // Lazy wander around the anchor.
        this.moveTimer = 1.6 + Math.random() * 2.2;
        const back = this.anchor.distanceTo(this.pos) > 7;
        dir = back
          ? new THREE.Vector2(this.anchor.x - this.pos.x, this.anchor.z - this.pos.z)
          : new THREE.Vector2(Math.random() - 0.5, Math.random() - 0.5);
      }
      if (dir.lengthSq() > 0.01) {
        dir.normalize();
        this.facingDir.copy(dir);
        this.vel.x = dir.x * speed;
        this.vel.z = dir.y * speed;
        this.vel.y = this.def.boss ? 7.5 : 6.4;
      }
    }
    this.hitWall = false;
    this.moveWithCollision(ctx.world, dt);
    if (this.hitWall) this.stuckTime += dt;
    else this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
    // Squash & stretch with the hop.
    const squash = this.onGround ? 1 : 1 + Math.min(0.25, Math.abs(this.vel.y) * 0.02);
    this.sprite.mesh.scale.set(this.def.scale * (2 - squash), this.def.scale * squash, this.def.scale);
  }

  updateBat(dt, ctx, target, speed) {
    const gx = Math.floor(this.pos.x);
    const gz = Math.floor(this.pos.z);
    const cruiseY = ctx.world.groundY(gx, gz) + 1.9 + Math.sin(ctx.time * 2.1 + this.anchor.x) * 0.35;
    let dir;
    if (target) {
      dir = new THREE.Vector2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
      // Dive at the target when close.
      const d = dir.length();
      const targetY = d < 2.2 ? target.pos.y + 0.5 : cruiseY;
      this.vel.y += (targetY - this.pos.y) * 4 * dt - this.vel.y * 2.5 * dt;
      if (d > 0.01) {
        dir.normalize();
        this.vel.x += (dir.x * speed - this.vel.x) * dt * 3;
        this.vel.z += (dir.y * speed - this.vel.z) * dt * 3;
        this.facingDir.copy(dir);
      }
    } else {
      // Circle the anchor.
      const t = ctx.time * 0.7 + this.anchor.z;
      const tx = this.anchor.x + Math.cos(t) * 3;
      const tz = this.anchor.z + Math.sin(t) * 3;
      dir = new THREE.Vector2(tx - this.pos.x, tz - this.pos.z);
      if (dir.lengthSq() > 0.04) {
        dir.normalize();
        this.vel.x += (dir.x * speed * 0.6 - this.vel.x) * dt * 2;
        this.vel.z += (dir.y * speed * 0.6 - this.vel.z) * dt * 2;
        this.facingDir.copy(dir);
      }
      this.vel.y += (cruiseY - this.pos.y) * 3 * dt - this.vel.y * 2 * dt;
    }
    this.hitWall = false;
    this.moveWithCollision(ctx.world, dt);
    if (this.hitWall) {
      this.stuckTime += dt;
      this.vel.y = Math.max(this.vel.y, 2.2);
    } else {
      this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
    }
  }

  onHit() {
    this.flashT = 0.15;
  }
}

// --- spawning ---------------------------------------------------------------------

export class MonsterManager {
  constructor(scene) {
    this.scene = scene;
    this.monsters = [];
    this.spawnTimer = 3;
  }

  spawn(type, x, y, z, opts = {}) {
    const m = new Monster(type, x, y, z, opts);
    this.monsters.push(m);
    this.scene.add(m.root);
    return m;
  }

  remove(m) {
    this.scene.remove(m.root);
    const i = this.monsters.indexOf(m);
    if (i >= 0) this.monsters.splice(i, 1);
  }

  count(raidOnly = false) {
    return this.monsters.filter((m) => !m.dead && (!raidOnly || m.raid)).length;
  }

  // Ambient spawns in the wild ring away from the settlement.
  updateAmbient(dt, ctx) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 2.5;
    const cap = ctx.isNight ? 14 : 8;
    const ambient = this.monsters.filter((m) => !m.raid && !m.dead).length;
    if (ambient >= cap) return;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const x = 4 + Math.floor(Math.random() * (WORLD.W - 8));
      const z = 4 + Math.floor(Math.random() * (WORLD.D - 8));
      const distBase = Math.hypot(x - ctx.basePos.x, z - ctx.basePos.z);
      const distPlayer = Math.hypot(x - ctx.player.pos.x, z - ctx.player.pos.z);
      if (distBase < 17 || distPlayer < 9) continue;
      const y = ctx.world.groundY(x, z);
      if (y <= WORLD.WATER_LEVEL + 1) continue; // no spawning in the sea
      const type = ctx.isNight && Math.random() < 0.45 ? "bat" : "slime";
      this.spawn(type, x + 0.5, y + (type === "bat" ? 2 : 0.1), z + 0.5);
      return;
    }
  }

  update(dt, ctx) {
    for (const m of [...this.monsters]) {
      m.update(dt, ctx);
      if (m.dead && m.deathT > 0.4) this.remove(m);
      // Despawn far-away ambient monsters (day bats burn off at dawn).
      if (!m.dead && !m.raid) {
        const far = Math.hypot(m.pos.x - ctx.player.pos.x, m.pos.z - ctx.player.pos.z) > 42;
        const dayBat = m.type === "bat" && !ctx.isNight && Math.random() < dt * 0.15;
        if (far || dayBat) this.remove(m);
      }
    }
  }
}
