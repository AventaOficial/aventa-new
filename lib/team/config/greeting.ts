export function teamGreeting(hour: number): 'Buenos días' | 'Buenas tardes' | 'Buenas noches' {
  const whole = Math.floor(hour);
  if (whole >= 6 && whole < 12) return 'Buenos días';
  if (whole >= 12 && whole < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function mexicoCityHour(now: Date = new Date()): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: 'America/Mexico_City',
  }).format(now);
  const hour = Number(formatted);
  return Number.isFinite(hour) ? hour : 12;
}
