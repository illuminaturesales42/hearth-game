/**
 * Read-only cozy screens: Map (town progression), Villagers, Journal, Shop.
 * Rendered from src/data/world, gated by orders delivered so they track the
 * story. Rendered once on first view and refreshed on story progress.
 */
import type { Game } from '../core/game';
import { COLLECTIONS, EVENTS, JOURNAL } from '../data/world';
import type { JournalEntry } from '../data/world';
import { toast } from './toast';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

export class Screens {
  private journalTab: JournalEntry['tab'] = 'Clues';

  constructor(private game: Game) {}

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
