import { describe, expect, it } from 'vitest';
import { deprecationText, maintainerText } from '../src/index.js';
import { modelFlag } from './builders.js';

describe('maintainerText', () => {
  it('names a team as team <name>, and a member by email', () => {
    expect(maintainerText({ kind: 'team', key: 'payments', name: 'Payments' })).toBe('team Payments');
    expect(maintainerText({ kind: 'member', email: 'ana@example.com', name: 'Ana' })).toBe('ana@example.com');
  });
});

describe('deprecationText', () => {
  const code = (key: string) => `\`${key}\``;

  it('is undefined for a flag that is not deprecated', () => {
    expect(deprecationText(modelFlag('old-flag'), code)).toBeUndefined();
  });

  it("is the flag's message, escaped, when it has one", () => {
    const flag = modelFlag('old-flag', { deprecated: true, deprecationMessage: 'Use <new>.' });
    expect(deprecationText(flag, code, (t) => t.replace(/</g, '&lt;'))).toBe('Use &lt;new>.');
  });

  it('falls back to a generic message quoting the key as code, without escaping it', () => {
    const flag = modelFlag('old-flag', { deprecated: true });
    expect(deprecationText(flag, code, () => 'escaped')).toBe('The `old-flag` flag is deprecated.');
  });
});
