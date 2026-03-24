/**
 * Sonido breve tipo “gota” / aire (Web Audio). Solo en cliente; puede fallar si el navegador bloquea audio hasta gesto del usuario.
 */
export function playNotificationDropSound(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.7;
    osc.type = 'sine';
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(900, t0);
    osc.frequency.exponentialRampToValueAtTime(380, t0 + 0.11);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    osc.start(t0);
    osc.stop(t0 + 0.32);
    void ctx.resume();
  } catch {
    // Política de autoplay u otro
  }
}
