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
  liquidDrop: Texture;
  liquidOrb: Texture;
  liquidRing: Texture;
  liquidStar: Texture;
  liquidClover: Texture;
  liquidCloud: Texture;
  liquidRipple: Texture;
};

function makeCanvas(width: number, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法创建特效纹理。');
  return { canvas, context };
}

function applyHalftone(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  opacity = 0.12,
) {
  context.save();
  context.globalCompositeOperation = 'source-atop';
  context.fillStyle = `rgba(21, 37, 92, ${opacity})`;
  for (let y = 5; y < height; y += 6) {
    const stagger = Math.floor(y / 6) % 2 === 0 ? 0 : 3;
    for (let x = 5 + stagger; x < width; x += 6) {
      context.beginPath();
      context.arc(x, y, 1.05, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
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

function createLiquidDropTexture() {
  const { canvas, context } = makeCanvas(112, 144);
  const body = context.createLinearGradient(22, 12, 88, 132);
  body.addColorStop(0, 'rgba(255,255,255,.94)');
  body.addColorStop(0.28, 'rgba(188,235,255,.82)');
  body.addColorStop(0.7, 'rgba(107,87,255,.72)');
  body.addColorStop(1, 'rgba(33,12,85,.32)');
  context.shadowColor = 'rgba(81,255,178,.82)';
  context.shadowBlur = 18;
  context.fillStyle = body;
  context.beginPath();
  context.moveTo(57, 8);
  context.bezierCurveTo(78, 38, 98, 66, 91, 101);
  context.bezierCurveTo(86, 128, 62, 140, 38, 127);
  context.bezierCurveTo(12, 113, 15, 78, 29, 51);
  context.bezierCurveTo(39, 31, 48, 16, 57, 8);
  context.closePath();
  context.fill();
  applyHalftone(context, canvas.width, canvas.height, 0.12);
  context.shadowBlur = 0;
  const shine = context.createLinearGradient(32, 26, 72, 98);
  shine.addColorStop(0, 'rgba(255,255,255,.9)');
  shine.addColorStop(0.45, 'rgba(255,255,255,.18)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  context.strokeStyle = shine;
  context.lineWidth = 5;
  context.lineCap = 'round';
  context.beginPath();
  context.bezierCurveTo(38, 38, 30, 67, 37, 86);
  context.stroke();
  return Texture.from(canvas);
}

function createLiquidOrbTexture() {
  const { canvas, context } = makeCanvas(192);
  const glow = context.createRadialGradient(96, 96, 18, 96, 96, 92);
  glow.addColorStop(0, 'rgba(255,255,255,.96)');
  glow.addColorStop(0.18, 'rgba(188,235,255,.9)');
  glow.addColorStop(0.48, 'rgba(116,80,255,.78)');
  glow.addColorStop(0.7, 'rgba(255,46,154,.62)');
  glow.addColorStop(0.86, 'rgba(255,225,71,.38)');
  glow.addColorStop(1, 'rgba(36,255,164,0)');
  context.shadowColor = 'rgba(60,255,168,.7)';
  context.shadowBlur = 24;
  context.fillStyle = glow;
  context.beginPath();
  context.arc(96, 96, 78, 0, Math.PI * 2);
  context.fill();
  applyHalftone(context, canvas.width, canvas.height, 0.14);
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,.7)';
  context.beginPath();
  context.ellipse(72, 60, 24, 12, -0.55, 0, Math.PI * 2);
  context.fill();
  return Texture.from(canvas);
}

function createLiquidRingTexture() {
  const { canvas, context } = makeCanvas(224);
  const gradient = context.createLinearGradient(28, 24, 194, 204);
  gradient.addColorStop(0, 'rgba(245,255,255,.92)');
  gradient.addColorStop(0.25, 'rgba(72,210,255,.84)');
  gradient.addColorStop(0.52, 'rgba(135,68,255,.82)');
  gradient.addColorStop(0.76, 'rgba(255,48,166,.82)');
  gradient.addColorStop(1, 'rgba(255,226,62,.86)');
  context.shadowColor = 'rgba(48,255,167,.72)';
  context.shadowBlur = 20;
  context.strokeStyle = gradient;
  context.lineWidth = 18;
  context.beginPath();
  context.ellipse(112, 112, 84, 76, -0.14, 0, Math.PI * 2);
  context.stroke();
  applyHalftone(context, canvas.width, canvas.height, 0.15);
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(255,255,255,.62)';
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(112, 106, 78, 68, -0.14, Math.PI * 1.08, Math.PI * 1.76);
  context.stroke();
  return Texture.from(canvas);
}

function createLiquidStarTexture() {
  const { canvas, context } = makeCanvas(224);
  const gradient = context.createRadialGradient(98, 88, 8, 112, 112, 104);
  gradient.addColorStop(0, 'rgba(255,255,255,.94)');
  gradient.addColorStop(0.28, 'rgba(168,223,255,.9)');
  gradient.addColorStop(0.58, 'rgba(124,67,255,.76)');
  gradient.addColorStop(0.82, 'rgba(255,49,164,.62)');
  gradient.addColorStop(1, 'rgba(255,227,69,.38)');
  context.shadowColor = 'rgba(65,255,174,.76)';
  context.shadowBlur = 22;
  context.fillStyle = gradient;
  context.beginPath();
  const points = 16;
  for (let index = 0; index <= points; index += 1) {
    const angle = -Math.PI / 2 + (index / points) * Math.PI * 2;
    const radius = index % 2 === 0 ? 94 : 47;
    const x = 112 + Math.cos(angle) * radius;
    const y = 112 + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y);
    else context.quadraticCurveTo(112, 112, x, y);
  }
  context.closePath();
  context.fill();
  applyHalftone(context, canvas.width, canvas.height, 0.13);
  return Texture.from(canvas);
}

function createLiquidCloverTexture() {
  const { canvas, context } = makeCanvas(224);
  context.translate(112, 112);
  context.shadowColor = 'rgba(68,255,171,.72)';
  context.shadowBlur = 20;
  for (let index = 0; index < 4; index += 1) {
    context.save();
    context.rotate((index * Math.PI) / 2);
    const gradient = context.createLinearGradient(0, -88, 0, 12);
    gradient.addColorStop(0, 'rgba(247,255,255,.9)');
    gradient.addColorStop(0.3, 'rgba(150,220,255,.82)');
    gradient.addColorStop(0.58, 'rgba(116,70,247,.76)');
    gradient.addColorStop(0.82, 'rgba(255,52,158,.58)');
    gradient.addColorStop(1, 'rgba(255,226,67,.4)');
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(0, 9);
    context.bezierCurveTo(-52, -10, -48, -74, 0, -91);
    context.bezierCurveTo(48, -74, 52, -10, 0, 9);
    context.fill();
    context.restore();
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  applyHalftone(context, canvas.width, canvas.height, 0.13);
  context.translate(112, 112);
  const core = context.createRadialGradient(0, 0, 1, 0, 0, 25);
  core.addColorStop(0, 'rgba(255,246,151,1)');
  core.addColorStop(0.38, 'rgba(255,221,70,.86)');
  core.addColorStop(1, 'rgba(61,255,174,0)');
  context.fillStyle = core;
  context.beginPath();
  context.arc(0, 0, 26, 0, Math.PI * 2);
  context.fill();
  return Texture.from(canvas);
}

function createLiquidCloudTexture() {
  const { canvas, context } = makeCanvas(240, 190);
  const gradient = context.createLinearGradient(36, 28, 204, 164);
  gradient.addColorStop(0, 'rgba(255,255,255,.88)');
  gradient.addColorStop(0.27, 'rgba(147,224,255,.84)');
  gradient.addColorStop(0.54, 'rgba(119,71,255,.74)');
  gradient.addColorStop(0.78, 'rgba(255,53,164,.62)');
  gradient.addColorStop(1, 'rgba(255,224,64,.4)');
  context.shadowColor = 'rgba(56,255,174,.7)';
  context.shadowBlur = 24;
  context.fillStyle = gradient;
  const lobes = [
    [58, 112, 42],
    [82, 73, 50],
    [127, 60, 55],
    [174, 82, 48],
    [190, 120, 39],
    [137, 128, 57],
    [93, 130, 46],
  ];
  for (const [x, y, radius] of lobes) {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  applyHalftone(context, canvas.width, canvas.height, 0.12);
  return Texture.from(canvas);
}

function createLiquidRippleTexture() {
  const { canvas, context } = makeCanvas(192, 96);
  const gradient = context.createLinearGradient(18, 48, 174, 48);
  gradient.addColorStop(0, 'rgba(50,255,169,0)');
  gradient.addColorStop(0.5, 'rgba(184,255,232,.92)');
  gradient.addColorStop(1, 'rgba(50,255,169,0)');
  context.shadowColor = 'rgba(50,255,169,.78)';
  context.shadowBlur = 12;
  context.strokeStyle = gradient;
  context.lineWidth = 6;
  context.beginPath();
  context.ellipse(96, 48, 78, 24, 0, 0, Math.PI * 2);
  context.stroke();
  return Texture.from(canvas);
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
    liquidDrop: createLiquidDropTexture(),
    liquidOrb: createLiquidOrbTexture(),
    liquidRing: createLiquidRingTexture(),
    liquidStar: createLiquidStarTexture(),
    liquidClover: createLiquidCloverTexture(),
    liquidCloud: createLiquidCloudTexture(),
    liquidRipple: createLiquidRippleTexture(),
  };
}

export function destroyVisualTextureLibrary(textures: VisualTextureLibrary) {
  for (const texture of Object.values(textures)) texture.destroy(true);
}

export function pickColor(palette: readonly number[]) {
  return palette[Math.floor(Math.random() * palette.length)];
}
