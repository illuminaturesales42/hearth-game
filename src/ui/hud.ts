/**
 * HUD, energy bar, order panel, life quests, story modal, toasts.
 */
import type { Game } from '../core/game';
import { chainDef } from '../core/board';
import { msToNextTick } from '../core/energy';
import { ENERGY, ORDERS, ZONE_STAGES } from '../data/economy';
import { feedback } from './feedback';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

export class Hud {
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private game: Game) {
    game.subscribe((ev) => {
      if (ev.type === 'state') this.render();
      if (ev.type === 'merge') feedback.merge(ev.item.level);
      if (ev.type === 'spawn') feedback.spawn();
      if (ev.type === 'delivered') {
        feedback.deliver();
        this.showStory(ev.resolution, ev.rewardEnergy, ev.rewardCoins);
      }
      if (ev.type === 'chapterComplete') {
        feedback.chapter();
        this.showChapterEnd();
      }
      if (ev.type === 'quest') this.onQuest(ev.questId, ev.granted);
      if (ev.type === 'health') {
        const parts = [
          ev.fromSteps > 0 ? `+${ev.fromSteps} from steps` : '',
          ev.fromSleep > 0 ? `+${ev.fromSleep} from a good night's sleep` : '',
        ].filter(Boolean);
        this.toast(`The hearth brightens: ${parts.join(', ')}.`);
      }
      if (ev.type === 'reject') {
        feedback.reject();
        if (ev.reason === 'energy') this.toast('The hearth burns low. A life quest below relights it.');
        if (ev.reason === 'full') this.toast('The board is full. Merge something first.');
      }
    });

    $('deliver-btn').addEventListener('click', () => game.deliver());
    $('story-continue').addEventListener('click', () => {
      $('story-modal').hidden = true;
    });
    document.querySelectorAll<HTMLButtonElement>('.quest').forEach((btn) => {
      btn.addEventListener('click', () => game.doLifeQuest(btn.dataset.quest ?? ''));
    });

    setInterval(() => {
      this.game.tick();
      this.renderTimer();
    }, 1000);
    this.render();
  }

  render(): void {
    const s = this.game.snapshot;
    $('hud-coins').textContent = String(s.coins);
    $('energy-count').textContent = String(s.energy.current);

    const order = ORDERS[s.orderIndex];
    const orderText = $('order-text');
    const deliverBtn = $<HTMLButtonElement>('deliver-btn');
    if (order) {
      const def = chainDef(order.need.chain);
      const glyph = def.levels[order.need.level] ?? '';
      const name = def.levelNames[order.need.level] ?? '';
      orderText.innerHTML = `<span class="who">${order.who}</span>${order.text} <b>Bring: ${glyph} ${name}</b>`;
      const ready = this.game.deliverableIndex() >= 0;
      deliverBtn.disabled = !ready;
    } else {
      orderText.innerHTML = '<span class="who">Chapter complete</span>Marta’s story continues in Chapter 2.';
      deliverBtn.disabled = true;
    }

    document.querySelectorAll<HTMLButtonElement>('.quest').forEach((btn) => {
      const done = s.energy.questsDoneToday.includes(btn.dataset.quest ?? '');
      btn.classList.toggle('done', done);
      if (done) btn.querySelector('.q-sub')!.textContent = 'Done today ✓';
    });

    this.renderZone();
    this.renderTimer();
  }

  private renderZone(): void {
    const delivered = this.game.snapshot.orderIndex;
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

  private renderTimer(): void {
    const s = this.game.snapshot;
    const el = $('energy-timer');
    if (s.energy.current >= ENERGY.regenCap) {
      el.textContent = '';
      return;
    }
    const ms = msToNextTick(s.energy, Date.now());
    const m = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    el.textContent = `+1 in ${m}:${String(sec).padStart(2, '0')}`;
  }

  private showStory(resolution: string, energy: number, coins: number): void {
    $('story-text').textContent = resolution;
    $('story-reward').textContent = `+${energy} energy · +${coins} coins`;
    $('story-modal').hidden = false;
  }

  private showChapterEnd(): void {
    // Delivered-order modal shows first; chapter modal replaces its copy.
    $('story-text').textContent =
      'Chapter 1 complete. In the full game, Marta’s mystery runs for 40 chapters, and every one of them is powered by your real day.';
    $('story-reward').textContent = 'Thank you for playing the M1 build.';
    $('story-modal').hidden = false;
  }

  private onQuest(questId: string, granted: number): void {
    if (granted <= 0) {
      this.toast('Already counted today. Tomorrow is a new day.');
      return;
    }
    this.toast(`+${granted} energy. In the shipping build this syncs automatically from HealthKit or Health Connect.`);
  }

  toast(msg: string): void {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
}
