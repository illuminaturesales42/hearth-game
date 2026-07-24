/**
 * Villagers = your Village. Social layer: invite friends (both get an energy
 * boost when they join), and ask joined friends for help — they send starter
 * items of your current task's chain to a Gifts inbox you place on the board.
 *
 * Backend is a client-side simulation for now (clearly labelled). The Game API
 * is the real contract; swapping in a server later doesn't touch this screen.
 */
import type { Game } from '../core/game';
import { chainDef } from '../core/board';
import { portraitFor } from './art';
import { esc } from './esc';
import { JOIN_BONUS } from '../core/social';
import { greetingFor } from '../core/relationships';
import { VILLAGER_DEFS } from '../data/villagers';
import { toast } from './toast';
import { avatarPortraitHTML } from './avatar-render';
import { openAvatarCreator } from './avatar-creator';

const host = () => document.getElementById('villagers-body');
const hearts = (n: number) => '♥'.repeat(n) + '♡'.repeat(Math.max(0, 5 - n));

export class SocialScreen {
  constructor(
    private game: Game,
    private onDuel: () => void = () => undefined,
  ) {
    game.subscribe((ev) => {
      if ((ev.type === 'social' || ev.type === 'duelEnd' || ev.type === 'bond' || ev.type === 'avatar') && this.isVisible())
        this.render();
    });
  }

  private isVisible(): boolean {
    return document.getElementById('screen-villagers')?.classList.contains('active') ?? false;
  }

  render(): void {
    const el = host();
    if (!el) return;
    const s = this.game.socialState;
    const joined = s.friends.filter((f) => f.status === 'joined');
    const pending = s.friends.filter((f) => f.status === 'pending');
    const reqs = this.game.activeRequests();
    // The join is a client-side simulation that grants energy; until the real
    // backend exists, expose the "They joined" shortcut (a free-energy faucet)
    // to testers only, so live players can't mint energy from fake friends.
    const canSimJoin = this.game.isTesterUnlimited;

    const me = this.game.avatar;
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
      `<div class="invite-card">` +
      `<div class="invite-copy"><b>Invite a friend</b><span>You both get +${JOIN_BONUS} energy the moment they join.</span></div>` +
      `<button class="btn-primary" id="invite-btn">Copy invite link</button>` +
      `</div>` +
      `<button class="med-cta duel-cta" id="duel-start">` +
      `<span class="med-cta-ico">⚔️</span>` +
      `<span class="med-cta-body"><b>Bonfire Duel</b><span>Play a friend hot-seat · win streak ×${this.game.duelStreak}</span></span>` +
      `<span class="med-cta-go">›</span></button>` +
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
      (s.gifts.length
        ? `<p class="earn-label">Gifts waiting</p><div class="gift-list">` +
          s.gifts
            .map((g) => {
              const glyph = chainDef(g.chain).levels[g.level] ?? '🎁';
              return (
                `<div class="gift"><span class="gift-ico">${glyph}</span>` +
                `<span class="gift-body"><b>${esc(chainDef(g.chain).name)}</b><span>from ${esc(g.from)}</span></span>` +
                `<button class="earn-btn" data-gift="${g.id}">Place</button></div>`
              );
            })
            .join('') +
          `</div>`
        : '') +
      `<p class="earn-label">Village friends</p>` +
      `<div class="friend-list">` +
      joined
        .map((f) => {
          const can = this.game.canAskFriend(f.id);
          return (
            `<div class="friend"><div class="friend-face av-${f.avatar}" aria-hidden="true"></div>` +
            `<div class="friend-body"><b>${esc(f.name)}</b><span>By your hearth</span></div>` +
            (can
              ? `<button class="earn-btn" data-ask="${f.id}">Ask for help</button>`
              : `<span class="earn-auto">Asked today</span>`) +
            `</div>`
          );
        })
        .join('') +
      pending
        .map(
          (f) =>
            `<div class="friend pending"><div class="friend-face av-${f.avatar}" aria-hidden="true"></div>` +
            `<div class="friend-body"><b>${esc(f.name)}</b><span>Invited · waiting</span></div>` +
            (canSimJoin ? `<button class="earn-btn ghost" data-joined="${f.id}">They joined</button>` : '') +
            `</div>`,
        )
        .join('') +
      `</div>` +
      `<p class="med-log-note">Friends and trading are simulated in this build; the multiplayer service arrives in M3.</p>` +
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

  private wire(el: HTMLElement): void {
    const youCard = el.querySelector<HTMLButtonElement>('#you-card');
    if (youCard) youCard.onclick = () => void openAvatarCreator(this.game);
    const invite = el.querySelector<HTMLButtonElement>('#invite-btn');
    if (invite)
      invite.onclick = () => {
        const { code, name } = this.game.inviteFriend();
        const link = `https://hearth.game/join/${code}`;
        void navigator.clipboard?.writeText(link).catch(() => undefined);
        toast(
          this.game.isTesterUnlimited
            ? `Invite link copied — ${name} is on the way. Tap "They joined" to simulate.`
            : `Invite link copied — share Emberhollow with ${name}.`,
        );
      };
    el.querySelectorAll<HTMLButtonElement>('[data-joined]').forEach((b) => {
      b.onclick = () => this.game.markFriendJoined(b.dataset.joined ?? '');
    });
    el.querySelectorAll<HTMLButtonElement>('[data-ask]').forEach((b) => {
      b.onclick = () => this.game.askFriendForHelp(b.dataset.ask ?? '');
    });
    el.querySelectorAll<HTMLButtonElement>('[data-req]').forEach((b) => {
      b.onclick = () => {
        this.game.fulfilRequest(b.dataset.req ?? '');
        this.render();
      };
    });
    el.querySelectorAll<HTMLButtonElement>('[data-gift]').forEach((b) => {
      b.onclick = () => this.game.claimGift(b.dataset.gift ?? '');
    });
    const duel = el.querySelector<HTMLButtonElement>('#duel-start');
    if (duel) duel.onclick = () => this.onDuel();
  }
}
