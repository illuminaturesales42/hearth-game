/**
 * Villagers = your Village. Two halves that look alike and work differently:
 * REAL other players at the top (friends, letters, duels) and the game's own
 * NPC villagers below (bonds, memories — never networked).
 *
 * Everything in the top half is a mirror of server state. This screen asks the
 * controller to do things and re-renders when the answer arrives; it never
 * grants anything itself, and it shows what it actually knows — including "we
 * have not been able to reach the village lately" when that is the truth.
 */
import type { Game } from '../core/game';
import type { SocialController } from '../platform/social-controller';
import type { MailboxEntry, RemoteFriend } from '../core/types';
import { chainDef } from '../core/board';
import { portraitFor } from './art';
import { esc } from './esc';
import { greetingFor } from '../core/relationships';
import { VILLAGER_DEFS } from '../data/villagers';
import { toast } from './toast';
import { avatarPortraitHTML } from './avatar-render';
import { openAvatarCreator } from './avatar-creator';
import type { SocialErr } from '../platform/social-provider';

const host = () => document.getElementById('villagers-body');
const hearts = (n: number) => '♥'.repeat(n) + '♡'.repeat(Math.max(0, 5 - n));

/** Used when the controller is absent (tests, or a build with no service). */
const offline = () => ({ ok: false as const, error: 'offline' as const });

/** Warm copy for every failure the provider can report. */
function errCopy(err: SocialErr): string {
  switch (err) {
    case 'offline':
      return 'The village is out of reach just now — try again when you’re back online.';
    case 'auth':
      return 'Hearth hasn’t met this device yet. Reopen the game and try again.';
    case 'capped':
      return 'That’s enough for today — the village will be ready again tomorrow.';
    case 'conflict':
      return 'That’s already been done.';
    case 'expired':
      return 'That one has passed its moment.';
    case 'invalid':
      return 'That didn’t look quite right.';
    default:
      return 'Something went awry on the way. Try again in a moment.';
  }
}

/** "By the hearth today" reads better than a timestamp, and says enough. */
function lastSeenCopy(ms: number, now: number): string {
  const days = Math.floor((now - ms) / 86_400_000);
  if (days <= 0) return 'By the hearth today';
  if (days === 1) return 'Here yesterday';
  if (days < 7) return `Seen ${days} days ago`;
  if (days < 30) return 'Away a while';
  return 'Long away';
}

export class SocialScreen {
  private pending = new Set<string>();

  constructor(
    private game: Game,
    private onDuel: () => void = () => undefined,
    private social: SocialController | null = null,
    private onPlayChallenge: (duelId: string) => void = () => undefined,
  ) {
    game.subscribe((ev) => {
      if (
        (ev.type === 'social' || ev.type === 'duelEnd' || ev.type === 'bond' || ev.type === 'avatar') &&
        this.isVisible()
      )
        this.render();
    });
  }

  private isVisible(): boolean {
    return document.getElementById('screen-villagers')?.classList.contains('active') ?? false;
  }

  /** Run a controller call with a pending button state and a warm failure toast. */
  private async act(key: string, fn: () => Promise<{ ok: boolean; error?: SocialErr }>, done?: string): Promise<void> {
    if (this.pending.has(key)) return;
    this.pending.add(key);
    this.render();
    try {
      const res = await fn();
      if (!res.ok) toast(errCopy(res.error ?? 'server'));
      else if (done) toast(done);
    } finally {
      this.pending.delete(key);
      this.render();
    }
  }

  render(): void {
    const el = host();
    if (!el) return;
    const s = this.game.socialState;
    const now = Date.now();
    const reqs = this.game.activeRequests();
    const me = this.game.avatar;
    const gifts = s.inbox.filter((e) => e.payload.kind === 'gift' || e.payload.kind === 'help_fulfil');
    const asks = s.inbox.filter((e) => e.payload.kind === 'help_request');
    const openDuels = s.duels.filter((d) => d.status === 'open');

    el.innerHTML =
      `<h2 class="screen-title">Your Village</h2>` +
      // The player's own identity card — their painted face, their name, tappable
      // to change. First real "profile" surface (GDD §8 social identity).
      `<button type="button" class="you-card" id="you-card">` +
      `<span class="you-face">${avatarPortraitHTML(me.portrait, { framed: true, label: 'your look' })}</span>` +
      `<span class="you-body"><b>${me.name ? esc(me.name) : 'You'}</b>` +
      `<span>${me.created ? 'A villager of Emberhollow' : 'Tap to choose your look'}</span></span>` +
      `<span class="you-go">›</span></button>` +
      `<p class="screen-sub">Invite friends to Emberhollow. When they join, your hearth flares. Ask a friend for a hand when a task runs tough.</p>` +
      (s.migratedNote
        ? `<p class="med-log-note">The placeholder villagers who used to live here have moved on — everyone in this list is a real person now.</p>`
        : '') +
      this.inviteCard(s.inviteUrl) +
      `<button class="med-cta duel-cta" id="duel-start">` +
      `<span class="med-cta-ico">⚔️</span>` +
      `<span class="med-cta-body"><b>Bonfire Duel</b><span>Race Old Joss · win streak ×${this.game.duelStreak}</span></span>` +
      `<span class="med-cta-go">›</span></button>` +
      this.duelCards(openDuels, now) +
      (reqs.length
        ? `<p class="earn-label">Town requests</p>` +
          `<p class="screen-sub folk-sub">Craft resources at the Workshop and hand them over for coins.</p>` +
          `<div class="req-list">` +
          reqs
            .map((r) => {
              const def = chainDef(r.chain);
              const name = def.levelNames[r.level] ?? def.name;
              const can = this.game.canFulfil(r);
              return (
                `<div class="req"><div class="req-body"><b>${esc(r.who)} needs ${r.qty}× ${esc(name)}</b>` +
                `<span>${esc(def.name)} · +${r.coins} coins</span></div>` +
                (can
                  ? `<button class="earn-btn" data-req="${r.id}">Give</button>`
                  : `<span class="earn-auto">Need ${r.qty}× L${r.level + 1}</span>`) +
                `</div>`
              );
            })
            .join('') +
          `</div>`
        : '') +
      this.giftList(gifts) +
      this.askList(asks) +
      `<p class="earn-label">Village friends</p>` +
      (s.friends.length ? this.friendList(s.friends, now) : this.emptyVillage(s.syncedAt, now)) +
      `<p class="earn-label">Village folk</p>` +
      `<p class="screen-sub folk-sub">The people of Emberhollow remember what you do for them. Help them, and the hearts fill.</p>` +
      `<div class="friend-list folk-list">` +
      VILLAGER_DEFS.map((v) => {
        const bust = portraitFor(v.name);
        const face = bust
          ? `<div class="friend-face npc has-art" style="background-image:url(${bust})" aria-hidden="true"></div>`
          : `<div class="friend-face npc" aria-hidden="true"></div>`;
        const b = this.game.bond(v.id);
        const rel = this.game.snapshot.relationships;
        const greeting = greetingFor(rel, v.id);
        const memory = rel[v.id]?.memories[0];
        return (
          `<div class="folk">` +
          `<div class="folk-head">${face}` +
          `<div class="friend-body"><b>${esc(v.name)}</b><span>${esc(v.role)} · ${esc(v.trait)}</span></div>` +
          `<span class="friend-hearts" title="${b.hearts}/5">${hearts(b.hearts)}</span></div>` +
          `<p class="folk-greet">${esc(greeting)}</p>` +
          (memory && b.hearts > 0
            ? ''
            : `<p class="folk-hint">Deliver ${esc(v.name)}’s orders to earn their trust — you’ll find them near ${esc(v.favouritePlace)}.</p>`) +
          `</div>`
        );
      }).join('') +
      `</div>`;

    this.wire(el);
  }

  private inviteCard(url: string | null): string {
    const busy = this.pending.has('invite');
    return (
      `<div class="invite-card">` +
      `<div class="invite-copy"><b>Invite a friend</b>` +
      `<span>${
        url
          ? 'Your link is ready — share it with someone you’d like beside your hearth.'
          : 'You both get a hearth boost the moment they join.'
      }</span></div>` +
      `<button class="btn-primary" id="invite-btn"${busy ? ' disabled' : ''}>` +
      `${busy ? 'Writing…' : url ? 'Copy invite link' : 'Create invite link'}</button>` +
      `</div>`
    );
  }

  private duelCards(
    duels: readonly { duelId: string; opponentName: string; myScore: number | null; expiresAt: number }[],
    now: number,
  ): string {
    if (duels.length === 0) return '';
    return (
      `<p class="earn-label">Bonfire challenges</p><div class="req-list">` +
      duels
        .map((d) => {
          const days = Math.max(0, Math.ceil((d.expiresAt - now) / 86_400_000));
          const waiting = d.myScore !== null;
          return (
            `<div class="req"><div class="req-body"><b>${esc(d.opponentName)}</b>` +
            `<span>${
              waiting
                ? `You scored ${d.myScore} · waiting for them`
                : `Threw down a challenge · ${days} day${days === 1 ? '' : 's'} left`
            }</span></div>` +
            (waiting
              ? `<span class="earn-auto">Waiting</span>`
              : `<button class="earn-btn" data-play="${esc(d.duelId)}">Play</button>`) +
            `</div>`
          );
        })
        .join('') +
      `</div>`
    );
  }

  private giftList(gifts: readonly MailboxEntry[]): string {
    if (gifts.length === 0) return '';
    return (
      `<p class="earn-label">Gifts waiting</p><div class="gift-list">` +
      gifts
        .map((g) => {
          const p = g.payload;
          const chain = p.kind === 'gift' || p.kind === 'help_fulfil' ? p.chain : 'wood';
          const level = p.kind === 'gift' ? p.level : 0;
          const def = chainDef(chain);
          const glyph = def.levels[level] ?? '🎁';
          const count = p.kind === 'help_fulfil' ? `${p.count}× ` : '';
          const busy = this.pending.has(g.id);
          return (
            `<div class="gift"><span class="gift-ico">${glyph}</span>` +
            `<span class="gift-body"><b>${count}${esc(def.name)}</b><span>from ${esc(g.fromName)}</span></span>` +
            `<button class="earn-btn" data-gift="${esc(g.id)}"${busy ? ' disabled' : ''}>${
              busy ? '…' : 'Place'
            }</button></div>`
          );
        })
        .join('') +
      `</div>`
    );
  }

  private askList(asks: readonly MailboxEntry[]): string {
    if (asks.length === 0) return '';
    return (
      `<p class="earn-label">A friend needs a hand</p><div class="gift-list">` +
      asks
        .map((a) => {
          const chain = a.payload.kind === 'help_request' ? a.payload.chain : 'wood';
          const def = chainDef(chain);
          const busy = this.pending.has(a.id);
          return (
            `<div class="gift"><span class="gift-ico">${def.levels[0] ?? '🤝'}</span>` +
            `<span class="gift-body"><b>${esc(a.fromName)} asks for a hand</b>` +
            `<span>Send 2× ${esc(def.name)} — it costs you nothing</span></span>` +
            `<button class="earn-btn" data-fulfil="${esc(a.id)}"${busy ? ' disabled' : ''}>${
              busy ? '…' : 'Send'
            }</button></div>`
          );
        })
        .join('') +
      `</div>`
    );
  }

  private friendList(friends: readonly RemoteFriend[], now: number): string {
    return (
      `<div class="friend-list">` +
      friends
        .map((f) => {
          const canAsk = this.game.canAskFriend(f.playerId, now);
          const canGift = this.game.canGiftFriend(f.playerId, now);
          const busy = this.pending.has(f.playerId);
          return (
            `<div class="friend">` +
            `<div class="friend-face has-art">${avatarPortraitHTML(f.portrait, { framed: false, label: f.name })}</div>` +
            `<div class="friend-body"><b>${esc(f.name)}</b><span>${lastSeenCopy(f.lastSeen, now)}</span></div>` +
            `<div class="friend-acts">` +
            (canAsk
              ? `<button class="earn-btn" data-ask="${esc(f.playerId)}"${busy ? ' disabled' : ''}>Ask for help</button>`
              : `<span class="earn-auto">Asked today</span>`) +
            (canGift
              ? `<button class="earn-btn ghost" data-give="${esc(f.playerId)}"${busy ? ' disabled' : ''}>Gift</button>`
              : '') +
            `<button class="earn-btn ghost" data-challenge="${esc(f.playerId)}"${busy ? ' disabled' : ''}>Duel</button>` +
            `<button class="earn-btn ghost" data-unfriend="${esc(f.playerId)}">Remove</button>` +
            `</div></div>`
          );
        })
        .join('') +
      `</div>`
    );
  }

  /** Never sad — an empty bench by the hearth, and an honest line about why. */
  private emptyVillage(syncedAt: number, now: number): string {
    const stale = syncedAt === 0 || now - syncedAt > 6 * 3_600_000;
    return (
      `<div class="village-empty">` +
      `<p>No one has joined you yet. Share your invite link and the first chair by the fire is theirs.</p>` +
      (stale
        ? `<p class="med-log-note">${
            syncedAt === 0
              ? 'Hearth hasn’t reached the village service yet — your friends will appear here once it can.'
              : 'Last checked a while ago; this list may be out of date.'
          }</p>`
        : '') +
      `</div>`
    );
  }

  private wire(el: HTMLElement): void {
    const youCard = el.querySelector<HTMLButtonElement>('#you-card');
    if (youCard) youCard.onclick = () => void openAvatarCreator(this.game);

    const invite = el.querySelector<HTMLButtonElement>('#invite-btn');
    if (invite)
      invite.onclick = () => {
        const existing = this.game.socialState.inviteUrl;
        if (existing) {
          void navigator.clipboard?.writeText(existing).catch(() => undefined);
          toast('Invite link copied — share Emberhollow with a friend.');
          return;
        }
        void this.act('invite', async () => {
          const res = (await this.social?.createInvite()) ?? offline();
          if (res.ok) {
            await navigator.clipboard?.writeText(res.value.url).catch(() => undefined);
            toast('Invite link copied — share Emberhollow with a friend.');
          }
          return res;
        });
      };

    el.querySelectorAll<HTMLButtonElement>('[data-ask]').forEach((b) => {
      const id = b.dataset.ask ?? '';
      b.onclick = () =>
        void this.act(id, async () => (await this.social?.requestHelp(id)) ?? offline(), 'Your ask is on its way.');
    });
    el.querySelectorAll<HTMLButtonElement>('[data-give]').forEach((b) => {
      const id = b.dataset.give ?? '';
      b.onclick = () =>
        void this.act(id, async () => (await this.social?.sendGift(id)) ?? offline(), 'Sent, with warmth.');
    });
    el.querySelectorAll<HTMLButtonElement>('[data-challenge]').forEach((b) => {
      const id = b.dataset.challenge ?? '';
      b.onclick = () =>
        void this.act(
          id,
          async () => (await this.social?.challenge(id)) ?? offline(),
          'Challenge thrown — they’ll see it next time they visit.',
        );
    });
    el.querySelectorAll<HTMLButtonElement>('[data-unfriend]').forEach((b) => {
      const id = b.dataset.unfriend ?? '';
      b.onclick = () => void this.act(id, async () => (await this.social?.removeFriend(id)) ?? offline());
    });
    el.querySelectorAll<HTMLButtonElement>('[data-fulfil]').forEach((b) => {
      const id = b.dataset.fulfil ?? '';
      b.onclick = () => {
        const entry = this.game.entryById(id);
        if (!entry) return;
        void this.act(id, async () => (await this.social?.fulfilHelp(entry)) ?? offline(), 'A hand is on its way.');
      };
    });
    el.querySelectorAll<HTMLButtonElement>('[data-gift]').forEach((b) => {
      const id = b.dataset.gift ?? '';
      b.onclick = () => {
        const entry = this.game.entryById(id);
        if (!entry) return;
        void this.act(id, async () => (await this.social?.claim(entry)) ?? offline());
      };
    });
    el.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) => {
      b.onclick = () => this.onPlayChallenge(b.dataset.play ?? '');
    });
    el.querySelectorAll<HTMLButtonElement>('[data-req]').forEach((b) => {
      b.onclick = () => {
        this.game.fulfilRequest(b.dataset.req ?? '');
        this.render();
      };
    });
    const duel = el.querySelector<HTMLButtonElement>('#duel-start');
    if (duel) duel.onclick = () => this.onDuel();
  }
}
