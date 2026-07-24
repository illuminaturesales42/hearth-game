/**
 * Board renderer + pointer drag-and-drop. DOM only; all rules live in core.
 */
import type { Game } from '../core/game';
import { chainDef } from '../core/board';
import { PRODUCER_INDEX, sellValue } from '../data/economy';
import { artUrl, tileMarkup } from './art';
import { playStrip } from './sprite-strip';

export class BoardView {
  private root: HTMLElement;
  private ghost: HTMLElement | null = null;
  private dragFrom = -1;
  private fxLayer: HTMLElement;
  /** Motion follows the IN-GAME Settings toggle only; the OS media query just
   *  seeds that toggle's default (core/save.ts). Windows reports
   *  prefers-reduced-motion whenever its "animation effects" switch is off,
   *  which was silently killing the merge/pop animations for those players. */
  private reduced(): boolean {
    return document.body.classList.contains('reduce-motion');
  }
  /** last cell that was deliverable, captured pre-delivery for the orb origin */
  private lastDeliverable = -1;
  /** tap-to-merge: the first-tapped item awaiting a partner (-1 = none) */
  private selected = -1;
  /** true once a pointer press has crossed the drag threshold */
  private dragging = false;
  /** roving-tabindex cell for keyboard play (only this cell is Tab-reachable) */
  private focusIndex = 0;

  constructor(
    private game: Game,
    rootEl: HTMLElement,
  ) {
    this.root = rootEl;
    this.fxLayer =
      document.getElementById('fx-layer') ??
      (() => {
        const d = document.createElement('div');
        d.id = 'fx-layer';
        document.body.appendChild(d);
        return d;
      })();
    this.buildCells();
    this.bindPointer();
    this.bindKeyboard();
    game.subscribe((ev) => {
      if (ev.type === 'state') this.render();
      // Every non-state event is followed SYNCHRONOUSLY by a trailing `state`
      // (game.ts emit) whose render() rewrites every cell — which used to strip
      // the just-added .pop class and replace the tile node in the same tick,
      // so the merge/spawn pop never played (the tile snapped). Defer the pop a
      // microtask so it lands on the freshly rendered cell instead.
      if (ev.type === 'spawn') queueMicrotask(() => this.popCell(ev.index));
      if (ev.type === 'merge') {
        queueMicrotask(() => {
          this.popCell(ev.index);
          this.mergeBurst(ev.index);
        });
      }
      if (ev.type === 'reject' && ev.index >= 0) queueMicrotask(() => this.shakeCell(ev.index));
      if (ev.type === 'delivered') this.deliverFly();
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
      cell.tabIndex = i === this.focusIndex ? 0 : -1; // roving tabindex
      this.root.appendChild(cell);
    }
  }

  /**
   * Keyboard play: arrow keys rove focus, Enter/Space selects then merges
   * (reusing the tap-to-merge model), and 'i' opens the item card — the same
   * three things pointer users get, so the board isn't mouse-only.
   */
  private bindKeyboard(): void {
    this.root.addEventListener('keydown', (e) => {
      const { cols, rows } = this.game.snapshot.board;
      // Derive the current cell from the actually-focused element, not a stored
      // index — focus can arrive via Tab, a pointer tap, or .focus(), and a
      // stale field would rove from the wrong cell.
      const focused = (e.target as HTMLElement | null)?.dataset?.index;
      const i = focused != null ? Number(focused) : this.focusIndex;
      if (!Number.isInteger(i) || i < 0 || i >= cols * rows) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      let next = i;
      switch (e.key) {
        case 'ArrowRight':
          if (col < cols - 1) next = i + 1;
          break;
        case 'ArrowLeft':
          if (col > 0) next = i - 1;
          break;
        case 'ArrowDown':
          if (row < rows - 1) next = i + cols;
          break;
        case 'ArrowUp':
          if (row > 0) next = i - cols;
          break;
        case 'Home':
          next = row * cols;
          break;
        case 'End':
          next = row * cols + cols - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          this.activateCell(i);
          return;
        case 'i':
        case 'I':
          if (this.game.itemAt(i)) this.showItemInfo(i);
          return;
        default:
          return; // let every other key through
      }
      e.preventDefault();
      if (next !== i) this.focusCell(next);
    });
  }

  /** Move the roving focus to a cell (updates tabindex + DOM focus). */
  private focusCell(index: number): void {
    this.focusIndex = index;
    Array.from(this.root.children).forEach((c, i) => {
      (c as HTMLElement).tabIndex = i === index ? 0 : -1;
    });
    (this.root.children[index] as HTMLElement | undefined)?.focus();
  }

  /** Enter/Space on a cell: play the producer, or select/merge an item. */
  private activateCell(index: number): void {
    const cell = this.game.snapshot.board.cells[index];
    if (!cell) return;
    if (cell.kind === 'producer') {
      this.clearSelection();
      this.game.tapProducer();
      return;
    }
    if (cell.kind === 'item') {
      this.handleTap(index); // first Enter selects, a matching second Enter merges
      return;
    }
    this.clearSelection(); // Enter on empty cancels a pending selection
  }

  render(): void {
    const { board } = this.game.snapshot;
    const deliverable = this.game.deliverableIndex();
    if (deliverable >= 0) this.lastDeliverable = deliverable; // orb origin for the next delivery
    if (this.selected >= 0 && !this.game.itemAt(this.selected)) this.selected = -1; // stale selection
    this.applySkin();
    board.cells.forEach((c, i) => {
      const el = this.root.children[i] as HTMLElement;
      // checkerboard aligned to the REAL gameplay grid (the art's baked
      // squares can't line up with 6×7, so we paint our own turf squares)
      const parity = (Math.floor(i / board.cols) + (i % board.cols)) % 2;
      el.className = `cell ${parity ? 'turf-d' : 'turf-l'}`;
      el.innerHTML = '';
      if (c.kind === 'producer') {
        el.classList.add('producer');
        if (!artUrl('res_chest_closed')) el.innerHTML = '<span class="glyph">📦</span>';
      } else if (c.kind === 'item') {
        el.classList.add('item');
        const def = chainDef(c.item.chain);
        const lock = c.item.locked ? '<span class="pin" aria-hidden="true">🔒</span>' : '';
        el.innerHTML = `${tileMarkup(c.item.chain, c.item.level)}<span class="lv">${c.item.level + 1}</span>${lock}`;
        el.setAttribute(
          'aria-label',
          `${def.levelNames[c.item.level]} level ${c.item.level + 1}${c.item.locked ? ', locked' : ''}`,
        );
        if (i === deliverable) el.classList.add('deliverable');
        if (i === this.selected) el.classList.add('selected');
        if (c.item.locked) el.classList.add('locked');
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
        this.clearSelection();
        this.game.tapProducer();
        return;
      }
      if (!this.game.itemAt(idx)) {
        this.clearSelection(); // tap on empty cancels a pending selection
        return;
      }
      this.dragFrom = idx;
      this.dragging = false;
      this.root.setPointerCapture(e.pointerId);
      // Ghost is created lazily on first real drag so a plain tap stays clean.
      this.holdStart = { x: e.clientX, y: e.clientY };
      clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => {
        if (this.dragFrom === idx && !this.dragging) {
          this.cancelDrag(idx);
          this.showItemInfo(idx);
        }
      }, 480);
    });

    this.root.addEventListener('pointermove', (e) => {
      if (this.dragFrom < 0) return;
      if (!this.dragging) {
        if (this.holdStart && Math.hypot(e.clientX - this.holdStart.x, e.clientY - this.holdStart.y) > 9) {
          this.startDrag(e);
        } else {
          return;
        }
      }
      this.moveGhost(e.clientX, e.clientY);
      const over = this.cellIndexFromPoint(e.clientX, e.clientY);
      Array.from(this.root.children).forEach((c, i) => {
        (c as HTMLElement).classList.toggle('drop-ok', i === over && over !== this.dragFrom);
      });
    });

    const finish = (e: PointerEvent) => {
      clearTimeout(this.holdTimer);
      const from = this.dragFrom;
      const wasDragging = this.dragging;
      this.holdStart = null;
      if (from < 0) return;
      this.cancelDrag(from);
      const to = this.cellIndexFromPoint(e.clientX, e.clientY);
      if (wasDragging) {
        if (to >= 0 && to !== from) this.game.drop(from, to);
      } else {
        this.handleTap(from); // a clean tap → tap-to-merge selection
      }
    };
    this.root.addEventListener('pointerup', finish);
    this.root.addEventListener('pointercancel', finish);
  }

  /** Promote a press into a drag once it crosses the movement threshold. */
  private startDrag(_e: PointerEvent): void {
    this.dragging = true;
    clearTimeout(this.holdTimer);
    this.clearSelection();
    const item = this.game.itemAt(this.dragFrom);
    if (!item || item.locked) return; // pinned items don't drag (drop() also guards)
    this.ghost = document.createElement('div');
    this.ghost.id = 'drag-ghost';
    this.ghost.innerHTML = tileMarkup(item.chain, item.level);
    document.body.appendChild(this.ghost);
    (this.root.children[this.dragFrom] as HTMLElement).style.opacity = '0.35';
  }

  /** Tap-to-merge: first tap selects, a matching second tap merges. */
  private handleTap(from: number): void {
    const item = this.game.itemAt(from);
    if (!item) {
      this.clearSelection();
      return;
    }
    if (this.selected === from) {
      this.clearSelection();
      return;
    }
    if (this.selected >= 0) {
      const sel = this.selected;
      this.selected = -1;
      this.game.drop(sel, from); // merges if it matches; a no-op reject otherwise
      return;
    }
    this.selected = from;
    this.render();
  }

  private clearSelection(): void {
    if (this.selected < 0) return;
    this.selected = -1;
    this.render();
  }

  private cancelDrag(from: number): void {
    this.dragFrom = -1;
    this.dragging = false;
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
    // Lock / unlock (pin against accidental drag, auto-merge, bulk-clear)
    const lockBtn = document.getElementById('item-lock') as HTMLButtonElement | null;
    if (lockBtn) {
      lockBtn.textContent = item.locked ? '🔓 Unlock' : '🔒 Lock';
      lockBtn.onclick = () => {
        this.game.toggleLock(index);
        modal.hidden = true;
      };
    }
    // Sell this item for coins (a modest sink for surplus, esp. resources)
    const sellBtn = document.getElementById('item-sell') as HTMLButtonElement | null;
    if (sellBtn) {
      sellBtn.textContent = `Sell +${sellValue(item.chain, item.level)}`;
      sellBtn.disabled = !!item.locked;
      sellBtn.onclick = () => {
        this.game.sellItem(index);
        modal.hidden = true;
      };
    }
    // Bulk-clear this chain's clutter at or below this tier (locks are spared)
    const clearBtn = document.getElementById('item-clear') as HTMLButtonElement | null;
    if (clearBtn) {
      clearBtn.textContent = `Clear ${def.name} ≤ L${item.level + 1}`;
      let armed = false;
      clearBtn.onclick = () => {
        if (!armed) {
          armed = true;
          clearBtn.textContent = 'Tap again to clear';
          return;
        }
        this.game.clearMatching(item.chain, item.level);
        modal.hidden = true;
      };
    }
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

  private cellCentre(i: number): { x: number; y: number } | null {
    const el = this.root.children[i] as HTMLElement | undefined;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** Merge juice: a sparkle burst + an expanding ember ring at the target cell. */
  private mergeBurst(i: number): void {
    if (this.reduced()) return;
    const c = this.cellCentre(i);
    if (!c) return;
    const url = artUrl('fx_merge_sparkle');
    if (url) {
      const s = document.createElement('img');
      s.src = url;
      s.className = 'fx-sparkle';
      s.style.left = `${c.x}px`;
      s.style.top = `${c.y}px`;
      this.fxLayer.appendChild(s);
      setTimeout(() => s.remove(), 480);
    }
    const ring = document.createElement('div');
    ring.className = 'fx-ring';
    ring.style.left = `${c.x}px`;
    ring.style.top = `${c.y}px`;
    this.fxLayer.appendChild(ring);
    setTimeout(() => ring.remove(), 480);

    // The ember-heart blooms at the merge — Hearth's signature juice (7-frame
    // sprite strip, plays once). Only when motion is allowed (this.reduce guards).
    const heartUrl = artUrl('fx_heartfire');
    if (heartUrl) {
      const heart = document.createElement('div');
      heart.className = 'fx-heart';
      heart.style.left = `${c.x}px`;
      heart.style.top = `${c.y}px`;
      this.fxLayer.appendChild(heart);
      playStrip(heart, heartUrl, { fps: 14, onEnd: () => heart.remove() });
      setTimeout(() => heart.remove(), 700); // safety net if a frame stalls
    }
  }

  /** Deliver juice: an energy orb floats from the completed cell to the order card. */
  private deliverFly(): void {
    if (this.reduced()) return;
    const url = artUrl('fx_energy_orb');
    if (!url) return;
    const from = this.cellCentre(this.lastDeliverable) ?? this.boardCentre();
    const target = document.getElementById('deliver-btn') ?? document.querySelector('.order-card');
    if (!target) return;
    const tr = target.getBoundingClientRect();
    const to = { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 };
    const orb = document.createElement('img');
    orb.src = url;
    orb.className = 'fx-orb';
    orb.style.left = `${from.x}px`;
    orb.style.top = `${from.y}px`;
    this.fxLayer.appendChild(orb);
    requestAnimationFrame(() => {
      orb.style.transform = `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(0.5)`;
      orb.style.opacity = '0.15';
    });
    setTimeout(() => orb.remove(), 640);

    // the order lands: a heartfire bloom greets it at the order card
    const heartUrl = artUrl('fx_heartfire');
    if (heartUrl) {
      setTimeout(() => {
        const heart = document.createElement('div');
        heart.className = 'fx-heart';
        heart.style.left = `${to.x}px`;
        heart.style.top = `${to.y}px`;
        this.fxLayer.appendChild(heart);
        playStrip(heart, heartUrl, { fps: 14, onEnd: () => heart.remove() });
        setTimeout(() => heart.remove(), 700);
      }, 430);
    }
  }

  private boardCentre(): { x: number; y: number } {
    const r = this.root.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** Reflect the equipped cosmetic board skin as a class on the board root. */
  private applySkin(): void {
    const skin = this.game.currentSkin();
    if (this.root.dataset.skin === skin) return;
    this.root.classList.forEach((c) => {
      if (c.startsWith('skin-')) this.root.classList.remove(c);
    });
    if (skin && skin !== 'classic') this.root.classList.add(`skin-${skin}`);
    this.root.dataset.skin = skin;
  }
}
