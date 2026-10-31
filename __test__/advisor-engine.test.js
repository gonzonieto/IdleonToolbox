import { describe, expect, it } from 'vitest';
import { getRecommendations } from '../utility/advisor/engine';

const input = { account: {}, characters: [{ name: 'Advanced', talentPointsLeft: [5000, 5000] }] };
describe('evaluated progression advisor', () => {
  it('does not turn thousands of spare points into advice', () => {
    expect(getRecommendations(input).recommendations).toEqual([]);
  });
  it('does not turn low stamps, bubbles or better peers into unevaluated advice', () => {
    const account = { stamps: { combat: [{ level: 1 }, { level: 2 }] },
      alchemy: { bubblesFlat: [{ bubbleName: 'FARQUAD_FORCE', level: 1 }] } };
    expect(getRecommendations({ ...input, account }).recommendations).toEqual([]);
  });
  it('ranks calculated positive gains and suppresses nonpositive or invalid predictions', () => {
    const result = getRecommendations({ ...input, evaluation: { baseline: 100, checked: 4, actions: [
      { id: 'small', after: 101, gainPercent: 1 }, { id: 'big', after: 110, gainPercent: 10 },
      { id: 'zero', after: 100, gainPercent: 0 }, { id: 'bad', after: NaN, gainPercent: NaN }
    ] } });
    expect(result.recommendations.map((r) => r.id)).toEqual(['big', 'small']);
    expect(result.recommendations[0].before).toBe(100);
  });
  it('provides no predictions if the baseline is unavailable', () => {
    const result = getRecommendations({ ...input, evaluation: { baseline: NaN, actions: [] } });
    expect(result.recommendations).toEqual([]);
    expect(result.diagnostics.join(' ')).toContain('could not be calculated');
  });
  it('includes tiny positive gains without an arbitrary threshold', () => {
    const evaluation = { baseline: 100, checked: 1, actions: [{ id: 'tiny', after: 100.001, gainPercent: 0.001 }] };
    expect(getRecommendations({ ...input, evaluation }).recommendations).toHaveLength(1);
  });
});
