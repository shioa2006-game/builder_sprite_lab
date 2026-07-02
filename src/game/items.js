import { B, drawTileIcon } from "../world/blocks.js";

// kind: block | tool | weapon | armor | food | material
// tool: { tier, speed } hammers. weapon: { atk }. food: { heal }.
export const ITEMS = {
  // placeable blocks
  dirt: { name: "土", kind: "block", block: B.DIRT, tile: "dirt", stack: 99 },
  stone: { name: "石", kind: "block", block: B.STONE, tile: "stone", stack: 99 },
  sand: { name: "すな", kind: "block", block: B.SAND, tile: "sand", stack: 99 },
  log: { name: "木材", kind: "block", block: B.LOG, tile: "log_side", stack: 99 },
  plank: { name: "板材", kind: "block", block: B.PLANK, tile: "plank", stack: 99 },
  wall: { name: "白かべ", kind: "block", block: B.WALL, tile: "wall", stack: 99 },
  thatch: { name: "かやぶき", kind: "block", block: B.THATCH, tile: "thatch", stack: 99 },
  farmland: { name: "耕した土", kind: "block", block: B.FARMLAND, tile: "farmland", stack: 99 },
  fence: { name: "柵", kind: "block", block: B.FENCE, icon: "🪵", stack: 99 },
  spikes: { name: "とげ罠", kind: "block", block: B.SPIKES, icon: "📌", stack: 99 },
  torch: { name: "たいまつ", kind: "block", block: B.TORCH, icon: "🔥", stack: 99 },
  door: { name: "木の扉", kind: "block", block: B.DOOR, icon: "🚪", stack: 20 },
  workbench: { name: "作業台", kind: "block", block: B.WORKBENCH, icon: "🛠️", stack: 5 },
  bed: { name: "わらのベッド", kind: "block", block: B.BED, icon: "🛏️", stack: 10 },
  altar: { name: "職業の祭壇", kind: "block", block: B.ALTAR, icon: "🔮", stack: 3 },
  torii: { name: "鳥居", kind: "block", block: B.TORII, icon: "⛩️", stack: 5 },
  scarecrow: { name: "かかし", kind: "block", block: B.SCARECROW, icon: "🎃", stack: 5 },
  // materials
  straw: { name: "わら", kind: "material", icon: "🌾", stack: 99 },
  copper: { name: "銅こうせき", kind: "material", icon: "🟠", stack: 99 },
  jelly: { name: "スライムゼリー", kind: "material", icon: "🫧", stack: 99 },
  wing: { name: "こうもりのはね", kind: "material", icon: "🦇", stack: 99 },
  rice: { name: "米", kind: "material", icon: "🍚", stack: 99 },
  seed: { name: "種もみ", kind: "seed", icon: "🌱", stack: 99 },
  // tools / weapons / armor
  hammer_wood: { name: "木のハンマー", kind: "tool", tier: 0, speed: 1, icon: "🔨" },
  hammer_stone: { name: "石のハンマー", kind: "tool", tier: 1, speed: 2, icon: "⚒️" },
  club: { name: "こん棒", kind: "weapon", atk: 2, icon: "🏏" },
  sword_stone: { name: "石の剣", kind: "weapon", atk: 4, icon: "🗡️" },
  sword_copper: { name: "銅の剣", kind: "weapon", atk: 7, icon: "⚔️" },
  cape: { name: "こうもりのマント", kind: "armor", def: 2, hp: 6, icon: "🧣" },
  // food
  herb: { name: "やくそう", kind: "food", heal: 5, icon: "🌿", stack: 99 },
  onigiri: { name: "おにぎり", kind: "food", heal: 12, icon: "🍙", stack: 99 },
};

// unlock: quest stage id at which the recipe appears (see quests.js STAGES).
export const RECIPES = [
  { out: "workbench", n: 1, cost: { log: 3 }, station: "hand", unlock: "GATHER_WOOD" },
  { out: "plank", n: 4, cost: { log: 1 }, station: "bench", unlock: "BUILD_HUT" },
  { out: "door", n: 1, cost: { plank: 2 }, station: "bench", unlock: "BUILD_HUT" },
  { out: "bed", n: 1, cost: { plank: 2, straw: 2 }, station: "bench", unlock: "BUILD_HUT" },
  { out: "torch", n: 2, cost: { log: 1, jelly: 1 }, station: "bench", unlock: "BUILD_HUT" },
  { out: "club", n: 1, cost: { log: 2 }, station: "bench", unlock: "BUILD_HUT" },
  { out: "wall", n: 2, cost: { dirt: 2 }, station: "bench", unlock: "BUILD_HUT" },
  { out: "farmland", n: 2, cost: { dirt: 2 }, station: "bench", unlock: "BUILD_FARM" },
  { out: "fence", n: 3, cost: { log: 2 }, station: "bench", unlock: "BUILD_FARM" },
  { out: "scarecrow", n: 1, cost: { log: 2, straw: 2 }, station: "bench", unlock: "BUILD_FARM" },
  { out: "hammer_stone", n: 1, cost: { stone: 3, log: 2 }, station: "bench", unlock: "BUILD_FARM" },
  { out: "sword_stone", n: 1, cost: { stone: 3, log: 1 }, station: "bench", unlock: "FARMING" },
  { out: "onigiri", n: 1, cost: { rice: 2 }, station: "hand", unlock: "PREPARE" },
  { out: "sword_copper", n: 1, cost: { copper: 3, log: 1 }, station: "bench", unlock: "PREPARE" },
  { out: "cape", n: 1, cost: { wing: 4, jelly: 2 }, station: "bench", unlock: "PREPARE" },
  { out: "spikes", n: 2, cost: { stone: 2, jelly: 1 }, station: "bench", unlock: "PREPARE" },
  { out: "thatch", n: 2, cost: { straw: 2 }, station: "bench", unlock: "BUILD_SHRINE" },
  { out: "altar", n: 1, cost: { stone: 3, copper: 1 }, station: "bench", unlock: "BUILD_SHRINE" },
  { out: "torii", n: 1, cost: { log: 4 }, station: "bench", unlock: "BUILD_SHRINE" },
];

// Item id for a block id (for drops / blueprint material lists).
export function itemForBlock(blockId) {
  for (const [id, def] of Object.entries(ITEMS)) {
    if (def.kind === "block" && def.block === blockId) return id;
  }
  return null;
}

const iconCache = new Map();

// 36px icon as a data URL: atlas tile for textured blocks, emoji otherwise.
export function itemIcon(itemId) {
  if (iconCache.has(itemId)) return iconCache.get(itemId);
  const def = ITEMS[itemId];
  const canvas = document.createElement("canvas");
  canvas.width = 36;
  canvas.height = 36;
  const ctx = canvas.getContext("2d");
  if (def.tile) {
    drawTileIcon(ctx, def.tile, 2, 2, 32);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.strokeRect(2.5, 2.5, 31, 31);
  } else {
    ctx.font = "26px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.icon ?? "❓", 18, 20);
  }
  const url = canvas.toDataURL();
  iconCache.set(itemId, url);
  return url;
}

export class Inventory {
  constructor(size = 24) {
    this.slots = new Array(size).fill(null); // {id, count}
    this.hotbarSize = 8;
    this.selected = 0;
    this.listeners = [];
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }

  count(id) {
    return this.slots.reduce((sum, s) => sum + (s && s.id === id ? s.count : 0), 0);
  }

  add(id, n = 1) {
    const stack = ITEMS[id].stack ?? 1;
    let left = n;
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.id === id && s.count < stack) {
        const take = Math.min(stack - s.count, left);
        s.count += take;
        left -= take;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i += 1) {
      if (!this.slots[i]) {
        const take = Math.min(stack, left);
        this.slots[i] = { id, count: take };
        left -= take;
      }
    }
    this.emit();
    return left === 0;
  }

  remove(id, n = 1) {
    if (this.count(id) < n) return false;
    let left = n;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i -= 1) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, left);
        s.count -= take;
        left -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this.emit();
    return true;
  }

  removeFromSlot(index, n = 1) {
    const s = this.slots[index];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[index] = null;
    this.emit();
  }

  held() {
    return this.slots[this.selected];
  }

  has(id, n = 1) {
    return this.count(id) >= n;
  }

  canCraft(recipe) {
    return Object.entries(recipe.cost).every(([id, n]) => this.count(id) >= n);
  }

  craft(recipe) {
    if (!this.canCraft(recipe)) return false;
    for (const [id, n] of Object.entries(recipe.cost)) this.remove(id, n);
    this.add(recipe.out, recipe.n);
    return true;
  }

  serialize() {
    return { slots: this.slots, selected: this.selected };
  }

  load(data) {
    if (!data) return;
    this.slots = data.slots.map((s) => (s ? { ...s } : null));
    while (this.slots.length < 24) this.slots.push(null);
    this.selected = data.selected ?? 0;
    this.emit();
  }
}
