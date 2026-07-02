import { ITEMS, RECIPES, itemIcon } from "../game/items.js";
import { SFX } from "../game/sfx.js";

function el(tag, className, parent, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  if (parent) parent.appendChild(node);
  return node;
}

export class UI {
  constructor() {
    const root = el("div", "ui-root", document.body);
    this.root = root;

    // HUD ---------------------------------------------------------------------
    this.hud = el("div", "hud", root);
    this.hearts = el("div", "hearts", this.hud);
    this.objective = el("div", "objective", this.hud);
    this.clock = el("div", "clock", this.hud);
    this.baseChip = el("div", "base-chip", this.hud);
    this.raidBar = el("div", "raid-bar hidden", this.hud);
    this.raidBar.innerHTML = `<div class="raid-label">🚩 職業の旗</div><div class="bar"><div class="fill"></div></div>
      <div class="raid-label boss-label hidden">👑 書喰いのスライム</div><div class="bar boss-bar hidden"><div class="fill boss-fill"></div></div>`;
    this.hotbar = el("div", "hotbar", this.hud);
    this.hotbarSlots = [];
    for (let i = 0; i < 8; i += 1) {
      const slot = el("div", "slot", this.hotbar);
      slot.dataset.index = i;
      el("span", "key", slot, String(i + 1));
      el("img", "icon", slot);
      el("span", "count", slot);
      slot.addEventListener("click", () => this.hooks.selectHotbar?.(i));
      this.hotbarSlots.push(slot);
    }
    this.heldName = el("div", "held-name", this.hud);
    this.toasts = el("div", "toasts", root);
    this.blueprintPanel = el("div", "blueprint-panel hidden", root);

    // Dialogue ------------------------------------------------------------------
    this.dialogueBox = el("div", "dialogue hidden", root);
    this.dialogueName = el("div", "dlg-name", this.dialogueBox);
    this.dialogueText = el("div", "dlg-text", this.dialogueBox);
    this.dialogueNext = el("div", "dlg-next", this.dialogueBox, "▼");
    this.choiceBox = el("div", "choice hidden", root);
    this.dialogue = new Dialogue(this);

    // Menu (inventory + crafting) -------------------------------------------------
    this.menu = el("div", "overlay menu hidden", root);
    this.menu.innerHTML = `
      <div class="panel">
        <div class="panel-title">📦 もちもの と クラフト <span class="hint">E / Esc で閉じる</span></div>
        <div class="menu-columns">
          <div class="inv-side"><div class="section-label">もちもの（クリックで入れ替え）</div><div class="inv-grid"></div>
          <div class="equip-info"></div></div>
          <div class="craft-side"><div class="section-label craft-station"></div><div class="craft-list"></div></div>
        </div>
      </div>`;
    this.invGrid = this.menu.querySelector(".inv-grid");
    this.craftList = this.menu.querySelector(".craft-list");
    this.craftStation = this.menu.querySelector(".craft-station");
    this.equipInfo = this.menu.querySelector(".equip-info");
    this.menuOpen = false;
    this.swapFrom = null;

    // Book revival cutscene --------------------------------------------------------
    this.bookOverlay = el("div", "overlay book hidden", root);

    // Title / ending / fade / help ------------------------------------------------
    this.title = el("div", "overlay title hidden", root);
    this.ending = el("div", "overlay ending hidden", root);
    this.help = el("div", "overlay help hidden", root);
    this.pause = el("div", "overlay pause hidden", root);
    this.fadeEl = el("div", "fade", root);

    this.hooks = {}; // set by main: selectHotbar, craft, swapSlots, saveGame, quitToTitle
    this.setBaseLevel(0);

    this.menu.addEventListener("click", (e) => e.stopPropagation());
  }

  get modalOpen() {
    return (
      this.menuOpen ||
      this.dialogue.open ||
      !this.title.classList.contains("hidden") ||
      !this.ending.classList.contains("hidden") ||
      !this.help.classList.contains("hidden") ||
      !this.pause.classList.contains("hidden") ||
      !this.bookOverlay.classList.contains("hidden") ||
      !this.choiceBox.classList.contains("hidden")
    );
  }

  // --- HUD ------------------------------------------------------------------------

  setHp(hp, max) {
    const hearts = Math.ceil(max / 4);
    let html = "";
    for (let i = 0; i < hearts; i += 1) {
      const v = Math.max(0, Math.min(4, hp - i * 4));
      const cls = v >= 4 ? "full" : v >= 2 ? "half" : "empty";
      html += `<span class="heart ${cls}">${v >= 2 ? "❤" : "🖤"}</span>`;
    }
    this.hearts.innerHTML = html;
  }

  setObjective(text) {
    if (this.objective.textContent !== text) this.objective.textContent = text;
  }

  setClock(text) {
    if (this.clock.textContent !== text) this.clock.textContent = text;
  }

  setBaseLevel(level) {
    this.baseChip.textContent = level > 0 ? `🚩 拠点レベル ${level}` : "";
  }

  setHotbar(inventory) {
    for (let i = 0; i < 8; i += 1) {
      const slot = this.hotbarSlots[i];
      const s = inventory.slots[i];
      const img = slot.querySelector(".icon");
      const count = slot.querySelector(".count");
      slot.classList.toggle("selected", inventory.selected === i);
      if (s) {
        img.src = itemIcon(s.id);
        img.style.display = "";
        count.textContent = s.count > 1 ? s.count : "";
      } else {
        img.style.display = "none";
        count.textContent = "";
      }
    }
    const held = inventory.slots[inventory.selected];
    this.heldName.textContent = held ? ITEMS[held.id].name : "";
  }

  setRaid(active, hp, max, bossHp, bossMax) {
    this.raidBar.classList.toggle("hidden", !active);
    if (!active) return;
    this.raidBar.querySelector(".fill").style.width = `${(hp / max) * 100}%`;
    const bossLabel = this.raidBar.querySelector(".boss-label");
    const bossBar = this.raidBar.querySelector(".boss-bar");
    const showBoss = bossHp != null;
    bossLabel.classList.toggle("hidden", !showBoss);
    bossBar.classList.toggle("hidden", !showBoss);
    if (showBoss) this.raidBar.querySelector(".boss-fill").style.width = `${(bossHp / bossMax) * 100}%`;
  }

  toast(text, duration = 3600) {
    const node = el("div", "toast", this.toasts, text);
    requestAnimationFrame(() => node.classList.add("show"));
    setTimeout(() => {
      node.classList.remove("show");
      setTimeout(() => node.remove(), 400);
    }, duration);
  }

  setBlueprint(name, materials, done, total) {
    if (!name) {
      this.blueprintPanel.classList.add("hidden");
      return;
    }
    this.blueprintPanel.classList.remove("hidden");
    let rows = "";
    if (materials) {
      for (const [itemId, count] of materials) {
        rows += `<div class="bp-row"><img src="${itemIcon(itemId)}"><span>${ITEMS[itemId].name}</span><b>あと${count}</b></div>`;
      }
    }
    if (!rows) rows = `<div class="bp-row">✨ 完成まぢか！</div>`;
    this.blueprintPanel.innerHTML = `<div class="bp-title">📐 設計図：${name}（${done}/${total}）</div>${rows}`;
  }

  // --- menu -------------------------------------------------------------------------

  toggleMenu(ctx) {
    if (this.menuOpen) this.closeMenu();
    else this.openMenu(ctx);
  }

  openMenu(ctx) {
    this.menuOpen = true;
    this.menuCtx = ctx;
    this.menu.classList.remove("hidden");
    this.renderMenu();
  }

  closeMenu() {
    this.menuOpen = false;
    this.swapFrom = null;
    this.menu.classList.add("hidden");
  }

  renderMenu() {
    const { inventory, nearBench, stageIdx, stageIndexOf } = this.menuCtx;
    this.invGrid.innerHTML = "";
    inventory.slots.forEach((s, i) => {
      const cell = el("div", `inv-cell${i < 8 ? " hotbar-cell" : ""}${this.swapFrom === i ? " swap" : ""}`, this.invGrid);
      if (s) {
        el("img", "", cell).src = itemIcon(s.id);
        if (s.count > 1) el("span", "count", cell, s.count);
        cell.title = ITEMS[s.id].name;
      }
      cell.addEventListener("click", () => {
        if (this.swapFrom == null) {
          if (s) {
            this.swapFrom = i;
            this.renderMenu();
          }
        } else {
          this.hooks.swapSlots?.(this.swapFrom, i);
          this.swapFrom = null;
          this.renderMenu();
        }
      });
    });

    this.craftStation.textContent = nearBench ? "🛠️ クラフト（作業台）" : "🖐️ クラフト（手作業）※作業台の近くでレシピが増える";
    this.craftList.innerHTML = "";
    for (const recipe of RECIPES) {
      if (stageIndexOf(recipe.unlock) > stageIdx) continue;
      if (recipe.station === "bench" && !nearBench) continue;
      const can = inventory.canCraft(recipe);
      const row = el("div", `craft-row${can ? "" : " disabled"}`, this.craftList);
      const costHtml = Object.entries(recipe.cost)
        .map(([id, n]) => `<span class="cost${inventory.count(id) >= n ? "" : " lack"}">${ITEMS[id].name}×${n}</span>`)
        .join(" ");
      row.innerHTML = `<img src="${itemIcon(recipe.out)}"><div class="craft-info"><b>${ITEMS[recipe.out].name}${recipe.n > 1 ? `×${recipe.n}` : ""}</b><div class="costs">${costHtml}</div></div><button>${can ? "作る" : "材料不足"}</button>`;
      row.querySelector("button").addEventListener("click", () => {
        if (this.hooks.craft?.(recipe)) {
          SFX.craft();
          this.renderMenu();
        }
      });
    }

    const capeOwned = inventory.has("cape");
    this.equipInfo.innerHTML = capeOwned
      ? `🧣 こうもりのマント装備中（防御+2 / さいだいHP+6）`
      : `そうび：なし（マントを作ると防御アップ）`;
  }

  // --- special overlays ----------------------------------------------------------------

  showBookRevival(bookName, cb) {
    this.bookOverlay.classList.remove("hidden");
    this.bookOverlay.innerHTML = `
      <div class="book-panel">
        <div class="book-title">📖 ${bookName}</div>
        <div class="book-page">白紙のページに 光の文字が もどっていく……</div>
        <div class="book-bar"><div class="book-fill"></div></div>
      </div>`;
    const fill = this.bookOverlay.querySelector(".book-fill");
    requestAnimationFrame(() => {
      fill.style.width = "100%";
    });
    setTimeout(() => {
      this.bookOverlay.classList.add("flash");
      setTimeout(() => {
        this.bookOverlay.classList.add("hidden");
        this.bookOverlay.classList.remove("flash");
        cb();
      }, 700);
    }, 2600);
  }

  showTitle({ hasSave, onNew, onContinue }) {
    this.title.classList.remove("hidden");
    this.title.innerHTML = `
      <div class="title-inner">
        <div class="title-sub">ドラゴンクエストビルダーズ・オマージュ</div>
        <div class="title-logo">職をつぐ者</div>
        <div class="title-sub2">〜ジパング復興編〜</div>
        <div class="title-buttons">
          <button class="btn-new">はじめから</button>
          <button class="btn-continue" ${hasSave ? "" : "disabled"}>つづきから</button>
          <button class="btn-help">そうさ方法</button>
        </div>
        <div class="title-copy">勇者は、闇を払った。だが、光の中で生きる術は失われた。</div>
      </div>`;
    this.title.querySelector(".btn-new").addEventListener("click", () => {
      this.title.classList.add("hidden");
      onNew();
    });
    this.title.querySelector(".btn-continue").addEventListener("click", () => {
      if (!hasSave) return;
      this.title.classList.add("hidden");
      onContinue();
    });
    this.title.querySelector(".btn-help").addEventListener("click", () => this.showHelp());
  }

  showHelp() {
    this.help.classList.remove("hidden");
    this.help.innerHTML = `
      <div class="panel help-panel">
        <div class="panel-title">そうさ方法 <span class="hint">クリックで閉じる</span></div>
        <div class="help-grid">
          <div><b>WASD / 矢印</b> 移動</div><div><b>Space</b> ジャンプ</div>
          <div><b>左クリック</b> 叩く・置く・攻撃</div><div><b>右クリック / F</b> 調べる・話す</div>
          <div><b>1〜8 / ホイール</b> 持ち物選択</div><div><b>E</b> もちもの・クラフト</div>
          <div><b>Q / [ / ]</b> カメラ回転（8方向）</div><div><b>B</b> 職業の書</div>
          <div><b>M</b> サウンドON/OFF</div><div><b>Esc</b> ポーズ（セーブ）</div>
        </div>
        <div class="help-tips">💡 ハンマーでブロックを壊し、素材を集めて建築しよう。夜は魔物が強くなるぞ！</div>
      </div>`;
    this.help.addEventListener("click", () => this.help.classList.add("hidden"), { once: true });
  }

  showPause(onSave, onResume) {
    this.pause.classList.remove("hidden");
    this.pause.innerHTML = `
      <div class="panel pause-panel">
        <div class="panel-title">⏸ ポーズ</div>
        <button class="btn-save">セーブする</button>
        <button class="btn-help2">そうさ方法</button>
        <button class="btn-resume">ゲームにもどる</button>
      </div>`;
    this.pause.querySelector(".btn-save").addEventListener("click", () => {
      const ok = onSave();
      this.toast(ok ? "💾 セーブしました" : "⚠️ セーブに失敗しました");
    });
    this.pause.querySelector(".btn-help2").addEventListener("click", () => this.showHelp());
    this.pause.querySelector(".btn-resume").addEventListener("click", () => {
      this.pause.classList.add("hidden");
      onResume?.();
    });
  }

  hidePause() {
    this.pause.classList.add("hidden");
  }

  showJobBook(books) {
    this.bookOverlay.classList.remove("hidden");
    let rows = "";
    for (const b of books) {
      rows += `
        <div class="jobbook-row${b.revived ? " revived" : ""}">
          <div class="book-title small">📖 ${b.name}</div>
          <div class="book-desc">${b.desc}</div>
          <div class="book-bar"><div class="book-fill" style="width:${b.progress * 100}%"></div></div>
        </div>`;
    }
    this.bookOverlay.innerHTML = `<div class="book-panel">
      <div class="book-title">職業の書 <span class="hint">B / クリックで閉じる</span></div>${rows}</div>`;
    this.bookOverlay.addEventListener("click", () => this.bookOverlay.classList.add("hidden"), { once: true });
  }

  hideJobBook() {
    this.bookOverlay.classList.add("hidden");
  }

  playEnding(cb) {
    this.ending.classList.remove("hidden");
    this.ending.innerHTML = `
      <div class="ending-scroll">
        <p>勇者は、闇を払った。</p>
        <p>だが、光の中で生きる術は失われた。</p>
        <p>&nbsp;</p>
        <p>ダーマ神殿は崩れ、職業の書は焼かれた。</p>
        <p>人々は何者にもなれず、町は壊れたまま時を止めた。</p>
        <p>&nbsp;</p>
        <p>ただ一冊だけ残された、古びた「ビルダーの書」。</p>
        <p>それを手にした神官見習いは、流れ着いたジパングで槌を取った。</p>
        <p>&nbsp;</p>
        <p>家を建て、田を耕し、柵をめぐらせ、祈りの場を作った。</p>
        <p>人々が働き始めた時、白紙の職業の書に文字が戻った。</p>
        <p>&nbsp;</p>
        <p>これは、勇者のいない上の世界で、</p>
        <p>人々がもう一度、自分の職を取り戻す物語。</p>
        <p>&nbsp;</p>
        <p class="ending-title">職をつぐ者 〜ジパング復興編〜</p>
        <p>&nbsp;</p>
        <p>― 新ダーマ神殿を建てる旅が、いま始まる ―</p>
        <p class="ending-hint">（クリックで つづける）</p>
      </div>`;
    const close = () => {
      this.ending.classList.add("hidden");
      cb();
    };
    setTimeout(() => this.ending.addEventListener("click", close, { once: true }), 4000);
  }

  fade(toBlack, duration = 600) {
    return new Promise((resolve) => {
      this.fadeEl.style.transitionDuration = `${duration}ms`;
      this.fadeEl.style.opacity = toBlack ? "1" : "0";
      setTimeout(resolve, duration);
    });
  }
}

// --- dialogue ---------------------------------------------------------------------

class Dialogue {
  constructor(ui) {
    this.ui = ui;
    this.open = false;
    this.lines = [];
    this.index = 0;
    this.charT = 0;
    this.done = null;
    this.typing = false;
    this.fullText = "";
    this.shown = 0;

    const advance = () => this.advance();
    ui.dialogueBox.addEventListener("click", advance);
    window.addEventListener("keydown", (e) => {
      if (!this.open) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "enter" || k === "z") {
        e.preventDefault();
        advance();
      }
    });
  }

  play(lines, done) {
    this.lines = lines;
    this.index = 0;
    this.done = done;
    this.open = true;
    this.ui.dialogueBox.classList.remove("hidden");
    this.showLine();
  }

  showLine() {
    const line = this.lines[this.index];
    this.ui.dialogueName.textContent = line.speaker;
    this.ui.dialogueName.style.display = line.speaker ? "" : "none";
    this.fullText = line.text;
    this.shown = 0;
    this.typing = true;
    this.ui.dialogueNext.style.visibility = "hidden";
    SFX.talk();
    const tick = () => {
      if (!this.typing) return;
      this.shown = Math.min(this.fullText.length, this.shown + 2);
      this.ui.dialogueText.textContent = this.fullText.slice(0, this.shown);
      if (this.shown >= this.fullText.length) {
        this.typing = false;
        this.ui.dialogueNext.style.visibility = "visible";
      } else {
        setTimeout(tick, 28);
      }
    };
    tick();
  }

  advance() {
    if (!this.open) return;
    if (this.typing) {
      this.typing = false;
      this.ui.dialogueText.textContent = this.fullText;
      this.ui.dialogueNext.style.visibility = "visible";
      return;
    }
    this.index += 1;
    if (this.index >= this.lines.length) {
      this.open = false;
      this.ui.dialogueBox.classList.add("hidden");
      const cb = this.done;
      this.done = null;
      if (cb) cb();
    } else {
      this.showLine();
    }
  }

  choice(prompt, options, cb) {
    const box = this.ui.choiceBox;
    box.classList.remove("hidden");
    box.innerHTML = `<div class="choice-panel"><div class="choice-prompt">${prompt}</div></div>`;
    const panel = box.querySelector(".choice-panel");
    options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.textContent = opt;
      btn.addEventListener("click", () => {
        box.classList.add("hidden");
        cb(i);
      });
      panel.appendChild(btn);
    });
  }
}
