import { Texture } from 'pixi.js';

export const EMOTION_BLOOM = {
  cyan: 0x25f4ee,
  hotPink: 0xfe2c55,
  violet: 0x8a4fff,
  mint: 0x20e6a4,
  orange: 0xff7a45,
  glass: 0xf8fbff,
} as const;

export const CANDY_BLOOM = {
  ice: EMOTION_BLOOM.cyan,
  lavender: EMOTION_BLOOM.violet,
  pink: EMOTION_BLOOM.hotPink,
  gold: 0xffd166,
  white: 0xfffbf4,
  dream: 0x5e315f,
} as const;

export const CANDY_BLOOM_SCALE = {
  collisionAccent: 1.42,
  firework: 1.38,
  energyRing: 1.2,
} as const;

export const SMILE_PALETTE = [
  CANDY_BLOOM.ice,
  CANDY_BLOOM.ice,
  CANDY_BLOOM.ice,
  CANDY_BLOOM.lavender,
  CANDY_BLOOM.lavender,
  CANDY_BLOOM.pink,
  CANDY_BLOOM.white,
  CANDY_BLOOM.gold,
  EMOTION_BLOOM.mint,
  EMOTION_BLOOM.orange,
] as const;

export const LAUGH_PALETTE = [
  CANDY_BLOOM.lavender,
  CANDY_BLOOM.lavender,
  CANDY_BLOOM.pink,
  CANDY_BLOOM.pink,
  CANDY_BLOOM.ice,
  CANDY_BLOOM.ice,
  CANDY_BLOOM.gold,
  CANDY_BLOOM.white,
  EMOTION_BLOOM.mint,
  EMOTION_BLOOM.orange,
] as const;

export type VisualTextureLibrary = {
  softDot: Texture;
  star: Texture;
  petal: Texture;
  streak: Texture;
  energyRing: Texture;
  blossom: Texture;
  arc: Texture;
  pixelDot: Texture;
  pixelDash: Texture;
  pixelNote: Texture;
  pixelStar: Texture;
  pixelFlower: Texture;
  pixelSmile: Texture;
  pixelHeart: Texture;
  pixelBolt: Texture;
  pixelCross: Texture;
};

function makeCanvas(width: number, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法创建特效纹理。');
  return { canvas, context };
}

function createCrispTexture(canvas: HTMLCanvasElement) {
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}

function createSoftDotTexture() {
  const { canvas, context } = makeCanvas(32);
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.98)');
  gradient.addColorStop(0.52, 'rgba(255,255,255,0.58)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  return Texture.from(canvas);
}

function createStarTexture() {
  const { canvas, context } = makeCanvas(32);
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.38, 'rgba(255,255,255,0.94)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.beginPath();
  for (let point = 0; point < 8; point += 1) {
    const angle = -Math.PI / 2 + (point * Math.PI) / 4;
    const radius = point % 2 === 0 ? 15 : 4.8;
    const x = 16 + Math.cos(angle) * radius;
    const y = 16 + Math.sin(angle) * radius;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  return Texture.from(canvas);
}

function createPetalTexture() {
  const { canvas, context } = makeCanvas(64, 84);
  const gradient = context.createLinearGradient(12, 8, 52, 78);
  gradient.addColorStop(0, 'rgba(255,255,255,0.98)');
  gradient.addColorStop(0.24, 'rgba(238,249,255,0.94)');
  gradient.addColorStop(0.68, 'rgba(208,220,245,0.78)');
  gradient.addColorStop(1, 'rgba(121,134,171,0.36)');
  context.shadowColor = 'rgba(117,222,255,.42)';
  context.shadowBlur = 8;
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(32, 5);
  context.bezierCurveTo(58, 14, 62, 47, 34, 78);
  context.bezierCurveTo(8, 61, 4, 25, 32, 5);
  context.closePath();
  context.fill();
  context.shadowBlur = 0;
  const highlight = context.createLinearGradient(17, 12, 43, 68);
  highlight.addColorStop(0, 'rgba(255,255,255,.88)');
  highlight.addColorStop(0.48, 'rgba(255,255,255,.12)');
  highlight.addColorStop(1, 'rgba(255,255,255,0)');
  context.strokeStyle = highlight;
  context.lineWidth = 2.2;
  context.beginPath();
  context.moveTo(29, 11);
  context.bezierCurveTo(20, 30, 23, 53, 34, 70);
  context.stroke();
  return Texture.from(canvas);
}

function createBlossomTexture() {
  const { canvas, context } = makeCanvas(180);
  context.translate(90, 90);
  context.shadowColor = 'rgba(79,224,255,.64)';
  context.shadowBlur = 16;
  for (let index = 0; index < 5; index += 1) {
    context.save();
    context.rotate((index / 5) * Math.PI * 2);
    const gradient = context.createLinearGradient(0, -72, 0, 10);
    gradient.addColorStop(0, 'rgba(255,255,255,.96)');
    gradient.addColorStop(0.38, 'rgba(222,238,255,.9)');
    gradient.addColorStop(1, 'rgba(153,169,221,.5)');
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(0, 5);
    context.bezierCurveTo(-34, -18, -30, -61, 0, -75);
    context.bezierCurveTo(30, -61, 34, -18, 0, 5);
    context.fill();
    context.restore();
  }
  context.shadowBlur = 8;
  const core = context.createRadialGradient(0, 0, 1, 0, 0, 22);
  core.addColorStop(0, 'rgba(255,255,240,1)');
  core.addColorStop(0.32, 'rgba(255,220,133,.98)');
  core.addColorStop(1, 'rgba(255,185,92,0)');
  context.fillStyle = core;
  context.beginPath();
  context.arc(0, 0, 23, 0, Math.PI * 2);
  context.fill();
  return Texture.from(canvas);
}

function createStreakTexture() {
  const { canvas, context } = makeCanvas(10, 42);
  const gradient = context.createLinearGradient(5, 0, 5, 42);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(0.88, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0.2)');
  context.strokeStyle = gradient;
  context.lineWidth = 3.8;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(5, 1);
  context.lineTo(5, 40);
  context.stroke();
  return Texture.from(canvas);
}

function createEnergyRingTexture() {
  const { canvas, context } = makeCanvas(128);
  const gradient = context.createRadialGradient(64, 64, 42, 64, 64, 63);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.48, 'rgba(255,255,255,0.05)');
  gradient.addColorStop(0.68, 'rgba(255,255,255,0.92)');
  gradient.addColorStop(0.84, 'rgba(255,255,255,0.36)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return Texture.from(canvas);
}

function createArcTexture() {
  const { canvas, context } = makeCanvas(256);
  const gradient = context.createLinearGradient(26, 50, 230, 198);
  gradient.addColorStop(0, 'rgba(37,244,238,0)');
  gradient.addColorStop(0.18, 'rgba(37,244,238,0.96)');
  gradient.addColorStop(0.56, 'rgba(138,79,255,0.92)');
  gradient.addColorStop(0.86, 'rgba(254,44,85,0.96)');
  gradient.addColorStop(1, 'rgba(254,44,85,0)');
  context.strokeStyle = gradient;
  context.lineWidth = 9;
  context.lineCap = 'round';
  context.shadowColor = 'rgba(109,92,255,.82)';
  context.shadowBlur = 17;
  context.beginPath();
  context.arc(128, 128, 91, Math.PI * 1.08, Math.PI * 1.92);
  context.stroke();
  context.lineWidth = 2;
  context.shadowBlur = 5;
  context.strokeStyle = 'rgba(255,255,255,.75)';
  context.stroke();
  return Texture.from(canvas);
}

function createPixelDotTexture() {
  const { canvas, context } = makeCanvas(32);
  context.imageSmoothingEnabled = false;
  context.shadowColor = 'rgba(255,255,255,.9)';
  context.shadowBlur = 9;
  context.fillStyle = 'rgba(255,255,255,.28)';
  context.fillRect(10, 10, 12, 12);
  context.shadowBlur = 3;
  context.fillStyle = '#fff';
  context.fillRect(12, 12, 8, 8);
  return createCrispTexture(canvas);
}

function createPixelDashTexture() {
  const { canvas, context } = makeCanvas(18, 64);
  context.imageSmoothingEnabled = false;
  const segments = [
    { y: 4, size: 4, alpha: 0.22 },
    { y: 13, size: 5, alpha: 0.38 },
    { y: 24, size: 6, alpha: 0.58 },
    { y: 37, size: 7, alpha: 0.82 },
    { y: 52, size: 8, alpha: 1 },
  ];
  context.shadowColor = 'rgba(255,255,255,.92)';
  context.shadowBlur = 6;
  for (const segment of segments) {
    context.globalAlpha = segment.alpha;
    context.fillStyle = '#fff';
    context.fillRect(
      Math.round((18 - segment.size) / 2),
      segment.y,
      segment.size,
      segment.size,
    );
  }
  context.globalAlpha = 1;
  return createCrispTexture(canvas);
}

function createPixelMotifTexture(pattern: readonly string[], cellSize = 7) {
  const padding = 14;
  const width = Math.max(...pattern.map((row) => row.length)) * cellSize;
  const height = pattern.length * cellSize;
  const { canvas, context } = makeCanvas(
    width + padding * 2,
    height + padding * 2,
  );
  context.imageSmoothingEnabled = false;
  context.shadowColor = 'rgba(255,255,255,.9)';
  context.shadowBlur = 9;
  for (let row = 0; row < pattern.length; row += 1) {
    for (let column = 0; column < pattern[row].length; column += 1) {
      if (pattern[row][column] !== '#') continue;
      context.globalAlpha = (row + column) % 5 === 0 ? 0.76 : 1;
      context.fillStyle = '#fff';
      context.fillRect(
        padding + column * cellSize,
        padding + row * cellSize,
        cellSize - 1,
        cellSize - 1,
      );
    }
  }
  context.globalAlpha = 1;
  return createCrispTexture(canvas);
}

function createPixelNoteTexture() {
  return createPixelMotifTexture([
    '......###',
    '....#####',
    '...##...#',
    '..##....#',
    '.##.....#',
    '.##.....#',
    '###....##',
    '###...###',
    '.#.....##',
  ]);
}

function createPixelStarTexture() {
  return createPixelMotifTexture([
    '.....#.....',
    '..#..#..#..',
    '...#####...',
    '.#########.',
    '..#######..',
    '###########',
    '..#######..',
    '...##.##...',
    '..##...##..',
    '.#.......#.',
  ]);
}

function createPixelFlowerTexture() {
  return createPixelMotifTexture([
    '...##.##...',
    '..#######..',
    '.#########.',
    '####.#.####',
    '###..#..###',
    '.#########.',
    '..#######..',
    '...#####...',
    '....###....',
    '.....#.....',
  ]);
}

function createPixelSmileTexture() {
  return createPixelMotifTexture([
    '..#######..',
    '.##.....##.',
    '##.......##',
    '#..##.##..#',
    '#..##.##..#',
    '#.........#',
    '#..#...#..#',
    '#...###...#',
    '##.......##',
    '.##.....##.',
    '..#######..',
  ]);
}

function createPixelHeartTexture() {
  return createPixelMotifTexture(
    [
      '...####...####...',
      '..######.######..',
      '.###############.',
      '#################',
      '#################',
      '.###############.',
      '..#############..',
      '...###########...',
      '....#########....',
      '.....#######.....',
      '......#####......',
      '.......###.......',
      '........#........',
    ],
    6,
  );
}

function createPixelBoltTexture() {
  return createPixelMotifTexture(
    [
      '......###',
      '.....###.',
      '....###..',
      '...####..',
      '..######.',
      '....###..',
      '...###...',
      '..###....',
      '.###.....',
      '###......',
    ],
    6,
  );
}

function createPixelCrossTexture() {
  return createPixelMotifTexture([
    '...#...',
    '...#...',
    '...#...',
    '#######',
    '...#...',
    '...#...',
    '...#...',
  ]);
}

export function createVisualTextureLibrary(): VisualTextureLibrary {
  return {
    softDot: createSoftDotTexture(),
    star: createStarTexture(),
    petal: createPetalTexture(),
    streak: createStreakTexture(),
    energyRing: createEnergyRingTexture(),
    blossom: createBlossomTexture(),
    arc: createArcTexture(),
    pixelDot: createPixelDotTexture(),
    pixelDash: createPixelDashTexture(),
    pixelNote: createPixelNoteTexture(),
    pixelStar: createPixelStarTexture(),
    pixelFlower: createPixelFlowerTexture(),
    pixelSmile: createPixelSmileTexture(),
    pixelHeart: createPixelHeartTexture(),
    pixelBolt: createPixelBoltTexture(),
    pixelCross: createPixelCrossTexture(),
  };
}

export function destroyVisualTextureLibrary(textures: VisualTextureLibrary) {
  for (const texture of Object.values(textures)) texture.destroy(true);
}

export function pickColor(palette: readonly number[]) {
  return palette[Math.floor(Math.random() * palette.length)];
}
