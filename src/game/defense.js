import { PLACES } from "../world/world.js";
import { SFX } from "./sfx.js";

// Base-defense raid event: waves of monsters converge on the banner.

const WAVES = [
  { label: "第1波", spawns: [["slime", 5]] },
  { label: "第2波", spawns: [["slime", 3], ["bat", 4]] },
  { label: "最終波", spawns: [["boss", 1], ["slime", 2], ["bat", 2]] },
];

// Spawn gates around the plateau (resolved to ground height at spawn time).
const GATES = [
  { x: 32, z: 26 },
  { x: 16, z: 44 },
  { x: 46, z: 48 },
];

export class DefenseEvent {
  constructor(monsterManager, world) {
    this.monsters = monsterManager;
    this.world = world;
    this.active = false;
    this.wave = 0;
    this.bannerHp = 100;
    this.bannerMaxHp = 100;
    this.interWave = 0;
    this.onEnd = null;
    this.boss = null;
  }

  start() {
    this.active = true;
    this.wave = 0;
    this.bannerHp = this.bannerMaxHp;
    this.interWave = 2.5;
    this.boss = null;
    SFX.raidHorn();
  }

  spawnWave(index) {
    const def = WAVES[index];
    let gateIndex = 0;
    for (const [type, count] of def.spawns) {
      for (let i = 0; i < count; i += 1) {
        const gate = GATES[gateIndex % GATES.length];
        gateIndex += 1;
        const x = gate.x + (Math.random() - 0.5) * 4;
        const z = gate.z + (Math.random() - 0.5) * 4;
        const y = this.world.terrainSurfaceY(x, z);
        const m = this.monsters.spawn(type, x, y + (type === "bat" ? 2 : 0.2), z, { raid: true });
        if (type === "boss") this.boss = m;
      }
    }
    return def.label;
  }

  damageBanner(amount) {
    if (!this.active) return;
    this.bannerHp = Math.max(0, this.bannerHp - amount);
    SFX.hurt();
    if (this.bannerHp <= 0) this.finish(false);
  }

  update(dt, ui) {
    if (!this.active) return;
    if (this.interWave > 0) {
      this.interWave -= dt;
      if (this.interWave <= 0) {
        const label = this.spawnWave(this.wave);
        ui.toast(`⚔️ ${label}が やってきた！`);
        SFX.raidHorn();
      }
      return;
    }
    if (this.monsters.count(true) === 0) {
      this.wave += 1;
      if (this.wave >= WAVES.length) {
        this.finish(true);
      } else {
        this.interWave = 4;
        ui.toast(`🛡️ ${WAVES[this.wave].label}が せまっている……！`);
      }
    }
  }

  finish(win) {
    this.active = false;
    // Clear any leftover raiders.
    for (const m of [...this.monsters.monsters]) {
      if (m.raid) this.monsters.remove(m);
    }
    this.boss = null;
    if (this.onEnd) this.onEnd(win);
  }
}
