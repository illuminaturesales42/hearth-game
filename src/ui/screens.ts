/**
 * Read-only cozy screens: Map (town progression), Villagers, Journal, Shop.
 * Rendered from src/data/world, gated by orders delivered so they track the
 * story. Rendered once on first view and refreshed on story progress.
 */
import type { Game } from '../core/game';
import { COLLECTIONS, EVENTS, JOURNAL, MAP_LOCATIONS, VILLAGERS } from '../data/world';
import type { JournalEntry } from '../data/world';
import { toast } from './toast';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const hearts = (n: number) => '♥'.repeat(n) + '♡'.repeat(Math.max(0, 5 - n));

export class Screens {
  private journalTab: JournalEntry['tab'] = 'Clues';

  constructor(private game: Game) {
    game.subscribe((ev) => {
      if (ev.type === 'delivered' || ev.type === 'chapterComplete') this.renderMap();
    });
  }

  renderAll(): void {
    this.renderMap();
    this.renderVillagers();
    this.renderJournal();
    this.renderShop();
  }

  renderMap(): void {
    const host = byId('map-body');
    if (!host) return;
    const delivered = this.game.snapshot.orderIndex;
    host.innerHTML =
      `<h2 class="screen-title">Emberhollow Harbour</h2>` +
      `<p class="screen-sub">Restore the village, one order at a time.</p>` +
      `<div class="scene-banner map-scene" role="img" aria-label="Illustration placeholder: painted harbour town"></div>` +
      `<div class="loc-list">` +
      MAP_LOCATIONS.map((l) => {
        const locked = delivered < l.unlockAt;
        return (
          `<div class="loc ${locked ? 'locked' : ''}">` +
          `<div class="loc-main"><b>${l.name}</b>` +
          (locked ? `<span class="loc-lock">Locked · ${l.unlockAt} orders</span>` : `<span class="loc-lvl">Level ${l.level}</span>`) +
          `</div><p>${locked ? 'Keep restoring the harbour to reach it.' : l.blurb}</p></div>`
        );
      }).join('') +
      `</div>`;
  }

  renderVillagers(): void {
    const host = byId('villagers-body');
    if (!host) return;
    host.innerHTML =
      `<h2 class="screen-title">Villagers</h2>` +
      `<p class="screen-sub">Warm the hearts of Emberhollow.</p>` +
      `<div class="vill-list">` +
      VILLAGERS.map(
        (v) =>
          `<div class="vill"><div class="vill-face" aria-hidden="true"></div>` +
          `<div class="vill-body"><b>${v.name}</b><span>${v.role}</span></div>` +
          `<span class="vill-hearts">${hearts(v.affinity)}</span></div>`,
      ).join('') +
      `</div>`;
  }

  renderJournal(): void {
    const host = byId('journal-body');
    if (!host) return;
    const tabs: JournalEntry['tab'][] = ['Clues', 'Letters', 'People', 'Places'];
    const entries = JOURNAL.filter((e) => e.tab === this.journalTab);
    host.innerHTML =
      `<h2 class="screen-title">Journal</h2>` +
      `<div class="jtabs">` +
      tabs.map((t) => `<button class="jtab ${t === this.journalTab ? 'on' : ''}" data-tab="${t}">${t}</button>`).join('') +
      `</div>` +
      `<div class="jentries">` +
      entries
        .map(
          (e) =>
            `<div class="jentry ${e.fresh ? 'fresh' : ''}">${e.fresh ? '<span class="jnew">New</span>' : ''}` +
            `<b>${e.title}</b><p>${e.note}</p></div>`,
        )
        .join('') +
      `</div>`;
    host.querySelectorAll<HTMLButtonElement>('.jtab').forEach((b) => {
      b.onclick = () => {
        this.journalTab = (b.dataset.tab as JournalEntry['tab']) ?? 'Clues';
        this.renderJournal();
      };
    });
  }

  renderShop(): void {
    const host = byId('shop-body');
    if (!host) return;
    host.innerHTML =
      `<h2 class="screen-title">Shop</h2>` +
      `<p class="screen-sub">Decor and collections. Energy is never for sale — that never changes.</p>` +
      `<div class="coll-list">` +
      COLLECTIONS.map(
        (c) =>
          `<div class="coll"><b>${c.name}</b><span>${c.have}/${c.total}</span>` +
          `<div class="coll-bar"><i style="width:${Math.round((c.have / c.total) * 100)}%"></i></div></div>`,
      ).join('') +
      `</div>` +
      `<h3 class="screen-h3">Events</h3>` +
      `<div class="event-list">` +
      EVENTS.map((e) => `<div class="event"><b>${e.name}</b><span>${e.timing}</span></div>`).join('') +
      `</div>` +
      `<button class="btn-primary wide" id="shop-cta">Browse decor</button>`;
    const cta = byId<HTMLButtonElement>('shop-cta');
    if (cta) cta.onclick = () => toast('Decor shop arrives with the M2 art pass.');
  }
}
