/**
 * HTML-escape a string before interpolating it into an innerHTML template.
 *
 * Any string that originates from the save file (chronicle text, friend/gift
 * names, villager memories) is attacker-controllable: saves are exported,
 * shared, and re-imported, so a hostile save could smuggle `<img onerror=…>`
 * into a render sink and exfiltrate the device key (which is the cloud
 * account). Every save-derived string MUST pass through `esc()` at the sink.
 */
export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
