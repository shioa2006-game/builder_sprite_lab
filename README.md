# Builder Sprite Lab

three.js で 3D ブロック地形の上に「2.5D デフォルメ人形」キャラクターを表示するMVPです。
2D スプライト（頭・胴）に 3D の手足を組み合わせ、固定クォータービューで動かします。

## 起動方法

```powershell
npm.cmd install
npm.cmd run dev
```

表示されたローカルURL（通常 `http://localhost:5173/`）をブラウザで開いてください。
Windows では `start-dev.bat` をダブルクリックしても起動できます。

## ビルド

```powershell
npm.cmd run build
```

`dist/` に出力されます（`base: ""` の相対パス出力。`dist/` は `.gitignore` 済み）。

## 操作

- `W` / `ArrowUp`: 奥へ移動
- `S` / `ArrowDown`: 手前へ移動
- `A` / `ArrowLeft`: 左へ移動
- `D` / `ArrowRight`: 右へ移動
- 2キー同時押しで斜め移動（8方向）

## アセット

| ファイル | 役割 |
| --- | --- |
| `assets/player_body_8dir.png` | **使用中**。頭＋胴体を腰まで・腕脚なしの8方向シート（4列×2行）。透過付き。 |
| `assets/player_image.png` | 生成元。背景がクロマグリーンで透過なし。 |

`player_body_8dir.png` は `player_image.png` から `tools/keygreen.mjs` で生成します
（緑→アルファ変換＋エッジのデスピル）。元画像を更新したら再生成してください:

```powershell
npm.cmd install pngjs --no-save
node tools/keygreen.mjs
```

## キャラクター表現（2.5Dデフォルメ人形）

`src/main.js` で、2Dスプライトの可愛さと3Dの立体感を両立させています。

### 構成

- **頭・胴体**: 薄い `BoxGeometry`。前面（+Z）のみ `player_body_8dir.png` の該当領域を貼り、
  それ以外の面（上下・左右の側面）は非表示にしています。
  箱は絵より幅が広く、絵がセル内で片寄っているため、側面に単色を出すと横移動時に
  シルエットの外へ「色付きの厚みの帯」がはみ出します。これを避けるため面を消し、
  立体感は 3D の手足で出す設計です（`makeFaceBox` で前面以外を `hiddenFaceMaterial` に）。
- **腕・脚**: 3D。腕＝カプセル（袖）＋球（手袋）、脚＝カプセル（太もも）＋箱（ブーツ）。
  太く短いデフォルメ比率。
  - 腕は肩から外側へ開いた姿勢（`ARM_REST_TILT`）。後ろ・斜め後ろ向きでは画面上の左右が
    入れ替わるため、`setLimbLayout()` が向きごとに開く方向を取り直して常に外向きにします。
  - `setLimbLayout()` が向き（`FACING`）に応じて腕・脚を8方向で配置（正面=左右、横向き=前後の
    奥行き、斜め=中間。奥行きは `LIMB_DEPTH_SCALE` で圧縮）。
  - 脚は `LEG_LIFT` で付け根を胴へめり込ませ、`LEG_SEP` で左右を寄せます。足裏は `reach`
    （= `HIP_Y + LEG_LIFT + CHAR_CLEARANCE`）から自動計算され、常に接地します。
- **黒アウトライン**: 3D手足に `addOutline()`（BackSide黒シェル）で付与。薄いブーツは一律倍率だと
  上下の縁が痩せるため、`margin`（絶対幅）指定で各軸ほぼ一定の縁にしています。
  ※テクスチャBox（頭・胴）には付けません（前面の透明部分から黒が透けるため。スプライト側に
  もともと黒縁が描かれています）。
- **向き**: フル・ビルボードをやめ、固定ヨー（`FIXED_YAW`）でカメラ方向を向きます。8方向のコマ
  切替は前面テクスチャのUV窓（`setCellWindow`）で行います。
- **アニメ**: `updatePlayerAnimation()` が歩行中の上下バウンス・体の揺れ・腕脚スイング
  （向きに沿った軸 `swingAxis` で、左右・腕脚それぞれ逆位相）、停止中の微小アイドル揺れを付けます。

### 前面テクスチャのUV窓

スプライトはセル内で水平方向の中心がずれているため、方向ごとの実測中心 `ART_CENTERS`
（頭 `h` / 胴 `b`）に窓を合わせます。`HEAD_HALF_U` / `BODY_HALF_U` が窓の半幅、
`HEAD_V` / `BODY_V` が縦の範囲です。

### 主な関数

`createHybridPlayer` → `createHeadPart` / `createBodyPart` / `makeFaceBox` /
`createArmPart` / `createLegPart` / `addOutline`。
向き切替は `setHybridDirection` →（`setCellWindow` ＋ `setLimbLayout`）、
歩行は `updatePlayerAnimation`。

### 見た目を調整するパラメータ（すべて `src/main.js` 冒頭付近）

- 体格: `HIP_Y`（腰の高さ＝見える脚の長さ）、`BODY_W/H/D`、`HEAD_W/H/D`、`HEAD_CY`、
  `SHOULDER_Y`、`ARM_X`（肩ピボットの左右位置）
- 脚: `LEG_SEP`（左右の開き）、`LEG_LIFT`（胴へのめり込み量）、`bootH`（靴の高さ・`createLegPart` 内）、
  `legRadius`（脚の太さ・同）
- 腕: `ARM_SEP`（左右の開き）、`ARM_REST_TILT`（外への開き角）、腕・手袋の半径（`createArmPart` 内）
- 奥行き: `LIMB_DEPTH_SCALE`（横向き時の前後圧縮）
- 前面の絵: `HEAD_HALF_U` / `BODY_HALF_U`（窓の半幅）、`ART_CENTERS`（方向ごとの中心）、
  `HEAD_V` / `BODY_V`（縦範囲）
- 色: `COLORS`（袖・手袋・ズボン・ブーツ・帽子・背面・アウトライン）
- 接地: `CHAR_CLEARANCE`（足と地面の隙間）／影は `playerShadow` の `scale`・`opacity`
- カメラ・向き: `CAMERA_OFFSET`（厚みの見え方が変わる。`FIXED_YAW` も連動）

### 右手ハンマー

右手（`hammerMount`）に追従するハンマー。`updateHammerAttachment()` が毎フレーム、右手の
ワールド位置へハンマー本体を置き、向きを更新します（歩行スイングにも追従）。
向きは **2つの独立した系** で決めています。

- **柄の向き** = `HAMMER_DIRECTION_ANGLE[dir]`。ハンマー群全体を Z 軸まわりに回し、柄を
  画面上の進行方向へ向けます。後ろ・斜め後ろはヘッドが**上を向く**角度にしてあり、
  地面へのめり込みを避けます。
- **ヘッドの向き**（`HAMMER_HEAD_STRIKE_LEAN` ＋ `updateHammerAttachment()` 内の計算）。
  ハンマーは「**進行方向の地面を、円柱のキャップ（円の面）でたたく**」道具です。これを満たすため、
  円柱の軸は次の2条件で決めます。
  1. **常に柄に垂直**（実物のハンマー／木槌と同じ。柄は円柱の側面に当たり、円の面には刺さらない）
  2. できるだけ「**下（地面）＋進行方向**」を向く（＝キャップが進行方向の地面をたたく向き）

  具体的には、進行方向 `(fx, 0, fz)`（`FACING`。x=画面右, z=カメラ手前）を下方向 -Y へ
  傾けた「打撃ベクトル」を作り、それを**柄に垂直な平面へ射影**して軸とします。
  - 柄が縦のとき（front/back）→ 下成分が打ち消され、キャップは進行方向（手前/奥）を向く
  - 柄が横のとき（left/right）→ 進行成分が打ち消され、キャップは真下を向く（円柱が立つ）
  - 斜めはその中間

  `FACING` の進行方向を使うのが要点で、`front_right` と `back_right` のように**柄角度が同じ**
  方向でも、キャップが「手前下」か「奥下」かを正しく区別できます（柄まわりの回転角だけでは
  区別できませんでした）。`STRIKE_LEAN` は進行成分と下成分の重みです。
  実装は `setFromUnitVectors` で目標クォータニオンにして
  `head.quaternion = hammerGroup.quaternion⁻¹ × desired` としてヘッドへ直接適用します
  （柄の回転から独立。`head.rotation.z` を柄回転に重ねる旧案は斜めでジンバル破綻しました）。
  ※ 円柱は自身の軸まわりに対称なので、旧 `head.rotation.y` 方式は見た目が変わりませんでした。

関連: `createHammerPart()`, `setHammerPose()`, `HAMMER_MOUNT_Z`（方向ごとの前後位置微調整）。

### 今後の改善ポイント

- 歩行が単一フレームのスイングのみ。踏み込みに合わせた接地・反動を足すと向上。
- `THREE.Clock` は非推奨警告が出ます（`THREE.Timer` へ移行可能）。

## デバッグ用フック（スクショ駆動の調整）

向きごとの見た目（特にハンマー）をスクリーンショットで確認・調整するための仕組みです。

- `WebGLRenderer` は `preserveDrawingBuffer: true` で生成しています。これが無いと
  ヘッドレスのスクリーンショット取得が固まる（空フレームになる）ため必須です。
- ブラウザのコンソール / 自動化から `window.__hammerDebug` を利用できます。
  - `setDir(dir)` … 移動せずに向きだけ切替（`'front'`, `'front_right'`, `'right'`,
    `'back_right'`, `'back'`, `'back_left'`, `'left'`, `'front_left'`）
  - `pause()` / `resume()` … アニメーションループの停止 / 再開
  - `renderOnce()` … 1フレームだけ描画
  - `zoom(radius=2.4, height=1.6)` … ループを止め、現在のカメラヨー方向からキャラへ
    寄せて1フレーム描画（寄り絵のスクショ用）

  例: `__hammerDebug.setDir('right'); __hammerDebug.zoom();` の後にスクショを撮る。

これらは開発・調整専用です（`src/main.js`、`hammerToggle` リスナー付近と
`setAnimationLoop` 直後に定義）。本番に不要なら `window.__hammerDebug` 一式と
`preserveDrawingBuffer` を外してください。

## ディレクトリ構成

```
.
├─ assets/        使用中アセットと生成元画像
├─ src/           main.js（ゲーム本体）, style.css
├─ tools/         keygreen.mjs（アセット生成スクリプト）
├─ index.html
├─ vite.config.js
└─ AGENT.md       AIエージェント向けの作業ルール
```
