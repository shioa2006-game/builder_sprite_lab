import * as THREE from "three";
import { Input } from "./core/input.js";
import { cellKey } from "./core/utils.js";
import { B, BLOCK_DEFS } from "./world/blocks.js";
import { VoxelWorld, WORLD, PLACES } from "./world/world.js";
import { ChunkRenderer } from "./world/mesher.js";
import { PropRenderer } from "./world/props.js";
import { ITEMS, Inventory, itemForBlock } from "./game/items.js";
import { QuestManager, stageIndex } from "./game/quests.js";
import { DayNight } from "./game/daynight.js";
import { BlueprintManager } from "./game/blueprints.js";
import { DefenseEvent } from "./game/defense.js";
import { SFX } from "./game/sfx.js";
import { hasSave, writeSave, readSave } from "./game/save.js";
import { Player } from "./entities/player.js";
import { Villager } from "./entities/villagers.js";
import { MonsterManager } from "./entities/monsters.js";
import { ItemDrop } from "./entities/entity.js";
import { UI } from "./ui/ui.js";

const CAMERA_HEIGHT = 8.2;
const CAMERA_RADIUS = 11.5;
const CAMERA_ROTATE_STEP = Math.PI / 4;
const CAMERA_FOLLOW_RATE = 7.7;
const REACH = 5.6;

class Game {
  constructor() {
    // --- renderer / scene ---------------------------------------------------------
    this.app = document.querySelector("#app");
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fb5c9);
    this.scene.fog = new THREE.Fog(0x8fb5c9, 30, 55);
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.app.appendChild(this.renderer.domElement);
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x63724f, 2.4);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    this.sunLight.position.set(20, 30, 14);
    this.scene.add(this.hemiLight, this.sunLight);

    // --- world ---------------------------------------------------------------------
    this.world = new VoxelWorld();
    this.world.generate();
    this.input = new Input(this.renderer.domElement);
    this.ui = new UI();
    this.inventory = new Inventory();
    this.daynight = new DayNight();
    this.baseLevel = 0;

    // Runtime cell indexes (workbenches, farmland, growing crops).
    this.workbenches = new Set();
    this.farmland = new Set();
    this.cropGrowth = new Map();
    this.world.onChange((x, y, z, id, prev) => this.onWorldChange(x, y, z, id, prev));

    this.chunks = new ChunkRenderer(this.world, this.scene);
    this.props = new PropRenderer(this.world, this.scene);
    this.blueprints = new BlueprintManager(this.world, this.scene);
    this.blueprints.onComplete = (id) => {
      SFX.quest();
      this.ui.toast("✅ 設計図が完成した！");
      this.quests.onBlueprintComplete(id);
    };

    // --- entities --------------------------------------------------------------------
    this.player = new Player(this.scene);
    const sp = PLACES.spawn;
    this.player.pos.set(sp.x + 0.5, this.world.terrainSurfaceY(sp.x, sp.z) + 0.1, sp.z + 0.5);
    this.villagers = [];
    this.monsters = new MonsterManager(this.scene);
    this.drops = [];
    this.defense = new DefenseEvent(this.monsters, this.world);
    this.defense.onEnd = (win) => {
      for (const v of this.villagers) {
        v.setDown(false);
        v.hp = v.maxHp;
        v.rig.setTool(null);
      }
      this.quests.onRaidEnd(win);
      if (win) this.autosave();
    };
    this.bannerEntity = { pos: new THREE.Vector3(), halfW: 0.55, dead: false, isBanner: true };

    // --- camera / aim -----------------------------------------------------------------
    this.cameraYaw = Math.atan2(6.5, 8.0);
    this.cameraYawTarget = this.cameraYaw;
    this.camZoom = 1; // occlusion auto-zoom (1 = full orbit radius)
    this.raycaster = new THREE.Raycaster();
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);
    this.aim = null; // {cell:{x,y,z}, place:{x,y,z}, id}
    this.breakTarget = null;
    this.breakProgress = 0;
    this.swingTick = 0;

    // --- quests / UI hooks --------------------------------------------------------------
    this.quests = new QuestManager(this);
    this.inventory.onChange(() => {
      this.ui.setHotbar(this.inventory);
      this.player.updateEquipmentBonuses(this.inventory);
    });
    this.ui.hooks = {
      selectHotbar: (i) => {
        this.inventory.selected = i;
        this.ui.setHotbar(this.inventory);
      },
      craft: (recipe) => {
        if (!this.inventory.craft(recipe)) return false;
        this.quests.onCrafted(recipe.out);
        this.ui.toast(`✨ ${ITEMS[recipe.out].name} を作った！`);
        return true;
      },
      swapSlots: (a, b) => {
        const t = this.inventory.slots[a];
        this.inventory.slots[a] = this.inventory.slots[b];
        this.inventory.slots[b] = t;
        this.inventory.emit();
      },
    };

    this.toastCooldowns = new Map();
    this.autosaveTimer = 30;
    this.started = false;
    this.clock = new THREE.Clock();

    // Title screen over the live scene.
    this.ui.showTitle({
      hasSave: hasSave(),
      onNew: () => this.startNewGame(),
      onContinue: () => this.loadGame(),
    });

    this.renderer.setAnimationLoop(() => this.frame(Math.min(0.05, this.clock.getDelta())));

    // Debug / automation hook.
    window.__game = this;
  }

  // --- lifecycle -------------------------------------------------------------------

  startNewGame() {
    this.inventory.add("hammer_wood", 1);
    this.inventory.add("herb", 2);
    this.started = true;
    this.ui.setHp(this.player.hp, this.player.maxHp);
    this.ui.fade(false, 900);
    this.quests.startIntro();
  }

  loadGame() {
    const data = readSave();
    if (!data) return this.startNewGame();
    this.world.applyEdits(data.edits ?? []);
    this.chunks.buildAll();
    this.props.rebuildAll();
    this.inventory.load(data.inventory);
    this.quests.load(data.stage);
    this.daynight.hour = data.time?.hour ?? 8;
    this.daynight.day = data.time?.day ?? 1;
    this.setBaseLevel(data.baseLevel ?? 0);
    this.player.pos.set(...data.player.pos);
    this.player.hp = data.player.hp;
    for (const v of data.villagers ?? []) {
      this.spawnVillager(v.id, v.pos[0], v.pos[2], v.pos[1]);
    }
    for (const done of data.blueprintsDone ?? []) this.blueprints.completed.add(done);
    if (data.blueprint) {
      const anchors = { hut: PLACES.hut, farm: PLACES.farm, shrine: PLACES.shrine };
      const anchor = anchors[data.blueprint.id];
      const anchorOff = data.blueprint.id === "shrine" ? 2 : 1;
      this.blueprints.activate(
        data.blueprint.id,
        anchor,
        this.world.terrainSurfaceY(anchor.x + 2, anchor.z + anchorOff),
      );
    }
    this.rescanWorld();
    // Restore stage-dependent markers.
    if (this.quests.stage === "MEET_MINA") this.villager("mina")?.marker && (this.villager("mina").marker.visible = true);
    if (this.quests.stage === "PREPARE") this.villager("gonta")?.marker && (this.villager("gonta").marker.visible = true);
    if (this.quests.stage === "DEFENSE") this.quests.setStage("PREPARE", true);
    this.started = true;
    this.ui.setHp(this.player.hp, this.player.maxHp);
    this.ui.setHotbar(this.inventory);
    this.ui.fade(false, 900);
    this.ui.toast("💾 つづきから はじめます");
  }

  rescanWorld() {
    this.workbenches.clear();
    this.farmland.clear();
    this.cropGrowth.clear();
    for (let z = 0; z < WORLD.D; z += 1) {
      for (let x = 0; x < WORLD.W; x += 1) {
        for (let y = 0; y < WORLD.H; y += 1) {
          const id = this.world.get(x, y, z);
          if (id === B.WORKBENCH) this.workbenches.add(cellKey(x, y, z));
          if (id === B.FARMLAND) this.farmland.add(cellKey(x, y, z));
          if (id === B.CROP1 || id === B.CROP2) this.cropGrowth.set(cellKey(x, y, z), 0);
          if (id === B.BANNER) this.bannerEntity.pos.set(x + 0.5, y, z + 0.5);
        }
      }
    }
  }

  onWorldChange(x, y, z, id, prev) {
    const key = cellKey(x, y, z);
    if (id === B.WORKBENCH) this.workbenches.add(key);
    else if (prev === B.WORKBENCH) this.workbenches.delete(key);
    if (id === B.FARMLAND) this.farmland.add(key);
    else if (prev === B.FARMLAND) this.farmland.delete(key);
    if (id === B.CROP1 || id === B.CROP2) {
      if (!this.cropGrowth.has(key)) this.cropGrowth.set(key, 0);
    } else {
      this.cropGrowth.delete(key);
    }
    if (id === B.BANNER) this.bannerEntity.pos.set(x + 0.5, y, z + 0.5);
  }

  autosave() {
    if (!this.started || this.quests.stage === "INTRO" || this.defense.active) return;
    writeSave(this);
  }

  // --- quest facade ------------------------------------------------------------------

  onStageChanged() {
    this.autosaveTimer = Math.min(this.autosaveTimer, 2);
  }

  spawnVillager(id, x, z, y = null) {
    if (this.villager(id)) return this.villager(id);
    const gy = y ?? this.world.terrainSurfaceY(x, z) + 0.1;
    const v = new Villager(id, x + 0.001, gy, z + 0.001);
    this.villagers.push(v);
    this.scene.add(v.root);
    return v;
  }

  villager(id) {
    return this.villagers.find((v) => v.id === id) ?? null;
  }

  placeBanner() {
    const { x, z } = PLACES.banner;
    const y = this.world.terrainSurfaceY(x, z);
    this.world.set(x, y, z, B.BANNER);
  }

  giveItems(list) {
    for (const [id, n] of list) this.inventory.add(id, n);
  }

  setBaseLevel(level) {
    this.baseLevel = level;
    this.ui.setBaseLevel(level);
  }

  startDefense() {
    this.daynight.forceNight();
    this.defense.start();
    this.ui.toast("⚠️ 魔物の大群が 拠点にせまっている！");
  }

  // --- combat helpers ---------------------------------------------------------------

  hurtMonster(m, dmg, fromPos) {
    if (m.dead) return;
    if (!m.takeDamage(dmg, fromPos, m.def.boss ? 1.2 : 6)) return;
    m.onHit();
    SFX.hitMonster();
    if (m.hp <= 0) {
      m.dead = true;
      m.deathT = 0;
      SFX.kill();
      for (const [item, min, max] of m.def.drops) {
        const n = min + Math.floor(Math.random() * (max - min + 1));
        for (let i = 0; i < n; i += 1) {
          this.spawnDrop(item, 1, m.pos.x, m.pos.y + 0.4, m.pos.z);
        }
      }
    }
  }

  attackEntity(e, dmg, fromPos) {
    if (e.isBanner) {
      this.defense.damageBanner(dmg);
      return;
    }
    if (e === this.player) {
      const actual = Math.max(1, dmg - this.player.defense());
      if (this.player.takeDamage(actual, fromPos)) {
        SFX.hurt();
        if (this.player.hp <= 0) this.playerDown();
      }
      return;
    }
    // Villager.
    if (e.takeDamage(dmg, fromPos)) {
      if (e.hp <= 0) {
        e.setDown(true);
        this.ui.toast(`💫 ${e.def.name}が たおれた！`);
      }
    }
  }

  healAlliesNear(pos, radius, amount) {
    for (const e of [this.player, ...this.villagers]) {
      if (e.down || e.dead) continue;
      if (e.pos.distanceTo(pos) < radius && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + amount);
      }
    }
  }

  async playerDown() {
    if (this.playerDowned) return;
    this.playerDowned = true;
    this.ui.toast("💀 目の前が 真っ暗になった……");
    await this.ui.fade(true, 800);
    const b = this.bannerEntity.pos;
    if (b.lengthSq() > 0) this.player.pos.set(b.x, this.world.terrainSurfaceY(b.x, b.z) + 0.1, b.z + 1);
    else this.player.pos.set(PLACES.spawn.x + 0.5, this.world.terrainSurfaceY(PLACES.spawn.x, PLACES.spawn.z) + 0.1, PLACES.spawn.z + 0.5);
    this.player.hp = this.player.maxHp;
    this.player.vel.set(0, 0, 0);
    await this.ui.fade(false, 800);
    this.playerDowned = false;
  }

  damageBlock(x, y, z, amount) {
    const key = cellKey(x, y, z);
    const id = this.world.get(x, y, z);
    const def = BLOCK_DEFS[id];
    if (!def?.raidTarget) return;
    const total = (this.world.blockDamage.get(key) ?? 0) + amount;
    if (total >= def.hp) {
      this.world.blockDamage.delete(key);
      this.world.set(x, y, z, B.AIR);
      SFX.breakBlock();
      this.throttledToast("break", `💥 ${def.name}が こわされた！`);
    } else {
      this.world.blockDamage.set(key, total);
    }
  }

  throttledToast(kind, text) {
    const now = performance.now();
    if ((this.toastCooldowns.get(kind) ?? 0) > now) return;
    this.toastCooldowns.set(kind, now + 4000);
    this.ui.toast(text);
  }

  spawnDrop(item, count, x, y, z) {
    const drop = new ItemDrop(item, count, x, y, z);
    this.drops.push(drop);
    this.scene.add(drop.sprite);
  }

  // --- farm helpers ------------------------------------------------------------------

  pickFarmCell() {
    const keys = [...this.cropGrowth.keys()];
    const pool = keys.length ? keys : [...this.farmland];
    if (!pool.length) return null;
    const [x, y, z] = pool[Math.floor(Math.random() * pool.length)].split(",").map(Number);
    return { x, y: y + 1, z };
  }

  boostCropsNear(pos, radius, dt) {
    for (const [key, t] of this.cropGrowth) {
      const [x, y, z] = key.split(",").map(Number);
      if (Math.hypot(x + 0.5 - pos.x, z + 0.5 - pos.z) < radius) {
        this.cropGrowth.set(key, t + dt * (1 / 70) * 3);
      }
    }
  }

  updateCrops(dt) {
    for (const [key, t] of this.cropGrowth) {
      const nt = t + dt * (1 / 70);
      if (nt >= 1) {
        const [x, y, z] = key.split(",").map(Number);
        const id = this.world.get(x, y, z);
        if (id === B.CROP1) this.world.set(x, y, z, B.CROP2);
        else if (id === B.CROP2) {
          this.world.set(x, y, z, B.CROP3);
        }
      } else {
        this.cropGrowth.set(key, nt);
      }
    }
  }

  // --- aiming / primary action ---------------------------------------------------------

  updateAim() {
    this.raycaster.setFromCamera({ x: this.input.mouse.ndcX, y: this.input.mouse.ndcY }, this.camera);
    const origin = this.raycaster.ray.origin;
    const dir = this.raycaster.ray.direction;
    const hit = this.world.raycast(origin, dir, 80);
    this.aim = null;
    if (hit) {
      const cx = hit.x + 0.5;
      const cz = hit.z + 0.5;
      const dist = Math.hypot(cx - this.player.pos.x, hit.y + 0.5 - (this.player.pos.y + 0.6), cz - this.player.pos.z);
      if (dist <= REACH) {
        this.aim = {
          cell: { x: hit.x, y: hit.y, z: hit.z },
          place: { x: hit.x + hit.nx, y: hit.y + hit.ny, z: hit.z + hit.nz },
          id: hit.id,
        };
      }
    }
    // Blueprint build target: the empty ghost cell directly under the cursor. Any
    // held item works (auto-snap places the block that cell needs), so building is
    // just "click the glowing outlines".
    this.aimGhost = this.pickGhostCell();

    const held = this.inventory.held();
    const kind = held ? ITEMS[held.id].kind : null;

    if (this.aimGhost) {
      // Highlight the ghost we'd fill, in a build colour.
      this.highlight.visible = true;
      const c = this.aimGhost;
      this.highlight.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
      this.highlight.material.color.setHex(0xffe08a);
      return;
    }

    const showHighlight = !!this.aim && (kind === "tool" || kind === "block" || kind === "seed" || !kind);
    this.highlight.visible = showHighlight;
    if (this.aim) {
      const c = kind === "block" ? this.aim.place : this.aim.cell;
      this.highlight.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
      const breaking = this.breakTarget && this.breakProgress > 0;
      this.highlight.material.color.setHex(breaking ? 0xffb347 : kind === "block" ? 0x9fd8ff : 0xffffff);
    }
  }

  // The nearest still-empty blueprint ghost cell under the cursor, within reach.
  // Returns the cell {x,y,z,block} or null. Obstacle cells (occupied by a wrong
  // block, e.g. a tree) are skipped here — they must be cleared with the hammer.
  pickGhostCell() {
    const bp = this.blueprints.active;
    if (!bp) return null;
    const meshes = [];
    for (const cell of bp.cells) {
      if (!cell.ghost.visible) continue;
      if (this.world.get(cell.x, cell.y, cell.z) !== B.AIR) continue; // obstacle / filled
      cell.ghost.userData.cell = cell;
      meshes.push(cell.ghost);
    }
    if (!meshes.length) return null;
    this.raycaster.setFromCamera({ x: this.input.mouse.ndcX, y: this.input.mouse.ndcY }, this.camera);
    const hits = this.raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      const cell = hit.object.userData.cell;
      const d = Math.hypot(
        cell.x + 0.5 - this.player.pos.x,
        cell.y + 0.5 - (this.player.pos.y + 0.6),
        cell.z + 0.5 - this.player.pos.z,
      );
      if (d <= REACH) return cell;
    }
    return null;
  }

  // Place the block a ghost cell requires, consumed from anywhere in the inventory.
  fillGhostCell(cell) {
    if (!cell) return;
    const itemId = itemForBlock(cell.block);
    if (!itemId) return;
    if (!this.inventory.has(itemId)) {
      this.throttledToast("bpmat", `📦 ${ITEMS[itemId].name} が足りない`);
      return;
    }
    this.inventory.remove(itemId, 1);
    this.world.set(cell.x, cell.y, cell.z, cell.block);
    SFX.place();
    this.player.faceToward(cell.x + 0.5, cell.z + 0.5);
    this.quests.onBlockPlaced(itemId);
  }

  primaryAction(dt) {
    const held = this.inventory.held();
    const def = held ? ITEMS[held.id] : null;
    const pressed = this.input.buttonPressed(0);
    const down = this.input.buttonDown(0);

    // Blueprint auto-snap: clicking a glowing ghost cell fills it with exactly the
    // block that cell needs, taken from anywhere in the inventory. No need to
    // select the right item or aim precisely — just click the outlines.
    if (this.aimGhost) {
      if (pressed) this.fillGhostCell(this.aimGhost);
      return; // don't also attack / place while targeting a build ghost
    }

    // Weapon swing (and bare-hand slap).
    if (pressed && (!def || def.kind === "weapon" || def.kind === "tool")) {
      const atk = def?.kind === "weapon" ? def.atk : 1;
      if (this.player.attackCooldown <= 0) {
        this.player.attackCooldown = 0.42;
        this.player.rig.startAttack();
        SFX.swing();
        if (this.aim) this.player.faceToward(this.aim.cell.x + 0.5, this.aim.cell.z + 0.5);
        // Arc hit check.
        const f = this.player.facing.clone().normalize();
        for (const m of this.monsters.monsters) {
          if (m.dead) continue;
          const dx = m.pos.x - this.player.pos.x;
          const dz = m.pos.z - this.player.pos.z;
          const d = Math.hypot(dx, dz);
          const reach = 1.9 + (m.def.boss ? 1.0 : 0);
          if (d < reach && Math.abs(m.pos.y - this.player.pos.y) < 1.6) {
            const dot = (dx * f.x + dz * f.y) / (d || 1);
            if (dot > 0.25) this.hurtMonster(m, atk, this.player.pos);
          }
        }
      }
    }

    // Hammer: hold to break blocks.
    if (def?.kind === "tool") {
      if (down && this.aim) {
        const { x, y, z } = this.aim.cell;
        const key = cellKey(x, y, z);
        const bdef = BLOCK_DEFS[this.aim.id];
        if (bdef && bdef.hardness !== Infinity) {
          if (bdef.tier > def.tier) {
            this.throttledToast("tier", "🪨 かたすぎる！ 石のハンマーが 必要だ");
          } else {
            if (this.breakTarget !== key) {
              this.breakTarget = key;
              this.breakProgress = 0;
            }
            this.breakProgress += dt * def.speed;
            this.player.faceToward(x + 0.5, z + 0.5);
            this.swingTick -= dt;
            if (this.swingTick <= 0) {
              this.swingTick = 0.32;
              this.player.rig.startAttack();
              SFX.hitBlock();
            }
            if (this.breakProgress >= bdef.hardness) {
              this.breakBlock(x, y, z, bdef);
              this.breakTarget = null;
              this.breakProgress = 0;
            }
          }
        }
      } else {
        this.breakTarget = null;
        this.breakProgress = 0;
      }
    }

    // Place a block.
    if (pressed && def?.kind === "block" && this.aim) {
      const p = this.aim.place;
      const cur = this.world.get(p.x, p.y, p.z);
      if ((cur === B.AIR || cur === B.WATER) && this.world.inBounds(p.x, p.y, p.z) && !this.placeBlockedByEntity(p)) {
        this.world.set(p.x, p.y, p.z, def.block);
        this.inventory.removeFromSlot(this.inventory.selected, 1);
        SFX.place();
        this.player.faceToward(p.x + 0.5, p.z + 0.5);
        this.quests.onBlockPlaced(held.id);
      }
    }

    // Plant seeds on farmland.
    if (pressed && def?.kind === "seed" && this.aim) {
      const c = this.aim.cell;
      if (this.aim.id === B.FARMLAND && this.world.get(c.x, c.y + 1, c.z) === B.AIR) {
        this.world.set(c.x, c.y + 1, c.z, B.CROP1);
        this.inventory.removeFromSlot(this.inventory.selected, 1);
        SFX.place();
        this.quests.counters.planted += 1;
      }
    }

    // Eat.
    if (pressed && def?.kind === "food") {
      if (this.player.hp < this.player.maxHp) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + def.heal);
        this.inventory.removeFromSlot(this.inventory.selected, 1);
        SFX.eat();
        this.ui.toast(`${def.icon} ${def.name}を食べた（HP+${def.heal}）`);
      } else {
        this.throttledToast("full", "おなかは すいていない");
      }
    }
  }

  placeBlockedByEntity(p) {
    for (const e of [this.player, ...this.villagers, ...this.monsters.monsters]) {
      if (
        Math.abs(e.pos.x - (p.x + 0.5)) < e.halfW + 0.5 &&
        Math.abs(e.pos.z - (p.z + 0.5)) < e.halfW + 0.5 &&
        e.pos.y < p.y + 1 &&
        e.pos.y + e.height > p.y
      ) {
        return true;
      }
    }
    return false;
  }

  breakBlock(x, y, z, bdef) {
    const id = this.world.get(x, y, z);
    this.world.set(x, y, z, B.AIR);
    SFX.breakBlock();
    const cx = x + 0.5, cy = y + 0.4, cz = z + 0.5;
    if (id === B.CROP3) {
      this.harvestCrop(cx, cy, cz);
      return;
    }
    if (id === B.CROP1 || id === B.CROP2) {
      this.spawnDrop("seed", 1, cx, cy, cz);
      return;
    }
    if (bdef.drops) this.spawnDrop(bdef.drops, 1, cx, cy, cz);
    if (bdef.bonusDrops) {
      for (const [item, p] of bdef.bonusDrops) {
        if (Math.random() < p) this.spawnDrop(item, 1, cx, cy, cz);
      }
    }
  }

  harvestCrop(cx, cy, cz) {
    this.spawnDrop("rice", 1, cx, cy, cz);
    this.spawnDrop("rice", 1, cx, cy, cz);
    if (Math.random() < 0.7) this.spawnDrop("seed", 1, cx, cy, cz);
    this.quests.counters.harvested += 1;
    SFX.pickup();
  }

  // --- interact ---------------------------------------------------------------------

  interact() {
    // Villagers first.
    let nearest = null;
    let nearestD = 2.6;
    for (const v of this.villagers) {
      const d = v.pos.distanceTo(this.player.pos);
      if (d < nearestD) {
        nearestD = d;
        nearest = v;
      }
    }
    if (nearest) {
      nearest.facePlayer(this.player.pos);
      this.player.faceToward(nearest.pos.x, nearest.pos.z);
      if (!this.quests.onTalk(nearest.id)) this.smallTalk(nearest);
      return;
    }
    // Props under the cursor.
    if (!this.aim) return;
    const { x, y, z } = this.aim.cell;
    const def = BLOCK_DEFS[this.aim.id];
    switch (def?.interact) {
      case "craft":
        this.ui.openMenu(this.menuCtx(true));
        break;
      case "sleep":
        this.trySleep();
        break;
      case "harvest":
        this.world.set(x, y, z, B.AIR);
        this.harvestCrop(x + 0.5, y + 0.4, z + 0.5);
        break;
      case "altar":
        if (!this.quests.onAltarPrayed()) this.ui.toast("🙏 しずかな気配がする……");
        break;
      case "banner":
        this.ui.toast(`🚩 拠点レベル${this.baseLevel}　この旗が 町のしるしだ`);
        break;
      default:
        break;
    }
  }

  smallTalk(v) {
    const lines = {
      pino: [
        "「おれ、いつか自分の家を建てるんだ。もちろん自分の手でな！」",
        "「ハンマーの音って、なんかいいよな。生きてるって感じがする」",
      ],
      mina: [
        "「お米、育ててるとね、雨の音まで好きになるんだよ」",
        "「おにぎりはね、心の形なんだって。おばあちゃんが言ってた」",
      ],
      gonta: [
        "「北の山には銅の鉱石が眠ってる。石のハンマーを忘れるなよ」",
        "「夜はこうもりが増える。たいまつがあると心強いぜ」",
      ],
      jinbei: [
        "「ダーマ神殿……わしも若いころ、転職の儀を受けたもんじゃ」",
        "「町がにぎやかになると、老いぼれの骨まで温まるわい」",
      ],
    };
    const pool = lines[v.id] ?? ["「……」"];
    const text = pool[Math.floor(Math.random() * pool.length)];
    this.quests.busy = true;
    this.ui.dialogue.play([{ speaker: v.def.name, text }], () => {
      this.quests.busy = false;
    });
  }

  async trySleep() {
    if (this.defense.active) {
      this.ui.toast("⚔️ 戦いの最中に 眠れるわけがない！");
      return;
    }
    if (!this.daynight.isEvening && !this.daynight.isNight) {
      this.ui.toast("☀️ まだ眠くない。夕方になったら休もう");
      return;
    }
    SFX.sleep();
    await this.ui.fade(true, 700);
    this.daynight.sleep();
    this.player.hp = this.player.maxHp;
    for (const v of this.villagers) v.hp = v.maxHp;
    // A fresh morning: clear ambient monsters.
    for (const m of [...this.monsters.monsters]) {
      if (!m.raid) this.monsters.remove(m);
    }
    this.autosave();
    await this.ui.fade(false, 700);
    this.ui.toast("🌅 朝になった（HP全回復・セーブしました）");
  }

  menuCtx(forceBench = false) {
    let nearBench = forceBench;
    if (!nearBench) {
      for (const key of this.workbenches) {
        const [x, y, z] = key.split(",").map(Number);
        if (Math.hypot(x + 0.5 - this.player.pos.x, z + 0.5 - this.player.pos.z) < 3.5 && Math.abs(y - this.player.pos.y) < 3) {
          nearBench = true;
          break;
        }
      }
    }
    return {
      inventory: this.inventory,
      nearBench,
      stageIdx: stageIndex(this.quests.stage),
      stageIndexOf: stageIndex,
    };
  }

  jobBookData() {
    const bp = this.blueprints.completed;
    const built = [this.workbenches.size > 0, bp.has("hut"), bp.has("farm"), bp.has("shrine")].filter(Boolean).length;
    const c = this.quests.counters;
    const farmerRevived = stageIndex(this.quests.stage) >= stageIndex("PREPARE");
    return [
      {
        name: "ビルダーの書",
        desc: "すべての職業の根にある原初の書。建てることは、生きること。",
        progress: built / 4,
        revived: true,
      },
      {
        name: "農民の書",
        desc: farmerRevived
          ? "ミナの手で よみがえった。土と水と、まごころの書。"
          : "白紙のページ……。畑を作り、共に働けば 文字は戻るはず。",
        progress: farmerRevived ? 1 : Math.min(1, (Math.min(8, c.planted) / 8) * 0.5 + (Math.min(8, c.harvested) / 8) * 0.5),
        revived: farmerRevived,
      },
    ];
  }

  // --- per-frame ---------------------------------------------------------------------

  handleInput(dt) {
    const { input } = this;
    input.enabled = !this.ui.modalOpen && this.started;

    // Global keys that work with menus open.
    if (input.rawPressed("escape")) {
      if (this.ui.menuOpen) this.ui.closeMenu();
      else if (!this.ui.pause.classList.contains("hidden")) this.ui.hidePause();
      else if (this.started && !this.ui.dialogue.open) this.ui.showPause(() => writeSave(this), null);
    }
    if (input.rawPressed("e") && this.started && !this.ui.dialogue.open) {
      if (this.ui.menuOpen) this.ui.closeMenu();
      else if (!this.ui.modalOpen) this.ui.openMenu(this.menuCtx());
    }
    if (input.rawPressed("b") && this.started && !this.ui.dialogue.open) {
      if (this.ui.bookOverlay.classList.contains("hidden")) this.ui.showJobBook(this.jobBookData());
      else this.ui.hideJobBook();
    }
    if (input.rawPressed("m")) {
      const muted = SFX.toggleMute();
      this.ui.toast(muted ? "🔇 サウンドOFF" : "🔊 サウンドON");
    }

    if (!input.enabled) return;

    // Camera rotation (8 directions).
    if (input.pressed("q") || input.pressed("[")) this.cameraYawTarget += CAMERA_ROTATE_STEP;
    if (input.pressed("]")) this.cameraYawTarget -= CAMERA_ROTATE_STEP;

    // Hotbar.
    for (let i = 0; i < 8; i += 1) {
      if (input.pressed(String(i + 1))) {
        this.inventory.selected = i;
        this.ui.setHotbar(this.inventory);
      }
    }
    const wheel = input.consumeWheel();
    if (wheel !== 0) {
      this.inventory.selected = (this.inventory.selected + wheel + 8) % 8;
      this.ui.setHotbar(this.inventory);
    }

    if (input.pressed("f") || input.rawButtonPressed(2)) this.interact();

    this.primaryAction(dt);
  }

  updateCamera(dt) {
    // Shortest-path smooth rotation toward the stepped target yaw.
    let diff = this.cameraYawTarget - this.cameraYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.cameraYaw += diff * Math.min(1, dt * 10);

    const target = this.player.pos.clone();
    target.y += 0.9;
    const full = target.clone().add(
      new THREE.Vector3(
        Math.sin(this.cameraYaw) * CAMERA_RADIUS,
        CAMERA_HEIGHT,
        Math.cos(this.cameraYaw) * CAMERA_RADIUS,
      ),
    );
    // Occlusion auto-zoom: if terrain (e.g. tree canopy) blocks the view line,
    // pull the camera in front of the blocker; ease back out when clear.
    const viewDir = full.clone().sub(target);
    const viewLen = viewDir.length();
    viewDir.normalize();
    const hit = this.world.raycast(target, viewDir, viewLen);
    const wantZoom = hit ? Math.max(0.22, (hit.dist - 0.7) / viewLen) : 1;
    const zoomRate = wantZoom < this.camZoom ? 14 : 2.2; // snap in, ease out
    this.camZoom += (wantZoom - this.camZoom) * Math.min(1, dt * zoomRate);
    const desired = target.clone().addScaledVector(viewDir, viewLen * this.camZoom);
    const alpha = 1 - Math.exp(-CAMERA_FOLLOW_RATE * dt);
    this.camera.position.lerp(desired, alpha);
    this.camera.lookAt(target);
  }

  applySky() {
    const s = this.daynight.sample();
    this.scene.background.setHex(s.sky);
    this.scene.fog.color.setHex(s.sky);
    this.hemiLight.intensity = s.hemi;
    this.sunLight.intensity = s.sun;
  }

  frame(dt) {
    const time = performance.now() / 1000;

    if (this.started) {
      this.handleInput(dt);

      // Player movement.
      let move = null;
      if (this.input.enabled) {
        const x = (this.input.down("d") || this.input.down("arrowright") ? 1 : 0) - (this.input.down("a") || this.input.down("arrowleft") ? 1 : 0);
        const z = (this.input.down("s") || this.input.down("arrowdown") ? 1 : 0) - (this.input.down("w") || this.input.down("arrowup") ? 1 : 0);
        if (x !== 0 || z !== 0) move = { x, z };
      }
      const wantJump = this.input.down(" ");
      this.player.update(dt, this.world, move, this.cameraYaw, wantJump);

      // Show the held hammer / weapon in the hero's hand (other items = bare hands).
      const heldSlot = this.inventory.held();
      const heldDef = heldSlot ? ITEMS[heldSlot.id] : null;
      this.player.rig.setTool(
        heldDef && (heldDef.kind === "tool" || heldDef.kind === "weapon") ? heldSlot.id : null,
      );

      this.updateAim();
      this.daynight.update(dt);
      this.updateCrops(dt);

      // Monsters.
      const mctx = {
        world: this.world,
        player: this.player,
        villagers: this.villagers,
        bannerEntity: this.bannerEntity,
        bannerPos: this.bannerEntity.pos,
        cameraYaw: this.cameraYaw,
        isNight: this.daynight.isNight,
        time,
        basePos: { x: PLACES.base.x, z: PLACES.base.z },
        attackEntity: (e, dmg, from) => this.attackEntity(e, dmg, from),
        hurtMonster: (m, dmg, from) => this.hurtMonster(m, dmg, from),
        damageBlock: (x, y, z, n) => this.damageBlock(x, y, z, n),
      };
      if (stageIndex(this.quests.stage) >= stageIndex("BUILD_HUT") && !this.defense.active) {
        this.monsters.updateAmbient(dt, mctx);
      }
      this.monsters.update(dt, mctx);
      this.defense.update(dt, this.ui);

      // Villagers.
      const vctx = {
        world: this.world,
        cameraYaw: this.cameraYaw,
        raidActive: this.defense.active,
        monsters: this.monsters.monsters,
        bannerPos: this.bannerEntity.pos,
        farmWork: this.blueprints.completed.has("farm"),
        time,
        hurtMonster: (m, dmg, from) => this.hurtMonster(m, dmg, from),
        healAlliesNear: (pos, r, n) => this.healAlliesNear(pos, r, n),
        pickFarmCell: () => this.pickFarmCell(),
        boostCropsNear: (pos, r, d) => this.boostCropsNear(pos, r, d),
      };
      for (const v of this.villagers) v.update(dt, vctx);

      // Drops.
      for (const drop of [...this.drops]) {
        drop.update(dt, this.world, this.player.pos);
        if (drop.collected) {
          this.inventory.add(drop.itemId, drop.count);
          SFX.pickup();
          this.scene.remove(drop.sprite);
          this.drops.splice(this.drops.indexOf(drop), 1);
        }
      }

      this.quests.update();

      // Underwater tint: on when the player's head is below the water surface.
      let submerged = false;
      if (this.player.inWater) {
        const surf = this.world.waterSurfaceY(this.player.pos.x, this.player.pos.z);
        if (surf != null && this.player.pos.y + 1.0 < surf - 0.05) submerged = true;
      }
      this.ui.setUnderwater(submerged);

      // HUD.
      this.ui.setHp(this.player.hp, this.player.maxHp);
      this.ui.setClock(this.daynight.clockText());
      if (this.defense.active) {
        const boss = this.defense.boss && !this.defense.boss.dead ? this.defense.boss : null;
        this.ui.setRaid(true, this.defense.bannerHp, this.defense.bannerMaxHp, boss?.hp, boss?.maxHp);
      } else {
        this.ui.setRaid(false);
      }
      const bp = this.blueprints.active;
      if (bp) {
        const remaining = this.blueprints.remainingMaterials();
        const total = bp.cells.length;
        const done = bp.cells.filter((c) => !c.ghost.visible).length;
        this.ui.setBlueprint(bp.name, remaining, done, total);
      } else {
        this.ui.setBlueprint(null);
      }

      // Autosave.
      this.autosaveTimer -= dt;
      if (this.autosaveTimer <= 0) {
        this.autosaveTimer = 30;
        this.autosave();
      }
    } else {
      // Title: slow orbit around the island.
      this.cameraYawTarget += dt * 0.05;
    }

    this.applySky();
    this.props.update(dt, this.player.pos, this.daynight.isNight);
    this.blueprints.update(time);
    this.chunks.flushDirty();
    this.updateCamera(dt);
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }
}

new Game();
