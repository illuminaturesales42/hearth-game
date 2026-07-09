/**
 * Home screen: the merge board's HUD, order card, zone strip, story modal.
 * Owns feedback (sound/haptics) and the shared toast reactions.
 */
import type { Game } from '../core/game';
import { chainDef } from '../core/board';
import { artUrl, portraitFor, itemIconInline } from './art';
import { ORDERS, ZONE_STAGES } from '../data/economy';
import { feedback } from './feedback';
import { toast } from './toast';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

export class Home {
  constructor(private game: Game) {
    game.subscribe((ev) => {
      switch (ev.type) {
        case 'state':
          this.render();
          break;
        case 'merge':
          feedback.merge(ev.item.level);
          break;
        case 'spawn':
          feedback.spawn();
          break;
        case 'reject':
          if (ev.reason === 'full') toast('The board is full — merge or tidy to make room.');
          else if (ev.reason === 'energy') toast('Not enough energy — a real-world action refills it.');
          break;
        case 'sold':
          toast(`Sold for +${ev.coins} coins.`);
          break;
        case 'delivered': {
          feedback.deliver();
          const order = ORDERS.find((o) => o.id === ev.orderId);
          this.showStory(ev.resolution, `+${ev.rewardEnergy} energy · +${ev.rewardCoins} coins`, order?.who);
          break;
        }
        case 'chapterComplete':
          feedback.chapter();
          this.showStory(
            `Chapter ${ev.chapter} — ${ev.title} — is complete. ${ev.cliffhanger}`,
            ev.hasNext ? 'The next chapter begins at the notice board.' : 'End of this build. The mystery continues soon.',
          );
          break;
        case 'action':
          if (ev.energy > 0) toast(`+${ev.energy} energy. The hearth brightens.`);
          break;
        case 'chest':
          this.showReward('A chest for tending the hearth', `+${ev.coins} coins`);
          break;
        case 'friendJoined':
          feedback.chapter();
          toast(ev.energy > 0 ? `${ev.name} joined your village! +${ev.energy} energy for you both.` : `${ev.name} is back in the village.`);
          break;
        case 'help':
          toast(`${ev.from} sent ${ev.count} to your gifts. Place them on the board to help your task.`);
          break;
        case 'daily':
          toast(`Day ${ev.streak} at the hearth — +${ev.energy} energy for showing up.`);
          break;
        case 'gratitude':
          if (ev.energy > 0) toast(`+${ev.energy} energy (×${ev.multiplier.toFixed(1)} streak). A good day, written down.`);
          break;
        case 'flashback':
          feedback.chime(660);
          toast(`+${ev.energy} energy. Remember: “${ev.text.slice(0, 60)}${ev.text.length > 60 ? '…' : ''}”`);
          break;
        case 'stargaze':
          if (ev.energy > 0) {
            feedback.chime(587);
            toast(`${ev.moon} · +${ev.energy} energy. The night keeps watch.`);
          }
          break;
        case 'kindness':
          if (ev.energy > 0) {
            feedback.chime(587);
            toast(ev.selfie ? `+${ev.energy} energy — a compliment and a new friend. 💛` : `+${ev.energy} energy. A kindness ripples out.`);
          }
          break;
        case 'bond':
          if (ev.grew) {
            feedback.chime(660);
            toast(`${ev.name}’s trust grows — ${'♥'.repeat(ev.hearts)}${'♡'.repeat(Math.max(0, 5 - ev.hearts))}`);
          }
          break;
        case 'upgrade':
          feedback.chime(660);
          break;
        case 'achievement':
          feedback.chime(660);
          toast(`${ev.icon} Achievement: ${ev.title}`);
          break;
        case 'questDone':
          feedback.chime(587);
          toast(`Daily quest done — ${ev.label}. +${ev.coins} coins.`);
          break;
        case 'duelEnd':
          if (ev.won) {
            feedback.chapter();
            toast(`Duel won! ${ev.itemCount} items to your Repository · streak ×${ev.streak} · +${ev.coins} coins.`);
          }
          break;
        case 'health': {
          const parts = [
            ev.fromSteps > 0 ? `+${ev.fromSteps} from steps` : '',
            ev.fromStairs > 0 ? `+${ev.fromStairs} from stairs` : '',
            ev.fromSleep > 0 ? `+${ev.fromSleep} from ${ev.sleepFullNight ? 'a full night’s sleep' : 'sleep'}` : '',
          ].filter(Boolean);
          if (parts.length) toast(`The hearth brightens: ${parts.join(', ')}.`);
          break;
        }
        case 'reject':
          feedback.reject();
          if (ev.reason === 'energy') toast('The hearth burns low. Tap it to earn more from your day.');
          if (ev.reason === 'full') toast('The board is full. Merge something first.');
          break;
      }
    });

    $('deliver-btn').addEventListener('click', () => game.deliver());
    $('story-continue').addEventListener('click', () => {
      $('story-modal').hidden = true;
    });
    document.getElementById('reward-continue')?.addEventListener('click', () => {
      const m = document.getElementById('reward-modal');
      if (m) m.hidden = true;
    });
    this.render();
  }

  render(): void {
    const s = this.game.snapshot;
    $('hud-coins').textContent = String(s.coins);
    $('hud-energy').textContent = String(s.energy.current);
    // Energy pill wears its level: the ember-heart brightens with energy.
    const pill = document.querySelector<HTMLElement>('.energy-pill');
    if (pill) {
      pill.classList.toggle('pill-low', s.energy.current < 8);
      pill.classList.toggle('pill-full', s.energy.current >= 60);
    }
    const pip = document.querySelector<HTMLElement>('.energy-pill .pip');
    if (pip && !pip.classList.contains('pip-art')) {
      // the painted flaming heart — always vibrant; the pill's pill-low/-full
      // classes brighten or gutter its glow with the energy level.
      const url = artUrl('energy_heart') ?? artUrl('energy_full');
      if (url) {
        pip.style.backgroundImage = `url(${url})`;
        pip.classList.add('pip-art');
      }
    }

    const order = ORDERS[s.orderIndex];
    const text = $('order-text');
    const deliver = $<HTMLButtonElement>('deliver-btn');
    const face = document.querySelector<HTMLElement>('.order-face');
    if (face) {
      const bust = order ? portraitFor(order.who) : null;
      face.style.backgroundImage = bust ? `url(${bust})` : '';
      face.classList.toggle('has-art', !!bust);
    }
    if (order) {
      const def = chainDef(order.need.chain);
      const item = itemIconInline(order.need.chain, order.need.level);
      const name = def.levelNames[order.need.level] ?? '';
      text.innerHTML = `<span class="who">${order.who}</span>${order.text} <b>Bring: ${item} ${name}</b>`;
      deliver.disabled = this.game.deliverableIndex() < 0;
    } else {
      text.innerHTML = '<span class="who">Chapter complete</span>Marta’s story continues in Chapter 2.';
      deliver.disabled = true;
    }

    // Order queue: show what's coming so players can plan their chains.
    const next = ORDERS[s.orderIndex + 1];
    const nextEl = document.getElementById('order-next');
    if (nextEl) {
      if (next) {
        const ndef = chainDef(next.need.chain);
        nextEl.innerHTML = `Up next: ${next.who} — ${itemIconInline(next.need.chain, next.need.level)} ${ndef.levelNames[next.need.level] ?? ''}`;
        nextEl.hidden = false;
      } else {
        nextEl.hidden = true;
      }
    }

    // Zone strip is optional (the Home map now shows restoration progress).
    const zoneLabel = document.getElementById('zone-label');
    const dots = document.getElementById('zone-dots');
    if (zoneLabel && dots) {
      const delivered = s.orderIndex;
      const stage = [...ZONE_STAGES].reverse().find((z) => delivered >= z.at) ?? ZONE_STAGES[0]!;
      zoneLabel.textContent = `${stage.label} · ${delivered}/${ORDERS.length} orders`;
      if (dots.childElementCount === 0) {
        for (let i = 0; i < ZONE_STAGES.length; i++) {
          const d = document.createElement('span');
          d.className = 'zone-dot';
          dots.appendChild(d);
        }
      }
      Array.from(dots.children).forEach((d, i) => {
        (d as HTMLElement).classList.toggle('lit', delivered >= (ZONE_STAGES[i]?.at ?? Infinity));
      });
    }
  }

  /** Story beats arrive as dialogue: the villager's bust and name, then their words. */
  private showStory(body: string, reward: string, who?: string): void {
    const bustEl = document.getElementById('story-bust');
    const nameEl = document.getElementById('story-name');
    const bust = who ? portraitFor(who) : null;
    if (bustEl) {
      bustEl.style.backgroundImage = bust ? `url(${bust})` : '';
      bustEl.hidden = !bust;
    }
    if (nameEl) {
      nameEl.textContent = who ?? '';
      nameEl.hidden = !who;
    }
    const flame = document.querySelector<HTMLElement>('#story-modal .modal-flame');
    if (flame) flame.hidden = !!bust;
    $('story-text').textContent = body;
    $('story-reward').textContent = reward;
    $('story-modal').hidden = false;
  }

  /** Chest/reward moments get their moment: painted chest, warm count. */
  private showReward(title: string, amount: string): void {
    const img = document.getElementById('reward-art') as HTMLImageElement | null;
    const url = artUrl('res_chest_open') ?? artUrl('reward_chest');
    if (img && url) img.src = url;
    const t = document.getElementById('reward-title');
    if (t) t.textContent = title;
    const a = document.getElementById('reward-amount');
    if (a) a.textContent = amount;
    const m = document.getElementById('reward-modal');
    if (m) m.hidden = false;
    feedback.chime(660);
  }
}
