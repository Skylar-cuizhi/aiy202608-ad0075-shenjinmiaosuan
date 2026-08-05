import * as THREE from 'three';

/** 见微云海场景的全部贴图均为程序化生成（Canvas），不使用任何外部图片 */

/** 确定性伪随机（种子化，保证每次渲染同一座山） */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 云朵贴图：多个径向渐变叠加出的蓬松云团 */
export function cloudPuffTexture(size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const rand = mulberry32(42);
  for (let i = 0; i < 11; i++) {
    const r = size * (0.14 + rand() * 0.2);
    const x = size / 2 + (rand() - 0.5) * size * 0.46;
    const y = size / 2 + (rand() - 0.5) * size * 0.18;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,252,244,0.9)');
    g.addColorStop(0.55, 'rgba(253,247,233,0.4)');
    g.addColorStop(1, 'rgba(253,247,233,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/** 远山剪影：正弦叠加山脊线，纵向没入云雾 */
export function ridgeTexture(seed: number, opacity = 0.5): THREE.CanvasTexture {
  const w = 1024;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const rand = mulberry32(seed);
  const f1 = 2 + rand() * 3;
  const f2 = 5 + rand() * 5;
  const f3 = 9 + rand() * 8;
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  const p3 = rand() * Math.PI * 2;
  const ridgeY = (x: number) => {
    const t = x / w;
    return (
      h * 0.42 +
      Math.sin(t * Math.PI * f1 + p1) * h * 0.16 +
      Math.sin(t * Math.PI * f2 + p2) * h * 0.09 +
      Math.sin(t * Math.PI * f3 + p3) * h * 0.05
    );
  };
  const grad = ctx.createLinearGradient(0, h * 0.2, 0, h);
  grad.addColorStop(0, `rgba(122,106,82,${opacity})`);
  grad.addColorStop(1, 'rgba(122,106,82,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) ctx.lineTo(x, ridgeY(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/** 柔光点（灵气粒子 / 朱日） */
export function glowDotTexture(size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,244,214,0.75)');
  g.addColorStop(1, 'rgba(255,244,214,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** 门匾：竖排「见微」，墨色于绢本 */
export function plaqueTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(246,239,222,0.92)';
  ctx.fillRect(8, 4, 112, 248);
  ctx.strokeStyle = 'rgba(58,50,38,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 4, 112, 248);
  ctx.fillStyle = '#2c2a26';
  ctx.font = 'bold 72px "Songti SC", "STSong", "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('见', 64, 78);
  ctx.fillText('微', 64, 178);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}
