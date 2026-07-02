import { PLACES } from "../world/world.js";
import { SFX } from "./sfx.js";

// Linear story stages, in order.
export const STAGE_ORDER = [
  "INTRO",
  "GATHER_WOOD",
  "CRAFT_BENCH",
  "PLACE_BENCH",
  "BUILD_HUT",
  "MEET_MINA",
  "BUILD_FARM",
  "FARMING",
  "HARVEST",
  "PREPARE",
  "DEFENSE",
  "BUILD_SHRINE",
  "SHRINE_DONE",
  "POSTGAME",
];

export const stageIndex = (s) => STAGE_ORDER.indexOf(s);

const D = (speaker, text) => ({ speaker, text });
const HERO = "シオン"; // the apprentice priest protagonist
const BOOK = "ビルダーの書";

export class QuestManager {
  constructor(game) {
    this.game = game; // facade provided by main.js
    this.stage = "INTRO";
    this.counters = { planted: 0, harvested: 0 };
    this.flags = {};
    this.busy = false; // a cutscene/dialogue is running
  }

  setStage(stage, silent = false) {
    this.stage = stage;
    this.game.onStageChanged();
    if (!silent) {
      const text = this.objectiveText();
      if (text) this.game.ui.toast(`🪶 ${text}`);
    }
  }

  objectiveText() {
    const c = this.counters;
    switch (this.stage) {
      case "GATHER_WOOD":
        return `木を叩いて 木材を集めよう（${Math.min(5, this.game.inventory.count("log"))}/5）`;
      case "CRAFT_BENCH":
        return "メニュー(E)で 作業台を作ろう";
      case "PLACE_BENCH":
        return "作業台を地面に置こう";
      case "BUILD_HUT":
        return "設計図どおりに 小屋を建てよう";
      case "MEET_MINA":
        return "ミナと話そう（！マーク）";
      case "BUILD_FARM":
        return "設計図どおりに 畑を作ろう";
      case "FARMING":
        return `畑に種もみを植えよう（${Math.min(8, c.planted)}/8）`;
      case "HARVEST":
        return `実った稲を収穫しよう（${Math.min(8, c.harvested)}/8）`;
      case "PREPARE":
        return "防衛のそなえをして ゴンタに話しかけよう";
      case "DEFENSE":
        return "職業の旗を守りぬけ！";
      case "BUILD_SHRINE":
        return "山の予定地に 職業の社を建てよう";
      case "SHRINE_DONE":
        return "社の祭壇に 祈りをささげよう";
      case "POSTGAME":
        return "ジパングの復興は続く…（自由に建築しよう）";
      default:
        return "";
    }
  }

  // --- cutscenes -----------------------------------------------------------------

  startIntro() {
    this.busy = true;
    this.game.ui.dialogue.play(
      [
        D("", "……波の音が聞こえる。"),
        D(HERO, "「ここは……どこだ？　そうだ、ダーマ神殿が魔物に襲われて……海に投げ出されたんだ」"),
        D(HERO, "「神殿は焼け、職業の書も失われた。神官見習いの私が、たった一人だけ生き残ってしまった……」"),
        D("？？？", "「――嘆くな、若き見習いよ」"),
        D(BOOK, "「わしは ビルダーの書。すべての職業の根にある、原初の書じゃ」"),
        D(BOOK, "「見よ、この島ジパングも魔物に荒らされ、人々は職を失い、何も作れなくなっておる」"),
        D(BOOK, "「じゃが、職業の書は 人々が働き、町を作る時にこそ よみがえる。おぬしが最初のビルダーとなるのじゃ！」"),
        D(HERO, "「私が……ビルダーに……。わかった、やってみるよ！」"),
        D(BOOK, "「うむ。まずは 木材 じゃ。ハンマーで木を叩いて 木材を5つ 集めるのじゃ！」"),
      ],
      () => {
        this.busy = false;
        this.setStage("GATHER_WOOD");
      },
    );
  }

  // Called every frame by the game loop.
  update() {
    if (this.busy) return;
    switch (this.stage) {
      case "GATHER_WOOD":
        this.game.ui.setObjective(this.objectiveText());
        if (this.game.inventory.count("log") >= 5) {
          this.busy = true;
          this.game.ui.dialogue.play(
            [
              D(BOOK, "「よし、良い木材じゃ。次は ものづくりの心臓、作業台 を作るぞ」"),
              D(BOOK, "「Eキーでメニューを開き、木材3つで 作業台 を作るのじゃ」"),
            ],
            () => {
              this.busy = false;
              this.setStage("CRAFT_BENCH");
            },
          );
        }
        break;
      case "FARMING":
        this.game.ui.setObjective(this.objectiveText());
        if (this.counters.planted >= 8) {
          this.busy = true;
          this.game.ui.dialogue.play(
            [
              D("ミナ", "「植え終わったね！　あとは水をやって育てるだけ。おばあちゃんに聞いたとおりだわ」"),
              D("ミナ", "「お世話はわたしに任せて。育つまでのあいだ、シオンは島の探検でもしてきたら？」"),
              D(BOOK, "「稲が実ったら収穫じゃ。金色に実った稲を 8つ 刈り取るのじゃ！」"),
            ],
            () => {
              this.busy = false;
              this.setStage("HARVEST");
            },
          );
        }
        break;
      case "HARVEST":
        this.game.ui.setObjective(this.objectiveText());
        if (this.counters.harvested >= 8) this.reviveFarmerBook();
        break;
      default:
        this.game.ui.setObjective(this.objectiveText());
    }
  }

  onCrafted(itemId) {
    if (this.stage === "CRAFT_BENCH" && itemId === "workbench") {
      this.setStage("PLACE_BENCH");
    }
  }

  onBlockPlaced(blockName) {
    if (this.stage === "PLACE_BENCH" && blockName === "workbench") {
      this.busy = true;
      this.game.ui.dialogue.play(
        [
          D(BOOK, "「見事じゃ！　これでいろんな物が作れるようになった」"),
          D(BOOK, "「次はいよいよ建築じゃ。浜の高台に 小屋の設計図 を広げたぞ」"),
          D(BOOK, "「白く光る場所に、同じ形のブロックをはめこんでいくのじゃ。材料は作業台で作れるぞ」"),
        ],
        () => {
          this.busy = false;
          this.game.blueprints.activate("hut", PLACES.hut, this.game.world.terrainSurfaceY(PLACES.hut.x + 2, PLACES.hut.z + 1));
          this.setStage("BUILD_HUT");
        },
      );
    }
  }

  onBlueprintComplete(id) {
    if (id === "hut" && this.stage === "BUILD_HUT") {
      this.busy = true;
      SFX.levelup();
      this.game.placeBanner();
      this.game.setBaseLevel(1);
      const pino = this.game.spawnVillager("pino", PLACES.base.x - 3, PLACES.base.z + 2);
      this.game.spawnVillager("mina", PLACES.base.x + 2, PLACES.base.z + 5);
      this.game.ui.dialogue.play(
        [
          D("？？？", "「……すごい。壊すんじゃなくて、作ってる……」"),
          D("ピノ", "「おれ、ピノ！　村が壊されてから、なにもできずにいたんだ。でも、あんたの建てた小屋を見て、体が熱くなった！」"),
          D("ピノ", "「おれを、大工見習いにしてくれ！　力仕事なら任せろ！」"),
          D(BOOK, "「うむ。人が集えば、そこはもう町じゃ。職業の旗を立てたぞ。ここが 拠点 じゃ！」"),
          D("", "🚩 拠点レベルが 1 になった！　ピノが仲間になった！"),
          D("？？？", "「あのー……」"),
          D("ミナ", "「わたし、ミナ。焼け残った家から見てたの。ねえ、お願いがあるんだけど……聞いてくれる？」"),
        ],
        () => {
          this.busy = false;
          this.setStage("MEET_MINA");
          if (pino) pino.marker.visible = false;
          const mina = this.game.villager("mina");
          if (mina) mina.marker.visible = true;
        },
      );
    }
    if (id === "farm" && this.stage === "BUILD_FARM") {
      this.busy = true;
      this.game.ui.dialogue.play(
        [
          D("ミナ", "「わあ……畑だ。ほんとうに畑ができちゃった……！」"),
          D("ミナ", "「これ、おばあちゃんの形見の 種もみ。とっておきの10粒よ。いっしょに植えましょ！」"),
          D("", "🌱 種もみ×10 を手に入れた！"),
          D(BOOK, "「種もみを手に持ち、耕した土をクリックして植えるのじゃ」"),
        ],
        () => {
          this.busy = false;
          this.game.giveItems([["seed", 10]]);
          this.setStage("FARMING");
        },
      );
    }
    if (id === "shrine" && this.stage === "BUILD_SHRINE") {
      this.busy = true;
      SFX.levelup();
      this.game.setBaseLevel(3);
      this.game.ui.dialogue.play(
        [
          D("ジンベエ", "「おお……おお……！　なんと立派な社じゃ。ダーマの神官様がたに見せてやりたいわい」"),
          D(BOOK, "「これぞ 職業の社。新しいダーマ神殿の、最初の一歩じゃ」"),
          D("", "🚩 拠点レベルが 3 になった！"),
          D(BOOK, "「さあ、祭壇の前に立ち、祈りをささげるのじゃ」"),
        ],
        () => {
          this.busy = false;
          this.setStage("SHRINE_DONE");
        },
      );
    }
  }

  onTalk(villagerId) {
    const v = this.game.villager(villagerId);
    if (this.stage === "MEET_MINA" && villagerId === "mina") {
      this.busy = true;
      v.marker.visible = false;
      this.game.ui.dialogue.play(
        [
          D("ミナ", "「うち、代々お米を作る農家だったの。でも田畑は荒らされて、用水路も壊れちゃった」"),
          D("ミナ", "「大人たちは言うの。『職業の書が焼けたから、もう農民にはなれない』って。……そんなの、おかしいよね？」"),
          D(HERO, "「……いや、おかしくない。書は失われても、働く心までは奪えない。ミナ、一緒に畑を作ろう」"),
          D(BOOK, "「拠点の東に 畑の設計図 を広げたぞ。地面を掘って 耕した土 をはめこむのじゃ」"),
        ],
        () => {
          this.busy = false;
          this.game.blueprints.activate("farm", PLACES.farm, this.game.world.terrainSurfaceY(PLACES.farm.x + 2, PLACES.farm.z + 1));
          this.setStage("BUILD_FARM");
        },
      );
      return true;
    }
    if (this.stage === "PREPARE" && villagerId === "gonta") {
      this.busy = true;
      this.game.ui.dialogue.play(
        [
          D("ゴンタ", "「偵察してきたぜ。魔物の群れが、この拠点を狙ってやがる。今夜あたり来るかもな」"),
          D("ゴンタ", "「柵やとげ罠で守りを固めろ。武器も 銅の剣 くらいは欲しい。鉱石は北の山で掘れるぜ」"),
        ],
        () => {
          this.game.ui.dialogue.choice("迎え撃つ準備はできたか？", ["やるぞ！（防衛戦を始める）", "まだ準備したい"], (i) => {
            this.busy = false;
            if (i === 0) {
              this.setStage("DEFENSE", true);
              this.game.startDefense();
            }
          });
        },
      );
      return true;
    }
    return false;
  }

  reviveFarmerBook() {
    this.busy = true;
    SFX.book();
    this.game.ui.showBookRevival("農民の書", () => {
      SFX.levelup();
      this.game.setBaseLevel(2);
      const gonta = this.game.spawnVillager("gonta", PLACES.base.x + 3, PLACES.base.z - 3);
      this.game.ui.dialogue.play(
        [
          D("", "白紙のページに、光の文字が戻っていく――"),
          D("ミナ", "「これって……農民の書！？　文字が、文字が戻ってる！」"),
          D(BOOK, "「そうじゃ。ミナが土と向き合い、働いたからこそ、書はよみがえった。ミナよ、おぬしは今日から立派な 農民 じゃ！」"),
          D("ミナ", "「わたし……農民に、なれたんだ……。えへへ、おばあちゃん、見てた？」"),
          D("", "📖 農民の書 が復活した！　🚩 拠点レベルが 2 になった！"),
          D("？？？", "「――おい！　大変だぞ！」"),
          D("ゴンタ", "「おれはゴンタ。山で狩りをしてた。……いま、魔物の群れがこっちへ向かってるのを見た！」"),
          D("ゴンタ", "「米のにおいにつられたのか、それとも……その光る書が目当てか。とにかく、戦える準備をしろ！」"),
          D(BOOK, "「魔物どもは職の復活を恐れておる。……来るぞ。柵を建て、罠をしかけ、剣を鍛えるのじゃ！」"),
        ],
        () => {
          this.busy = false;
          if (gonta) gonta.marker.visible = true;
          this.setStage("PREPARE");
        },
      );
    });
  }

  onRaidEnd(win) {
    if (this.stage !== "DEFENSE") return;
    if (win) {
      this.busy = true;
      SFX.quest();
      const jinbei = this.game.spawnVillager("jinbei", PLACES.base.x + 1, PLACES.base.z + 4);
      this.game.ui.dialogue.play(
        [
          D("ゴンタ", "「……やったか！？　やったな！！　俺たちの町を守りきったぞ！」"),
          D("ピノ", "「へへっ、おれの柵、ちゃんと役に立っただろ？」"),
          D("ミナ", "「みんな無事でよかった……。はい、おにぎり！　いっぱい食べて！」"),
          D("？？？", "「……見せてもらったよ、若い衆」"),
          D("ジンベエ", "「わしはジンベエ。この島の長老じゃった男よ。職を失い、生きる気力も失っておったが……今夜の戦いで目が覚めたわい」"),
          D("ジンベエ", "「のう、ビルダー殿。この島の山の上には、昔から 聖地 と呼ばれる場所があってな。そこに 社（やしろ）を建ててはくれんか」"),
          D(BOOK, "「職業の社――それは新しいダーマ神殿の礎じゃ。北の山の中腹に設計図を広げたぞ！」"),
          D(BOOK, "「かやぶき屋根には わら、土台には 石 がいる。石のハンマーがあれば山の岩も掘れるはずじゃ」"),
        ],
        () => {
          this.busy = false;
          if (jinbei) jinbei.marker.visible = false;
          this.game.blueprints.activate(
            "shrine",
            PLACES.shrine,
            this.game.world.terrainSurfaceY(PLACES.shrine.x + 2, PLACES.shrine.z + 2),
          );
          this.setStage("BUILD_SHRINE");
        },
      );
    } else {
      this.busy = true;
      this.game.ui.dialogue.play(
        [
          D("ゴンタ", "「くそっ、旗が倒されちまった……。だがまだ終わりじゃねえ！」"),
          D(BOOK, "「気を落とすでない。守りを立て直し、もう一度ゴンタに声をかけるのじゃ」"),
        ],
        () => {
          this.busy = false;
          this.setStage("PREPARE");
        },
      );
    }
  }

  onAltarPrayed() {
    if (this.stage !== "SHRINE_DONE") return false;
    this.busy = true;
    this.game.ui.dialogue.play(
      [
        D(HERO, "「――ダーマの神よ。ここに小さな社を建てました。ビルダーの書と、よみがえった農民の書を奉ります」"),
        D(HERO, "「職業は、神殿が一方的に授けるものじゃない。人が誰かのために働こうとした時、そこに職は生まれる……」"),
        D(HERO, "「私はそれを、この島のみんなに教わりました」"),
        D(BOOK, "「……うむ。うむ！　シオンよ、おぬしはもう見習いではない。職をつぐ者 じゃ！」"),
        D(BOOK, "「じゃが、これで終わりではないぞ。鍛冶の書、商人の書、僧侶の書……失われた書は、まだ世界中に眠っておる」"),
        D(BOOK, "「山頂に、まことの 新ダーマ神殿 を建てる旅は、ここから始まるのじゃ！」"),
      ],
      () => {
        this.game.ui.playEnding(() => {
          this.busy = false;
          this.setStage("POSTGAME");
        });
      },
    );
    return true;
  }

  serialize() {
    return { stage: this.stage, counters: this.counters, flags: this.flags };
  }

  load(data) {
    if (!data) return;
    this.stage = data.stage;
    this.counters = { ...this.counters, ...data.counters };
    this.flags = data.flags ?? {};
  }
}
