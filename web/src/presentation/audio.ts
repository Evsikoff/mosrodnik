// Звук презентации «О проекте»: фоновая музыка по кругу и озвучка слайдов.
// Музыка идёт через Web Audio: громкость элемента <audio> на iOS не меняется, а GainNode работает везде.

const MUSIC_LEVEL = 0.3;
const MUSIC_IN = 2.5; // плавное начало, с
const LOOP_LEAD = 9; // за столько секунд до конца трека вступает следующий круг: хвост трека уже тихий
const LOOP_IN = 4;
const LOOP_OUT = 7;
const MUSIC_OUT = 0.8; // затухание при закрытии

interface Track { el: HTMLAudioElement; gain: GainNode }

export class DeckAudio {
  readonly voice = new Audio();
  /** Номер слайда, чья озвучка загружена в voice. */
  voiceIndex = -1;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private tracks: Track[] = [];
  private active = 0;
  private looping = false;
  private timer = 0;
  private stopped = false;

  /** Вызывать прямо в обработчике нажатия: браузеры разрешают звук только в ответ на действие пользователя. */
  static start(musicUrl: string, firstVoiceUrl: string) {
    const a = new DeckAudio();
    a.startMusic(musicUrl);
    a.playVoice(0, firstVoiceUrl).catch(() => {});
    return a;
  }

  private startMusic(url: string) {
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      for (let i = 0; i < 2; i++) {
        const el = new Audio(url);
        el.preload = 'auto';
        const gain = ctx.createGain();
        gain.gain.value = i === 0 ? 1 : 0;
        ctx.createMediaElementSource(el).connect(gain).connect(master);
        this.tracks.push({ el, gain });
      }
      void ctx.resume();
      this.tracks[0].el.play().catch(() => {});
      // Второй элемент разблокируем тем же нажатием; его не слышно, пока не придёт очередь.
      const spare = this.tracks[1].el;
      spare.play().then(() => spare.pause()).catch(() => {});
      master.gain.linearRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + MUSIC_IN);
      this.ctx = ctx;
      this.master = master;
      this.timer = window.setInterval(this.watch, 250);
    } catch {
      // Без Web Audio презентация идёт без музыки.
    }
  }

  private watch = () => {
    const cur = this.tracks[this.active];
    const d = cur.el.duration;
    if (!this.looping && Number.isFinite(d) && cur.el.currentTime >= d - LOOP_LEAD) this.nextLoop();
  };

  private nextLoop() {
    const now = this.ctx!.currentTime;
    const old = this.tracks[this.active];
    this.active = 1 - this.active;
    const next = this.tracks[this.active];
    this.looping = true;
    next.el.currentTime = 0;
    next.gain.gain.cancelScheduledValues(now);
    next.gain.gain.setValueAtTime(0, now);
    next.gain.gain.linearRampToValueAtTime(1, now + LOOP_IN);
    next.el.play().catch(() => {});
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, now + LOOP_OUT);
    window.setTimeout(() => {
      old.el.pause();
      this.looping = false;
    }, LOOP_OUT * 1000);
  }

  playVoice(index: number, url: string) {
    this.voiceIndex = index;
    this.voice.src = url;
    return this.voice.play();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    window.clearInterval(this.timer);
    this.voice.pause();
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + MUSIC_OUT);
    window.setTimeout(() => {
      this.tracks.forEach((t) => t.el.pause());
      void ctx.close();
    }, MUSIC_OUT * 1000 + 50);
  }
}
