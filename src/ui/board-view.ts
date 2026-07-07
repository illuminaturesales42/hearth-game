/**
 * Board renderer + pointer drag-and-drop. DOM only; all rules live in core.
 */
import type { Game } from '../core/game';
import { chainDef } from '../core/board';
import { PRODUCER_INDEX } from '../data/economy';
import { tileMarkup } from './art';

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
        el.innerHTML = `${tileMarkup(c.item.chain, c.item.level)}<span class="lv">${c.item.level + 1}</span>`;
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

  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private holdStart: { x: number; y: number } | null = null;

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
      this.ghost = document.createElement('div');
      this.ghost.id = 'drag-ghost';
      this.ghost.innerHTML = tileMarkup(item.chain, item.level);
      document.body.appendChild(this.ghost);
      this.moveGhost(e.clientX, e.clientY);
      (this.root.children[idx] as HTMLElement).style.opacity = '0.35';
      // Hold in place to inspect the item instead of dragging it.
      this.holdStart = { x: e.clientX, y: e.clientY };
      clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => {
        if (this.dragFrom === idx) {
          this.cancelDrag(idx);
          this.showItemInfo(idx);
        }
      }, 480);
    });

    this.root.addEventListener('pointermove', (e) => {
      if (this.dragFrom < 0) return;
      if (this.holdStart && Math.hypot(e.clientX - this.holdStart.x, e.clientY - this.holdStart.y) > 9) {
        clearTimeout(this.holdTimer);
        this.holdStart = null;
      }
      this.moveGhost(e.clientX, e.clientY);
      const over = this.cellIndexFromPoint(e.clientX, e.clientY);
      Array.from(this.root.children).forEach((c, i) => {
        (c as HTMLElement).classList.toggle('drop-ok', i === over && over !== this.dragFrom);
      });
    });

    const finish = (e: PointerEvent) => {
      clearTimeout(this.holdTimer);
      this.holdStart = null;
      if (this.dragFrom < 0) return;
      const from = this.dragFrom;
      this.cancelDrag(from);
      const to = this.cellIndexFromPoint(e.clientX, e.clientY);
      if (to >= 0 && to !== from) this.game.drop(from, to);
    };
    this.root.addEventListener('pointerup', finish);
    this.root.addEventListener('pointercancel', finish);
  }

  private cancelDrag(from: number): void {
    this.dragFrom = -1;
    this.ghost?.remove();
    this.ghost = null;
    const cell = this.root.children[from] as HTMLElement | undefined;
    if (cell) cell.style.opacity = '';
    Array.from(this.root.children).forEach((c) => (c as HTMLElement).classList.remove('drop-ok'));
  }

  /** Long-press card: what this is, what it becomes, and a way to let it go. */
  private showItemInfo(index: number): void {
    const item = this.game.itemAt(index);
    if (!item) return;
    const def = chainDef(item.chain);
    const artBox = document.getElementById('item-art');
    if (artBox) artBox.innerHTML = tileMarkup(item.chain, item.level);
    const name = document.getElementById('item-name');
    if (name) name.textContent = `${def.levelNames[item.level]} · ${def.name} ${item.level + 1}/${def.levels.length}`;
    const next = document.getElementById('item-next');
    if (next) {
      next.innerHTML =
        item.level + 1 < def.levels.length
          ? `Merge two of these to make <b>${def.levelNames[item.level + 1]}</b>.`
          : 'Top of its chain — as fine as they come.';
    }
    const modal = document.getElementById('item-modal');
    if (!modal) return;
    modal.hidden = false;
    const trash = document.getElementById('item-trash') as HTMLButtonElement | null;
    if (trash) {
      trash.textContent = 'Discard';
      let armed = false;
      trash.onclick = () => {
        if (!armed) {
          armed = true;
          trash.textContent = 'Tap again to discard';
          return;
        }
        this.game.trashItem(index);
        modal.hidden = true;
      };
    }
    const close = document.getElementById('item-close') as HTMLButtonElement | null;
    if (close) close.onclick = () => (modal.hidden = true);
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
