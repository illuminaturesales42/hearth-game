/**
 * Board renderer + pointer drag-and-drop. DOM only; all rules live in core.
 */
import type { Game } from '../core/game';
import { chainDef } from '../core/board';
import { PRODUCER_INDEX } from '../data/economy';

export class BoardView {
  private root: HTMLElement;
  private ghost: HTMLElement | null = null;
  private dragFrom = -1;

  constructor(private game: Game, rootEl: HTMLElement) {
    this.root = rootEl;
    this.buildCells();
    this.bindPointer();
    game.subscribe((ev) => {
      if (ev.type === 'state') this.render();
      if (ev.type === 'merge' || ev.type === 'spawn') this.popCell(ev.index);
      if (ev.type === 'reject' && ev.index >= 0) this.shakeCell(ev.index);
    });
    this.render();
  }

  private buildCells(): void {
    const { cols, rows } = this.game.snapshot.board;
    this.root.innerHTML = '';
    this.root.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for (let i = 0; i < cols * rows; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = String(i);
      cell.setAttribute('role', 'gridcell');
      this.root.appendChild(cell);
    }
  }

  render(): void {
    const { board } = this.game.snapshot;
    const deliverable = this.game.deliverableIndex();
    board.cells.forEach((c, i) => {
      const el = this.root.children[i] as HTMLElement;
      el.className = 'cell';
      el.innerHTML = '';
      if (c.kind === 'producer') {
        el.classList.add('producer');
        el.innerHTML = '<span class="glyph">📦</span>';
      } else if (c.kind === 'item') {
        el.classList.add('item');
        const def = chainDef(c.item.chain);
        const glyph = def.levels[c.item.level] ?? '❔';
        el.innerHTML = `<span class="glyph">${glyph}</span><span class="lv">${c.item.level + 1}</span>`;
        el.setAttribute('aria-label', `${def.levelNames[c.item.level]} level ${c.item.level + 1}`);
        if (i === deliverable) el.classList.add('deliverable');
      }
    });
  }

  private cellIndexFromPoint(x: number, y: number): number {
    const el = document.elementFromPoint(x, y);
    const cell = el?.closest('.cell') as HTMLElement | null;
    return cell ? Number(cell.dataset.index) : -1;
  }

  private bindPointer(): void {
    this.root.addEventListener('pointerdown', (e) => {
      const idx = this.cellIndexFromPoint(e.clientX, e.clientY);
      if (idx < 0) return;
      if (idx === PRODUCER_INDEX) {
        this.game.tapProducer();
        return;
      }
      const item = this.game.itemAt(idx);
      if (!item) return;
      this.dragFrom = idx;
      this.root.setPointerCapture(e.pointerId);
      const glyph = chainDef(item.chain).levels[item.level] ?? '❔';
      this.ghost = document.createElement('div');
      this.ghost.id = 'drag-ghost';
      this.ghost.textContent = glyph;
      document.body.appendChild(this.ghost);
      this.moveGhost(e.clientX, e.clientY);
      (this.root.children[idx] as HTMLElement).style.opacity = '0.35';
    });

    this.root.addEventListener('pointermove', (e) => {
      if (this.dragFrom < 0) return;
      this.moveGhost(e.clientX, e.clientY);
      const over = this.cellIndexFromPoint(e.clientX, e.clientY);
      Array.from(this.root.children).forEach((c, i) => {
        (c as HTMLElement).classList.toggle('drop-ok', i === over && over !== this.dragFrom);
      });
    });

    const finish = (e: PointerEvent) => {
      if (this.dragFrom < 0) return;
      const from = this.dragFrom;
      this.dragFrom = -1;
      this.ghost?.remove();
      this.ghost = null;
      (this.root.children[from] as HTMLElement).style.opacity = '';
      Array.from(this.root.children).forEach((c) => (c as HTMLElement).classList.remove('drop-ok'));
      const to = this.cellIndexFromPoint(e.clientX, e.clientY);
      if (to >= 0 && to !== from) this.game.drop(from, to);
    };
    this.root.addEventListener('pointerup', finish);
    this.root.addEventListener('pointercancel', finish);
  }

  private moveGhost(x: number, y: number): void {
    if (!this.ghost) return;
    this.ghost.style.left = `${x}px`;
    this.ghost.style.top = `${y}px`;
  }

  private popCell(i: number): void {
    const el = this.root.children[i] as HTMLElement | undefined;
    if (!el) return;
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 350);
  }

  private shakeCell(i: number): void {
    const el = this.root.children[i] as HTMLElement | undefined;
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 300);
  }
}
