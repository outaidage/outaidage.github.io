// boot-sound.ts — 全息启动动画的音效（WebAudio 合成，原创，无外部音频资源）。
// 默认关闭，只有用户主动开启音效后才播放。播放失败时静默（动画不受影响）。

let ctx: AudioContext | null = null;

export function playBootSound(): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.05;
    // 主音量包络：缓起，4.5 秒内淡出。
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(0.07, t0 + 0.9);
    master.gain.linearRampToValueAtTime(0.0001, t0 + 4.6);
    master.connect(ctx.destination);
    // 柔和上升的和声垫（三个三角波，频率缓慢上滑）。
    for (const freq of [220, 277.18, 329.63]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.linearRampToValueAtTime(freq * 1.5, t0 + 3.6);
      osc.connect(master);
      osc.start(t0);
      osc.stop(t0 + 4.7);
    }
    // 品牌出现时刻（约 2.8s）的一声清脆泛音。
    const chime = ctx.createOscillator();
    chime.type = "sine";
    chime.frequency.value = 880;
    const chimeGain = ctx.createGain();
    chimeGain.gain.setValueAtTime(0, t0 + 2.8);
    chimeGain.gain.linearRampToValueAtTime(0.1, t0 + 2.95);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.3);
    chime.connect(chimeGain);
    chimeGain.connect(ctx.destination);
    chime.start(t0 + 2.8);
    chime.stop(t0 + 4.4);
  } catch {
    // 音频不可用时静默，动画继续。
  }
}
