import * as THREE from "three";
import { Entity, GRAVITY } from "./entity.js";
import { HumanoidRig } from "./rig.js";

const HUMANOIDS = (file) => new URL(`../../assets/humanoids/${file}`, import.meta.url).href;

export const VILLAGER_DEFS = {
  pino: {
    name: "ピノ",
    title: "大工見習い",
    sheet: HUMANOIDS("village_apprentice_body_8dir.png"),
    colors: { sleeve: 0x9c3b22, hand: 0xe6b285, pants: 0x6b5233, boot: 0x40301d, headBack: 0x2b3a66, bodyBack: 0x7c2d1a },
    fighter: true,
    atk: 2,
    weapon: "club",
  },
  mina: {
    name: "ミナ",
    title: "農家の少女",
    sheet: HUMANOIDS("village_girl_body_8dir.png"),
    colors: { sleeve: 0x2f6f6d, hand: 0xeec39a, pants: 0x8a5a33, boot: 0x5a3a24, headBack: 0x8a5a33, bodyBack: 0x265755 },
    fighter: false,
    healer: true,
  },
  gonta: {
    name: "ゴンタ",
    title: "村の若者",
    sheet: HUMANOIDS("adult_male_villager_body_8dir.png"),
    colors: { sleeve: 0x55703c, hand: 0xd9a878, pants: 0x6b5233, boot: 0x4a3320, headBack: 0x5d4326, bodyBack: 0x435a2f },
    fighter: true,
    atk: 3,
    weapon: "sword_stone",
  },
  jinbei: {
    name: "ジンベエ",
    title: "村の長老",
    sheet: HUMANOIDS("middle_aged_male_villager_body_8dir.png"),
    colors: { sleeve: 0x4a6440, hand: 0xcfa070, pants: 0x57503f, boot: 0x3a2f26, headBack: 0x4c4038, bodyBack: 0x3a4f33 },
    fighter: false,
  },
};

function makeLabelSprite(text, color = "#ffffff") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 34px 'Hiragino Maru Gothic ProN', 'Meiryo', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(20,17,15,0.85)";
  ctx.strokeText(text, 128, 32);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.5, 0.375, 1);
  return sprite;
}

export class Villager extends Entity {
  constructor(id, x, y, z) {
    super("villager", 0.3, 1.1);
    this.id = id;
    this.def = VILLAGER_DEFS[id];
    this.maxHp = 16;
    this.hp = 16;
    this.pos.set(x, y, z);
    this.home = new THREE.Vector3(x, y, z);
    this.rig = new HumanoidRig({ sheetUrl: this.def.sheet, colors: this.def.colors });
    this.root = new THREE.Group();
    this.root.add(this.rig.group);
    this.root.position.copy(this.pos);

    this.nameLabel = makeLabelSprite(this.def.name);
    this.nameLabel.position.y = 1.55;
    this.root.add(this.nameLabel);
    this.marker = makeLabelSprite("！", "#ffd94a");
    this.marker.scale.set(0.9, 0.225, 1);
    this.marker.position.y = 1.85;
    this.marker.visible = false;
    this.root.add(this.marker);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.root.add(this.shadow);

    this.mode = "wander"; // wander | work | fight | cheer | down
    this.moveTarget = null;
    this.thinkTimer = 1;
    this.workTimer = 0;
    this.attackCd = 0;
    this.healPulse = 0;
    this.down = false;
    this.facing = new THREE.Vector2(0, 1);
    this.walking = false;
    this.talkPause = 0;
  }

  setDown(v) {
    this.down = v;
    this.rig.inner.rotation.z = v ? Math.PI / 2 : 0;
    this.rig.inner.position.y = v ? 0.3 : 0;
    if (v) this.hp = Math.max(1, this.hp);
  }

  update(dt, ctx) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.talkPause = Math.max(0, this.talkPause - dt);
    this.thinkTimer -= dt;

    if (this.down) {
      // Recover after the raid ends.
      if (!ctx.raidActive) {
        this.setDown(false);
        this.hp = this.maxHp;
      }
      this.rootSync(ctx);
      return;
    }

    let desired = null; // move destination
    let sprint = 1;

    if (ctx.raidActive) {
      this.rig.setTool(this.def.fighter ? this.def.weapon : null);
      if (this.def.fighter) {
        // Chase the monster nearest to the banner.
        let best = null;
        let bestD = Infinity;
        for (const m of ctx.monsters) {
          if (m.dead) continue;
          const d = m.pos.distanceTo(ctx.bannerPos);
          if (d < bestD) {
            bestD = d;
            best = m;
          }
        }
        if (best) {
          desired = best.pos;
          sprint = 1.35;
          const d = this.pos.distanceTo(best.pos);
          if (d < 1.1 && this.attackCd <= 0) {
            this.attackCd = 1.0;
            this.rig.startAttack();
            ctx.hurtMonster(best, this.def.atk, this.pos);
          }
        } else {
          desired = ctx.bannerPos;
        }
      } else {
        // Non-fighters rally at the banner; Mina cheers allies back to health.
        desired = ctx.bannerPos;
        if (this.def.healer) {
          this.healPulse += dt;
          if (this.healPulse > 2.2) {
            this.healPulse = 0;
            ctx.healAlliesNear(this.pos, 4.5, 1);
          }
        }
      }
    } else if (ctx.farmWork && this.id === "mina") {
      this.rig.setTool(null);
      // Tend the crops: walk to a random crop cell, "water" it for a moment.
      if (this.workTimer > 0) {
        this.workTimer -= dt;
        ctx.boostCropsNear(this.pos, 2.2, dt);
      } else if (!this.moveTarget && this.thinkTimer <= 0) {
        const cell = ctx.pickFarmCell();
        this.thinkTimer = 2;
        if (cell) this.moveTarget = new THREE.Vector3(cell.x + 0.5, cell.y, cell.z + 0.5);
      }
      desired = this.moveTarget;
    } else {
      this.rig.setTool(null);
      if (this.thinkTimer <= 0) {
        this.thinkTimer = 3 + Math.random() * 4;
        if (Math.random() < 0.65) {
          const a = Math.random() * Math.PI * 2;
          const r = 1.5 + Math.random() * 4;
          this.moveTarget = new THREE.Vector3(
            this.home.x + Math.cos(a) * r,
            this.home.y,
            this.home.z + Math.sin(a) * r,
          );
        } else {
          this.moveTarget = null;
        }
      }
      desired = this.moveTarget;
    }

    // Walk toward the destination.
    this.walking = false;
    if (desired && this.talkPause <= 0) {
      const dx = desired.x - this.pos.x;
      const dz = desired.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const arrive = ctx.raidActive && this.def.fighter ? 0.9 : 0.5;
      if (d > arrive) {
        const speed = 2.3 * sprint;
        this.vel.x = (dx / d) * speed;
        this.vel.z = (dz / d) * speed;
        this.facing.set(dx, dz);
        this.walking = true;
      } else {
        this.vel.x = 0;
        this.vel.z = 0;
        if (this.moveTarget && d <= arrive) {
          this.moveTarget = null;
          if (ctx.farmWork && this.id === "mina") this.workTimer = 2.5;
        }
      }
    } else {
      this.vel.x *= Math.max(0, 1 - dt * 8);
      this.vel.z *= Math.max(0, 1 - dt * 8);
    }

    this.vel.y += GRAVITY * dt;
    this.hitWall = false;
    this.moveWithCollision(ctx.world, dt);
    if (this.hitWall && this.onGround) this.vel.y = 7.2;

    this.rootSync(ctx);
    // Work bobbing while watering.
    if (this.workTimer > 0) {
      this.rig.inner.rotation.x = Math.sin(ctx.time * 8) * 0.12;
    } else {
      this.rig.inner.rotation.x = 0;
    }
  }

  rootSync(ctx) {
    this.root.position.copy(this.pos);
    this.rig.group.rotation.y = ctx.cameraYaw;
    this.rig.faceWorld(this.facing.x, this.facing.y, ctx.cameraYaw);
    this.rig.update(1 / 60, this.walking);
    const gy = ctx.world.groundY(Math.floor(this.pos.x), Math.floor(this.pos.z));
    this.shadow.position.y = gy - this.pos.y + 0.02;
    this.rig.group.visible = this.invuln <= 0 || Math.floor(this.invuln * 14) % 2 === 0;
  }

  facePlayer(playerPos) {
    this.facing.set(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    this.talkPause = 4;
    this.vel.x = 0;
    this.vel.z = 0;
  }
}
