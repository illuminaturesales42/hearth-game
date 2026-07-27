/**
 * Home screen: the merge board's HUD, order card, zone strip, story modal.
 * Owns feedback (sound/haptics) and the shared toast reactions.
 */
import type { Game } from '../core/game';
import { chainDef } from '../core/board';
import { artUrl, portraitFor, itemIconInline } from './art';
import { avatarPortraitHTML } from './avatar-render';
import { openAvatarCreator } from './avatar-creator';
import { effectiveWeather, getSkyPref, isLiveSky, latestAccumulation, latestSunTimes, latestWeather, presetAccumulation } from './weather';
import type { WeatherKind } from '../core/world-mood';
import { computeEnvironment } from '../core/environment';
import { MOOD_CAPTION } from '../core/weather-mood';
import { PHASE_META, phaseForTime, type PhaseWeights, type TimeOfDay } from '../core/time-of-day';
import { ORDERS, RESTORE_ORDERS, ZONE_STAGES } from '../data/economy';
import { orderAt } from '../data/endless';
import { feedback } from './feedback';
import { toast } from './toast';

/** Plain-language sky, for the under-map HUD. */
/** Emoji fallback for the medallion when no time_badge_* art is sliced. */
const PHASE_FALLBACK: Record<TimeOfDay, string> = {
  sunrise: '🌅',
  midday: '☀️',
  sunset: '🌇',
  evening: '🌆',
  night: '🌙',
};

/** A small glyph beside the sky word — faster to read than text alone. */
const SKY_GLYPH: Record<WeatherKind, string> = {
  clear: '☀️',
  clouds: '⛅',
  overcast: '☁️',
  fog: '🌫️',
  rain: '🌧️',
  storm: '⛈️',
  snow: '❄️',
};

const SKY_WORD: Record<WeatherKind, string> = {
  clear: 'clear',
  clouds: 'cloudy',
  overcast: 'overcast',
  fog: 'foggy',
  rain: 'rain',
  storm: 'storm',
  snow: 'snow',
};

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
        case 'avatar':
          this.renderAvatar();
          break;
        case 'merge':
          feedback.merge(ev.item.level);
          break;
        case 'spawn':
          feedback.spawn();
          break;
        case 'reject':
          feedback.reject();
          if (ev.reason === 'full') toast('The board is full — merge or tidy to make room.');
          else if (ev.reason === 'energy') toast('Not enough energy — a real-world action refills it.');
          break;
        case 'sold':
          toast(`Sold for +${ev.coins} coins.`);
          break;
        case 'requestDone':
          feedback.chime(587);
          toast(`${ev.who} thanks you — +${ev.coins} coins.`);
          break;
        case 'zoneRestored':
          feedback.chapter();
          toast(`✨ ${ev.label} — Emberhollow brightens.`);
          break;
        case 'collectionDone':
          feedback.chime(660);
          toast(`🏆 ${ev.name} mastered — +${ev.coins} coins.`);
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
            ev.hasNext
              ? 'The next chapter begins at the notice board.'
              : 'End of this build. The mystery continues soon.',
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
          toast(
            ev.energy > 0
              ? `${ev.name} joined your village! +${ev.energy} energy for you both.`
              : `${ev.name} is back in the village.`,
          );
          break;
        case 'help':
          toast(`${ev.from} sent ${ev.count} to your gifts. Place them on the board to help your task.`);
          break;
        case 'daily':
          toast(`Day ${ev.streak} at the hearth — +${ev.energy} energy for showing up.`);
          break;
        case 'streakSaved':
          feedback.chime(523);
          toast(
            `A hearthstone kept your streak safe through a missed day.${ev.freezesLeft > 0 ? ` ${ev.freezesLeft} left.` : ''}`,
          );
          break;
        case 'gratitude':
          if (ev.energy > 0)
            toast(`+${ev.energy} energy (×${ev.multiplier.toFixed(1)} streak). A good day, written down.`);
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
            toast(
              ev.selfie
                ? `+${ev.energy} energy — a compliment and a new friend. 💛`
                : `+${ev.energy} energy. A kindness ripples out.`,
            );
          }
          break;
        case 'bond':
          if (ev.grew) {
            feedback.chime(660);
            toast(`${ev.name}’s trust grows — ${'♥'.repeat(ev.hearts)}${'♡'.repeat(Math.max(0, 5 - ev.hearts))}`);
          }
          break;
        case 'upgrade':
          // The one purchase a player deliberately saves for deserves the full
          // flourish — arpeggio + haptic (the toast fires from the map's button).
          feedback.chapter();
          break;
        case 'achievement':
          feedback.chime(660);
          toast(`${ev.icon} Achievement: ${ev.title} · +${ev.coins} coins`);
          break;
        case 'milestone':
          feedback.chapter();
          this.showReward(`${ev.days}-day streak — ${ev.title}`, `${ev.note} +${ev.coins} coins`);
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
        case 'minigameUnlocked':
          feedback.chapter();
          toast(`✦ ${ev.title} has opened its doors. Tap the building to play.`);
          break;
        case 'minigameEnd':
          feedback.deliver(); // a warm 3-note landing — chapter() stays reserved for unlocks
          toast(
            `${ev.title}: 🪙 +${ev.coins}${ev.ember > 0 ? ` · 🔥 +${ev.ember}` : ''}${ev.itemCount > 0 ? ` · ${ev.itemCount} to your Repository` : ''}.`,
          );
          break;
        case 'repoGiven':
          feedback.chime(560);
          toast(`${ev.who} is delighted — +${ev.coins} coins for what you gathered.`);
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
    // The clock/weather block owns its own slow tick: nothing else emits an
    // event when a minute passes. 30s keeps the displayed minute honest and is
    // far too slow to matter for battery.
    window.setInterval(() => this.renderHud(), 30_000);
    // …and the medallion answers a sky/location change (or the hearthEnv()/
    // hearthSky() scrubber) instantly, on the same triggers the environment
    // controller uses — the badge and the whole scene always agree.
    document.addEventListener('hearth:sky-updated', () => this.renderHud());
    document.addEventListener('hearth:location-changed', () => this.renderHud());
  }

  /** The player's face, watching over their town — a quiet identity cameo on the
   *  home map. Tap to change. Painted portrait, so it fits beside the buildings. */
  private renderAvatar(): void {
    const host = document.getElementById('hud-portrait');
    if (!host) return;
    host.innerHTML = avatarPortraitHTML(this.game.avatar.portrait, { framed: true, label: 'your look' });
    host.onclick = () => void openAvatarCreator(this.game);
  }

  /**
   * The under-map HUD: your face, your local clock, your real weather. It is
   * the smallest, most constant reminder that Emberhollow runs on the player's
   * actual day — the same live reading that tints the town also prints here.
   *
   * Everything degrades: no weather reading yet → the weather block simply
   * hides rather than showing placeholder nonsense.
   */
  private renderHud(): void {
    const now = Date.now();
    const clock = document.getElementById('hud-clock');
    if (clock) clock.textContent = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    // The medallion's TIME-OF-DAY face uses the exact same model the map's own
    // sky reads (core/time-of-day: "the single source of truth… so the little
    // badge and the whole scene always agree") — five real phases from the
    // player's true sun times, not an ad-hoc day/night guess.
    const sun = latestSunTimes();
    const { phase } = phaseForTime(now, sun);
    const meta = PHASE_META[phase];
    const restored = document.getElementById('hud-restored');
    if (restored) {
      const pct = Math.min(100, Math.round((this.game.snapshot.orderIndex / RESTORE_ORDERS) * 100));
      restored.textContent = `${pct}% restored`;
    }

    const w = effectiveWeather(latestWeather());
    const pref = getSkyPref();
    const env = computeEnvironment(now, sun, w, {
      accumulation: isLiveSky(pref) ? latestAccumulation(now) : presetAccumulation(pref),
    });

    const ico = document.getElementById('hud-weather-ico');
    if (ico) this.renderMedallion(ico, now, sun, phase, env.moonAmount, env.mood, meta.label);

    const block = document.querySelector<HTMLElement>('.hud-weather');
    if (block) block.hidden = !w;
    if (!w) return;
    const temp = document.getElementById('hud-temp');
    if (temp) temp.textContent = typeof w.tempC === 'number' ? `${Math.round(w.tempC)}°` : '';
    const sky = document.getElementById('hud-sky');
    // A small weather glyph reads faster than the word alone, and still shows
    // the real sky even for a player who never opens the reactive-world panel.
    if (sky) sky.textContent = `${SKY_GLYPH[w.kind] ?? ''} ${SKY_WORD[w.kind] ?? ''}`.trim();
  }

  /** Badge art per crossfade channel (evening reuses sunset until bespoke). */
  private static readonly BADGE_BY_CHANNEL: Record<keyof PhaseWeights, string> = {
    dawn: 'time_badge_sunrise',
    day: 'time_badge_midday',
    dusk: 'time_badge_sunset',
    evening: 'time_badge_sunset',
    night: 'time_badge_night',
  };

  private wxLayers: { a: HTMLElement; b: HTMLElement; dot: HTMLElement; fx: HTMLElement } | null = null;

  /**
   * The time medallion as a LIVE VIEWPORT (Living Weather spec §9): the four
   * painted badges cross-fade by the same phase weights the map's sky reads,
   * the real sun/moon travels its little arc, and a micro weather overlay
   * (rain streaks / snow / fog veil) answers the mood. The whole system in
   * miniature — the first thing that says "Hearth knows".
   */
  private renderMedallion(
    ico: HTMLElement,
    now: number,
    sun: { sunriseMs: number; sunsetMs: number } | null,
    phase: TimeOfDay,
    moonAmount: number,
    mood: string,
    label: string,
  ): void {
    const caption = (MOOD_CAPTION as Record<string, string>)[mood] ?? label;
    ico.title = caption;
    ico.setAttribute('role', 'img');
    ico.setAttribute('aria-label', caption);

    const { weights } = phaseForTime(now, sun);
    // the two heaviest channels carry the crossfade
    const entries = (Object.keys(weights) as (keyof PhaseWeights)[])
      .map((k) => ({ k, w: weights[k] }))
      .sort((x, y) => y.w - x.w);
    const top = entries[0]!;
    const second = entries[1]!;
    const urlA = artUrl(Home.BADGE_BY_CHANNEL[top.k]);
    if (!urlA) {
      // art-less fallback: the plain emoji face, exactly as before
      ico.classList.remove('has-art');
      ico.textContent = PHASE_FALLBACK[phase];
      return;
    }
    ico.classList.add('has-art');
    if (!this.wxLayers) {
      ico.textContent = '';
      const mk = (cls: string): HTMLElement => {
        const d = document.createElement('div');
        d.className = cls;
        ico.appendChild(d);
        return d;
      };
      this.wxLayers = { a: mk('wx-layer'), b: mk('wx-layer'), dot: mk('wx-dot'), fx: mk('wx-fx') };
    }
    const L = this.wxLayers;
    const total = top.w + second.w || 1;
    L.a.style.backgroundImage = `url(${urlA})`;
    L.a.style.opacity = '1';
    const urlB = artUrl(Home.BADGE_BY_CHANNEL[second.k]);
    const crossfade = urlB && urlB !== urlA ? second.w / total : 0;
    L.b.style.backgroundImage = urlB ? `url(${urlB})` : '';
    L.b.style.opacity = crossfade.toFixed(3);

    // the real sun (or moon) on its little arc across the badge face
    let dotShown = false;
    if (sun && sun.sunsetMs > sun.sunriseMs) {
      const DAY = 86_400_000;
      const u = (now - sun.sunriseMs) / (sun.sunsetMs - sun.sunriseMs);
      const daytime = u >= 0 && u <= 1;
      const since = now > sun.sunsetMs ? now - sun.sunsetMs : now + DAY - sun.sunsetMs;
      const v = Math.min(1, since / (DAY - (sun.sunsetMs - sun.sunriseMs)));
      const p = daytime ? u : v;
      const x = 18 + p * 64; // % across the inner face
      const y = 62 - Math.sin(p * Math.PI) * 34; // % down (arc peak at centre-top)
      L.dot.style.left = `${x.toFixed(1)}%`;
      L.dot.style.top = `${y.toFixed(1)}%`;
      L.dot.classList.toggle('wx-moon', !daytime);
      L.dot.style.opacity = daytime ? '1' : (0.3 + 0.7 * moonAmount).toFixed(2);
      dotShown = true;
    }
    L.dot.style.display = dotShown ? '' : 'none';

    // micro weather overlay by mood
    const fx =
      mood === 'storm-watch' || mood === 'cosy-rain' ? 'rain' : mood === 'snow-glow' ? 'snow' : mood === 'misty' ? 'fog' : '';
    L.fx.className = `wx-fx${fx ? ` wx-fx-${fx}` : ''}`;
  }

  render(): void {
    this.renderAvatar();
    this.renderHud();
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

    const order = this.game.currentOrder();
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
    const next = orderAt(s.orderIndex + 1);
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
