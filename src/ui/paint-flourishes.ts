/**
 * Painted canvas flourishes for the reactive world (src/core/world-mood.ts):
 * the small, hand-drawn touches the town grows in answer to the player's
 * real-world day — blooming flowers, a sparkling well, butterflies, and the
 * distant townsfolk of a busier road. Pure drawing; no state, no game logic.
 */

/** A little five-petal flower: green stem, petals of `colour`, a warm centre. */
export function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(74, 122, 60, 0.8)';
  ctx.lineWidth = Math.max(0.8, size * 0.18);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - size * 1.6);
  ctx.stroke();
  const cx = x;
  const cy = y - size * 1.6;
  ctx.fillStyle = colour;
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * size * 0.7, cy + Math.sin(a) * size * 0.7, size * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd27a';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A four-point twinkle for sparkling water. `k` 0..1 sets brightness/size. */
export function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, k));
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  g.addColorStop(0, 'rgba(226, 248, 255, 0.95)');
  g.addColorStop(1, 'rgba(200, 236, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(240, 252, 255, 0.95)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
  ctx.stroke();
  ctx.restore();
}

/** A small butterfly whose wings flap with `flap` (-1..1); `colour` its wings. */
export function drawButterfly(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, flap: number, colour: string): void {
  const wing = size * (0.55 + 0.45 * Math.abs(flap));
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = colour;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * size * 0.5, -size * 0.2, wing * 0.5, size * 0.7, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * size * 0.45, size * 0.35, wing * 0.42, size * 0.5, -s * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(60, 44, 30, 0.8)';
  ctx.lineWidth = Math.max(0.8, size * 0.18);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.7);
  ctx.lineTo(0, size * 0.7);
  ctx.stroke();
  ctx.restore();
}

/** A small cloaked townsperson in the distance — a painted silhouette, not a
 *  named villager, so a busier road never spoils who you've yet to meet. */
export function drawStroller(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, cloak: string): void {
  ctx.save();
  // soft ground shadow
  ctx.fillStyle = 'rgba(30, 24, 18, 0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y, h * 0.28, h * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  // cloak body
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.quadraticCurveTo(x - h * 0.34, y - h * 0.4, x - h * 0.3, y);
  ctx.lineTo(x + h * 0.3, y);
  ctx.quadraticCurveTo(x + h * 0.34, y - h * 0.4, x, y - h);
  ctx.closePath();
  ctx.fill();
  // head
  ctx.fillStyle = '#e8c69a';
  ctx.beginPath();
  ctx.arc(x, y - h, h * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
