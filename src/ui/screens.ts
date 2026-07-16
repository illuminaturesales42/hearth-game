/**
 * Read-only cosy screens plus the Journal's interactive "Good Days" tab:
 * write one good thing about your day for streak-multiplied energy, revisit
 * past entries, and claim a flashback boost when an old good day resurfaces.
 */
import type { Game } from '../core/game';
import { COLLECTIONS, EVENTS, JOURNAL } from '../data/world';
import { GRATITUDE } from '../data/gratitude';
import { ACHIEVEMENTS } from '../core/achievements';
import { BOARD_SKINS } from '../data/shop';
import { BUILDING_INFO, DECOR_CATALOG, TOWN_BUILDINGS } from '../data/town-layout';
import { chainDef } from '../core/board';
import { artUrl, portraitFor, tileMarkup } from './art';
import { feedback } from './feedback';
import { toast } from './toast';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
type JTab = 'Chronicle' | 'Good Days' | 'Clues' | 'Letters' | 'People' | 'Places';
const TABS: JTab[] = ['Chronicle', 'Good Days', 'Clues', 'Letters', 'People', 'Places'];

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
/** An illustrated section-header banner, only when the art id has been sliced. */
function sectionBanner(id: string): string {
  const url = artUrl(id);
  return url ? `<div class="section-banner" style="background-image:url(${url})" aria-hidden="true"></div>` : '';
}
function ago(now: number, then: number): string {
  const d = Math.max(0, Math.round((now - then) / 86_400_000));
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

export class Screens {
  private journalTab: JTab = 'Good Days';

  constructor(private game: Game) {
    game.subscribe((ev) => {
      if ((ev.type === 'gratitude' || ev.type === 'flashback' || ev.type === 'delivered') && this.journalVisible()) {
        this.renderJournal();
      }
      // The Collect tab shows what you've gathered — keep it live as loot lands
      // (mini-game/duel wins) or leaves (gifted, delivered) while it's on screen.
      if (
        (ev.type === 'minigameEnd' || ev.type === 'duelEnd' || ev.type === 'repoGiven' || ev.type === 'delivered') &&
        this.shopVisible()
      ) {
        this.renderShop();
      }
    });
  }

  private journalVisible(): boolean {
    return byId('screen-journal')?.classList.contains('active') ?? false;
  }

  private shopVisible(): boolean {
    return byId('screen-shop')?.classList.contains('active') ?? false;
  }

  renderJournal(): void {
    const host = byId('journal-body');
    if (!host) return;
    host.innerHTML =
      `<h2 class="screen-title">Journal</h2>` +
      `<div class="jtabs">` +
      TABS.map((t) => `<button class="jtab ${t === this.journalTab ? 'on' : ''}" data-tab="${t}">${t}</button>`).join(
        '',
      ) +
      `</div>` +
      (this.journalTab === 'Chronicle'
        ? this.chronicle()
        : this.journalTab === 'Good Days'
          ? this.goodDays()
          : this.storyEntries());

    host.querySelectorAll<HTMLButtonElement>('.jtab').forEach((b) => {
      b.onclick = () => {
        this.journalTab = (b.dataset.tab as JTab) ?? 'Good Days';
        this.renderJournal();
      };
    });
    if (this.journalTab === 'Good Days') this.wireGoodDays(host);
  }

  /** The Chronicle: prose memories of your days, written by the village. */
  private chronicle(): string {
    const entries = this.game.snapshot.chronicle.entries;
    if (entries.length === 0) {
      return (
        `<div class="chron-page"><span class="chron-day">The Chronicle of Emberhollow</span>` +
        `<p>Each night, the village writes down what your day meant to it. ` +
        `Come back tomorrow and the first page will be waiting.</p></div>`
      );
    }
    return entries
      .map((e) => {
        const d = new Date(`${e.day}T12:00:00`);
        const label = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
        return `<div class="chron-page"><span class="chron-day">${label}</span><p>${e.text}</p></div>`;
      })
      .join('');
  }

  private storyEntries(): string {
    // Entries unlock with story progress; the mystery assembles as you play.
    const delivered = this.game.snapshot.orderIndex;
    const entries = JOURNAL.filter((e) => e.tab === this.journalTab && delivered >= e.at).reverse();
    if (entries.length === 0) {
      return `<div class="gd-done">Nothing here yet. Deliver orders in Emberhollow and the ${this.journalTab.toLowerCase()} will find you.</div>`;
    }
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
          .map(
            (e) =>
              `<div class="gd-entry"><span class="gd-when">${ago(now, e.createdAt)}</span><p>“${esc(e.text)}”</p></div>`,
          )
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

  /**
   * "Your Repository" — everything gathered from Village Life games and Bonfire
   * Duels, kept safe. Each mini-game chain has a villager who'd love it (gift for
   * coins); when the current town order matches something held, you can deliver
   * it straight from here. Keep-everything: nothing is ever sold off or discarded.
   */
  private repositorySection(): string {
    const repo = this.game.repository;
    const requests = this.game.repositoryRequests();
    const canDeliver = this.game.canDeliverFromRepository();
    const need = this.game.currentOrder().need;
    // Art-gated illustrated header banner (lights up when ui_repository_header lands).
    const banner = sectionBanner('ui_repository_header');

    if (repo.length === 0) {
      return (
        banner +
        `<h2 class="screen-title">Your Repository</h2>` +
        `<p class="screen-sub repo-empty">Nothing kept yet. Play a building’s game, or win a Bonfire Duel, ` +
        `and what you gather rests here — safe until the village asks for it.</p>`
      );
    }

    // Group the shelves by chain so a run visibly adds to a growing pile.
    const shelves = repo
      .slice()
      .sort((a, b) => a.chain.localeCompare(b.chain) || a.level - b.level)
      .map((r) => {
        const name = chainDef(r.chain).levelNames[r.level] ?? '';
        const req = requests.find((q) => q.chain === r.chain && q.level === r.level);
        const matchesOrder = need.chain === r.chain && need.level === r.level;
        const bust = req ? portraitFor(req.who) : null;
        const action = matchesOrder
          ? `<button class="repo-give repo-deliver" data-deliver="1">Give to ${esc(
              this.game.currentOrder().who,
            )}</button>`
          : req
            ? `<button class="repo-give" data-chain="${r.chain}" data-level="${r.level}">` +
              `Give to ${esc(req.who)} · +${req.coins}🪙</button>`
            : '';
        const ask = matchesOrder
          ? `<p class="repo-ask repo-ask-order">${esc(this.game.currentOrder().who)} needs exactly this.</p>`
          : req
            ? `<p class="repo-ask">${bust ? `<span class="repo-bust" style="background-image:url(${bust})"></span>` : ''}“${esc(req.text)}”</p>`
            : '';
        return (
          `<div class="repo-shelf">` +
          `<div class="repo-tile">${tileMarkup(r.chain, r.level)}<span class="repo-count">×${r.count}</span></div>` +
          `<div class="repo-body"><b>${esc(name)}</b>${ask}${action}</div>` +
          `</div>`
        );
      })
      .join('');

    const hint = canDeliver
      ? `The village is asking for something you hold — hand it over below.`
      : `Gather more from the building games; when the town asks for what you’ve kept, you can give it here.`;

    return (
      banner +
      `<h2 class="screen-title">Your Repository</h2>` +
      `<p class="screen-sub">${hint}</p>` +
      `<div class="repo-list">${shelves}</div>`
    );
  }

  renderShop(): void {
    const host = byId('shop-body');
    if (!host) return;
    const earned = new Set(this.game.snapshot.achievements);
    const coins = this.game.snapshot.coins;
    const delivered = this.game.snapshot.orderIndex;

    // ---- Market: cosmetic board skins (coins buy beauty, never power) ----
    const skins = BOARD_SKINS.map((sk) => {
      const owned = this.game.ownsSkin(sk.id);
      const equipped = this.game.currentSkin() === sk.id;
      const label = equipped ? 'Equipped' : owned ? 'Equip' : `Buy · ${sk.cost}🪙`;
      const afford = owned || coins >= sk.cost;
      return (
        `<button class="shop-skin ${equipped ? 'on' : ''}" data-skin="${sk.id}" data-cost="${sk.cost}" ` +
        `${equipped || !afford ? 'disabled' : ''}>` +
        `<span class="skin-swatch" style="background:${sk.swatch}"></span>` +
        `<b>${esc(sk.name)}</b><span>${esc(sk.note)}</span><em>${label}</em></button>`
      );
    }).join('');

    // ---- Beautify restored buildings (surfaces the existing coin upgrade) ----
    const beautify = TOWN_BUILDINGS.filter(
      (b) => BUILDING_INFO[b.art] && delivered >= b.unlockAt && this.game.upgradeCost(b.art) !== null,
    )
      .map((b) => {
        const cost = this.game.upgradeCost(b.art)!;
        const tier = this.game.upgradeTier(b.art);
        const afford = coins >= cost;
        return (
          `<button class="shop-upgrade" data-art="${b.art}" ${afford ? '' : 'disabled'}>` +
          `<b>${esc(BUILDING_INFO[b.art]!)}</b><span>Tier ${tier + 1} → ${tier + 2}</span>` +
          `<em>${cost}🪙</em></button>`
        );
      })
      .join('');

    // ---- Town decorations: preview the decor catalogue + a CTA into the
    // map's Decorate mode (where pieces are placed and paid for). ----
    const decor = DECOR_CATALOG.map((d) => {
      const url = artUrl(d.art);
      const thumb = url
        ? `<span class="decor-thumb" style="background-image:url(${url})"></span>`
        : `<span class="decor-thumb"></span>`;
      return `<div class="shop-decor">${thumb}<b>${esc(d.name)}</b><em>${d.cost}🪙</em></div>`;
    }).join('');

    host.innerHTML =
      this.repositorySection() +
      `<h2 class="screen-title">Market</h2>` +
      `<p class="screen-sub">Coins buy beauty and comfort — never power, never energy.</p>` +
      `<p class="earn-label">Your coins · ${coins}🪙</p>` +
      `<p class="earn-label">Board skins</p>` +
      `<div class="shop-grid">${skins}</div>` +
      (beautify ? `<p class="earn-label">Beautify Emberhollow</p><div class="shop-grid">${beautify}</div>` : '') +
      `<p class="earn-label">Town decorations</p>` +
      `<div class="shop-grid">${decor}</div>` +
      `<button id="shop-decorate" class="btn-primary shop-cta">🪴 Decorate the town</button>` +
      `<h2 class="screen-title" style="margin-top:20px">Collections</h2>` +
      `<p class="earn-label">Achievements · ${earned.size}/${ACHIEVEMENTS.length}</p>` +
      `<div class="badge-grid">` +
      ACHIEVEMENTS.map((a) => {
        const has = earned.has(a.id);
        const art = a.art ? artUrl(a.art) : null;
        const lockUrl = artUrl('icon_lock');
        const ico = art
          ? `<span class="badge-ico badge-art" style="background-image:url(${art})"></span>`
          : has
            ? `<span class="badge-ico">${a.icon}</span>`
            : lockUrl
              ? `<span class="badge-ico badge-art locked-art" style="background-image:url(${lockUrl})"></span>`
              : `<span class="badge-ico">🔒</span>`;
        return (
          `<div class="badge ${has ? 'earned' : 'locked'}" title="${a.desc}">${ico}` +
          `<b>${a.title}</b><span>${a.desc}</span></div>`
        );
      }).join('') +
      `</div>` +
      `<p class="earn-label">Chain mastery</p>` +
      `<div class="coll-list">` +
      COLLECTIONS.map((c) => {
        const p = this.game.collectionProgress(c.id);
        const label = p.done ? `Mastered · +${c.coins}🪙` : `${p.have}/${p.total}`;
        return (
          `<div class="coll ${p.done ? 'done' : ''}"><b>${c.name}</b><span>${label}</span>` +
          `<div class="coll-bar"><i style="width:${Math.round((p.have / p.total) * 100)}%"></i></div></div>`
        );
      }).join('') +
      `</div>` +
      `<h3 class="screen-h3">Events</h3>` +
      `<div class="event-list">` +
      EVENTS.map((e) => `<div class="event"><b>${e.name}</b><span>${e.timing}</span></div>`).join('') +
      `</div>` +
      `<p class="set-note">Energy is never for sale — that never changes.</p>`;

    // Wire the Market buttons (re-render to reflect the new balance/equip state).
    host.querySelectorAll<HTMLButtonElement>('.shop-skin').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.skin!;
        const cost = Number(btn.dataset.cost);
        const owned = this.game.ownsSkin(id);
        if (this.game.buySkin(id, cost)) {
          toast(owned ? 'Skin equipped.' : `Skin unlocked — −${cost} coins.`);
          this.renderShop();
        } else {
          toast('Not enough coins yet.');
        }
      };
    });
    host.querySelectorAll<HTMLButtonElement>('.shop-upgrade').forEach((btn) => {
      btn.onclick = () => {
        const art = btn.dataset.art!;
        const cost = this.game.upgradeCost(art);
        if (this.game.upgradeBuilding(art)) {
          toast(`Beautified — −${cost} coins.`);
          this.renderShop();
        } else {
          toast('Not enough coins yet.');
        }
      };
    });
    // Repository: gift held loot for coins, or deliver it to the current order.
    host.querySelectorAll<HTMLButtonElement>('.repo-give').forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.deliver === '1') {
          this.game.deliverFromRepository();
          feedback.chime(587);
          toast('Handed over from your Repository — the village is grateful.');
        } else {
          const chain = btn.dataset.chain as import('../core/types').ChainId;
          const level = Number(btn.dataset.level);
          if (this.game.giveFromRepository(chain, level)) {
            feedback.chime(560);
          }
        }
        this.renderShop();
      };
    });
    // Jump to Home and open the map's Decorate mode to place decorations.
    const decorateBtn = host.querySelector<HTMLButtonElement>('#shop-decorate');
    if (decorateBtn) {
      decorateBtn.onclick = () => {
        document.querySelector<HTMLElement>('[data-screen="home"]')?.click();
        setTimeout(() => {
          const db = document.getElementById('decor-btn') as HTMLButtonElement | null;
          if (db && !db.classList.contains('on')) db.click();
        }, 80);
      };
    }
  }
}
