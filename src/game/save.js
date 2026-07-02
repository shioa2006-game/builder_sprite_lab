// localStorage save / load. Only diffs from the generated world are stored.

const KEY = "shoku_wo_tsugumono_save_v1";

export function hasSave() {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function writeSave(game) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      stage: game.quests.serialize(),
      inventory: game.inventory.serialize(),
      player: {
        pos: [game.player.pos.x, game.player.pos.y, game.player.pos.z],
        hp: game.player.hp,
      },
      time: { hour: game.daynight.hour, day: game.daynight.day },
      baseLevel: game.baseLevel,
      villagers: game.villagers.map((v) => ({ id: v.id, pos: [v.pos.x, v.pos.y, v.pos.z] })),
      blueprint: game.blueprints.active
        ? { id: game.blueprints.active.id }
        : null,
      blueprintsDone: [...game.blueprints.completed],
      edits: game.world.serializeEdits(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn("save failed", err);
    return false;
  }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
