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
import { JOIN_BONUS } from '../core/social';
import { VILLAGERS } from '../data/world';
import { toast } from './toast';

const host = () => document.getElementById('villagers-body');
const hearts = (n: number) => '♥'.repeat(n) + '♡'.repeat(Math.max(0, 5 - n));

export class SocialScreen {
  constructor(
    private game: Game,
    private onDuel: () => void = () => undefined,
  ) {
    game.subscribe((ev) => {
      if ((ev.type === 'social' || ev.type === 'duelEnd') && this.isVisible()) this.render();
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

    el.innerHTML =
      `<h2 class="screen-title">Your Village</h2>` +
      `<p class="screen-sub">Invite friends to Emberhollow. When they join, your hearth flares. Ask a friend for a hand when a task runs tough.</p>` +

      `<div class="invite-card">` +
      `<div class="invite-copy"><b>Invite a friend</b><span>You both get +${JOIN_BONUS} energy the moment they join.</span></div>` +
      `<button class="btn-primary" id="invite-btn">Copy invite link</button>` +
      `</div>` +

      `<button class="med-cta duel-cta" id="duel-start">` +
      `<span class="med-cta-ico">⚔️</span>` +
      `<span class="med-cta-body"><b>Bonfire Duel</b><span>Play a friend hot-seat · win streak ×${this.game.duelStreak}</span></span>` +
      `<span class="med-cta-go">›</span></button>` +

      (s.gifts.length
        ? `<p class="earn-label">Gifts waiting</p><div class="gift-list">` +
          s.gifts
            .map((g) => {
              const glyph = chainDef(g.chain).levels[g.level] ?? '🎁';
              return (
                `<div class="gift"><span class="gift-ico">${glyph}</span>` +
                `<span class="gift-body"><b>${chainDef(g.chain).name}</b><span>from ${g.from}</span></span>` +
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
            `<div class="friend-body"><b>${f.name}</b><span class="friend-hearts">${hearts(4)}</span></div>` +
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
            `<div class="friend-body"><b>${f.name}</b><span>Invited · waiting</span></div>` +
            `<button class="earn-btn ghost" data-joined="${f.id}">They joined</button></div>`,
        )
        .join('') +
      `</div>` +
      `<p class="med-log-note">Friends and trading are simulated in this build; the multiplayer service arrives in M3.</p>` +

      `<p class="earn-label">Village folk</p>` +
      `<div class="friend-list">` +
      VILLAGERS.map(
        (v) =>
          `<div class="friend"><div class="friend-face npc" aria-hidden="true"></div>` +
          `<div class="friend-body"><b>${v.name}</b><span>${v.role}</span></div>` +
          `<span class="friend-hearts">${hearts(v.affinity)}</span></div>`,
      ).join('') +
      `</div>`;

    this.wire(el);
  }

  private wire(el: HTMLElement): void {
    const invite = el.querySelector<HTMLButtonElement>('#invite-btn');
    if (invite)
      invite.onclick = () => {
        const { code, name } = this.game.inviteFriend();
        const link = `https://hearth.game/join/${code}`;
        void navigator.clipboard?.writeText(link).catch(() => undefined);
        toast(`Invite link copied — ${name} is on the way. Tap "They joined" to simulate.`);
      };
    el.querySelectorAll<HTMLButtonElement>('[data-joined]').forEach((b) => {
      b.onclick = () => this.game.markFriendJoined(b.dataset.joined ?? '');
    });
    el.querySelectorAll<HTMLButtonElement>('[data-ask]').forEach((b) => {
      b.onclick = () => this.game.askFriendForHelp(b.dataset.ask ?? '');
    });
    el.querySelectorAll<HTMLButtonElement>('[data-gift]').forEach((b) => {
      b.onclick = () => this.game.claimGift(b.dataset.gift ?? '');
    });
    const duel = el.querySelector<HTMLButtonElement>('#duel-start');
    if (duel) duel.onclick = () => this.onDuel();
  }
}
