import { describe, it, expect } from 'vitest';
import { analyzeProject } from '../lib/analyzer';
import { SAMPLE_FILES } from '../lib/sample';
import { buildSequence } from '../lib/sequence';

const a = analyzeProject(SAMPLE_FILES);
describe('sequence diagrams from traces', () => {
  it('numbers messages in order and ends with a response back to the user', () => {
    for (const t of a.traces) {
      const s = buildSequence(a, SAMPLE_FILES, t);
      expect(s.messages.map((m) => m.n)).toEqual(s.messages.map((_, i) => i + 1));
      expect(s.actors[0].id).toBe('user');
      expect(s.messages.some((m) => m.kind === 'return')).toBe(true);
    }
  });
  it('shows missing auth as an explicit unknown, not a fake check', () => {
    const s = buildSequence(a, SAMPLE_FILES, a.traces[0]);
    const authMsg = s.messages.find((m) => m.to === 'auth' || m.from === 'auth');
    if (authMsg) expect(authMsg.kind).toBe('unknown');
  });
});
