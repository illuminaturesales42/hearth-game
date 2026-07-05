/**
 * Home screen: the merge board's HUD, order card, zone strip, story modal.
 * Owns feedback (sound/haptics) and the shared toast reactions.
 */
import type { Game } from '../core/game';
import { chainDef } from '../core/board';
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
        case 'delivered':
          feedback.deliver();
          this.showStory(ev.resolution, `+${ev.rewardEnergy} energy · +${ev.rewardCoins} coins`);
          break;
        case 'chapterComplete':
          feedback.chapter();
          this.showStory(
            'Chapter 1 complete. Marta’s mystery runs on for 40 chapters — and every one is powered by your real day.',
            'Thank you for playing this build.',
          );
          break;
        case 'action':
          if (ev.energy > 0) toast(`+${ev.energy} energy. The hearth brightens.`);
          break;
        case 'chest':
          toast(`A chest opens: +${ev.coins} coins for tending the hearth.`);
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
        case 'match':
          feedback.spawn();
          toast(`Joined ${ev.name} — +${ev.energy} energy. The harbour hums.`);
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
    this.render();
  }

  render(): void {
    const s = this.game.snapshot;
    $('hud-coins').textContent = String(s.coins);
    $('hud-energy').textContent = String(s.energy.current);

    const order = ORDERS[s.orderIndex];
    const text = $('order-text');
    const deliver = $<HTMLButtonElement>('deliver-btn');
    if (order) {
      const def = chainDef(order.need.chain);
      const glyph = def.levels[order.need.level] ?? '';
      const name = def.levelNames[order.need.level] ?? '';
      text.innerHTML = `<span class="who">${order.who}</span>${order.text} <b>Bring: ${glyph} ${name}</b>`;
      deliver.disabled = this.game.deliverableIndex() < 0;
    } else {
      text.innerHTML = '<span class="who">Chapter complete</span>Marta’s story continues in Chapter 2.';
      deliver.disabled = true;
    }

    const delivered = s.orderIndex;
    const stage = [...ZONE_STAGES].reverse().find((z) => delivered >= z.at) ?? ZONE_STAGES[0]!;
    $('zone-label').textContent = `${stage.label} · ${delivered}/${ORDERS.length} orders`;
    const dots = $('zone-dots');
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

  private showStory(body: string, reward: string): void {
    $('story-text').textContent = body;
    $('story-reward').textContent = reward;
    $('story-modal').hidden = false;
  }
}
