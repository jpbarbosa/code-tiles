// The clock the OS shows, which a page cannot work out from its own locale: that is the app's
// language, and English formats 12-hour whatever the region. ICU has no English for Brazil, so
// `en-BR` falls back to en-US and loses the 24-hour clock its region implies, while Intl.Locale
// keeps the region, which is where the clock comes from. An explicit 12/24-hour choice outranks it.
export function hourCycleFor({ force24 = false, force12 = false, systemLocale }) {
  if (force24) return 'h23';
  if (force12) return 'h12';
  try {
    const locale = new Intl.Locale(systemLocale);
    return (locale.getHourCycles?.() ?? locale.hourCycles)?.[0] || 'h12';
  } catch {
    return 'h12';
  }
}
