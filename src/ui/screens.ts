/**
 * Read-only cozy screens plus the Journal's interactive "Good Days" tab:
 * write one good thing about your day for streak-multiplied energy, revisit
 * past entries, and claim a flashback boost when an old good day resurfaces.
 */
import type { Game } from '../core/game';
import { COLLECTIONS, EVENTS, JOURNAL } from '../data/world';
import { GRATITUDE } from '../data/gratitude';
import { toast } from './toast';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
type JTab = 'Good Days' | 'Clues' | 'Letters' | 'People' | 'Places';
const TABS: JTab[] = ['Good Days', 'Clues', 'Letters', 'People', 'Places'];

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
function ago(now: number, then: number): string {
  const d = Math.max(0, Math.round((now - then) / 86_400_000));
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

export class Screens {
  private journalTab: JTab = 'Good Days';

  constructor(private game: Game) {
    game.subscribe((ev) => {
      if ((ev.type === 'gratitude' || ev.type === 'flashback') && this.journalVisible()) {
        this.renderJournal();
      }
    });
  }

  private journalVisible(): boolean {
    return byId('screen-journal')?.classList.contains('active') ?? false;
  }

  renderJournal(): void {
    const host = byId('journal-body');
    if (!host) return;
    host.innerHTML =
      `<h2 class="screen-title">Journal</h2>` +
      `<div class="jtabs">` +
      TABS.map((t) => `<button class="jtab ${t === this.journalTab ? 'on' : ''}" data-tab="${t}">${t}</button>`).join('') +
      `</div>` +
      (this.journalTab === 'Good Days' ? this.goodDays() : this.storyEntries());

    host.querySelectorAll<HTMLButtonElement>('.jtab').forEach((b) => {
      b.onclick = () => {
        this.journalTab = (b.dataset.tab as JTab) ?? 'Good Days';
        this.renderJournal();
      };
    });
    if (this.journalTab === 'Good Days') this.wireGoodDays(host);
  }

  private storyEntries(): string {
    const entries = JOURNAL.filter((e) => e.tab === this.journalTab);
    return (
      `<div class="jentries">` +
      entries
        .map(
          (e) =>
            `<div class="jentry ${e.fresh ? 'fresh' : ''}">${e.fresh ? '<span class="jnew">New</span>' : ''}` +
            `<b>${e.title}</b><p>${e.note}</p></div>`,
        )
        .join('') +
      `</div>`
    );
  }

  private goodDays(): string {
    const now = Date.now();
    const g = this.game.gratitudeState;
    const flash = this.game.pendingFlashback(now);
    const preview = this.game.gratitudePreview();
    const canWrite = this.game.canWriteGratitude(now);

    const flashCard = flash
      ? `<div class="flashback"><span class="flash-eyebrow">A good day, remembered — ${ago(now, flash.createdAt)}</span>` +
        `<p>“${esc(flash.text)}”</p>` +
        `<button class="btn-primary" id="flash-claim">Hold onto it · +${GRATITUDE.flashbackBoost}</button></div>`
      : '';

    const writer = canWrite
      ? `<div class="gd-writer">` +
        `<label for="gd-input">Write one good thing about today</label>` +
        `<textarea id="gd-input" maxlength="${GRATITUDE.maxLen}" rows="3" placeholder="A small kindness, a warm moment, something that went right…"></textarea>` +
        `<div class="gd-actions"><span class="gd-preview">Streak ×${preview.multiplier.toFixed(1)} → <b>+${preview.energy}</b> energy</span>` +
        `<button class="btn-primary" id="gd-add">Add to journal</button></div></div>`
      : `<div class="gd-done">Today's good thing is written. See you tomorrow. ✦</div>`;

    const list = g.entries.length
      ? `<p class="earn-label">Your good days</p><div class="gd-list">` +
        g.entries
          .map((e) => `<div class="gd-entry"><span class="gd-when">${ago(now, e.createdAt)}</span><p>“${esc(e.text)}”</p></div>`)
          .join('') +
        `</div>`
      : '';

    return `<div class="good-days">${flashCard}${writer}${list}</div>`;
  }

  private wireGoodDays(host: HTMLElement): void {
    const add = host.querySelector<HTMLButtonElement>('#gd-add');
    const input = host.querySelector<HTMLTextAreaElement>('#gd-input');
    if (add && input) {
      add.onclick = () => {
        const text = input.value.trim();
        if (!text) {
          toast('Write a few words first — anything good.');
          return;
        }
        this.game.writeGratitude(text);
      };
    }
    const claim = host.querySelector<HTMLButtonElement>('#flash-claim');
    if (claim) claim.onclick = () => this.game.claimFlashback();
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
