import { allLowConfidence, alternatives, initialResult, notIt, promote, resultHeading } from '../scanResult';

// UX-005 (#112): the scan result state machine.
const c = (...scores: number[]) => scores.map(confidence => ({ confidence }));

describe('scan result state', () => {
  it('starts on the most confident candidate, alternatives hidden', () => {
    expect(initialResult(c(62, 88, 41))).toEqual({ best: 1, showAlternatives: false });
  });

  it('with three candidates "Not it" reveals the other two, in order', () => {
    const s = notIt(initialResult(c(88, 62, 41)));
    expect(s.showAlternatives).toBe(true);
    expect(alternatives(s, 3)).toEqual([1, 2]);
  });

  it('tapping an alternative promotes it into the comparison', () => {
    const s = promote(notIt(initialResult(c(88, 62, 41))), 2, 3);
    expect(s.best).toBe(2);
    expect(alternatives(s, 3)).toEqual([0, 1]);
    expect(s.showAlternatives).toBe(true);
  });

  it('ignores out-of-range or no-op promotions', () => {
    const s = initialResult(c(88, 62));
    expect(promote(s, 0, 2)).toBe(s);
    expect(promote(s, 5, 2)).toBe(s);
    expect(promote(s, -1, 2)).toBe(s);
  });

  it('one candidate: nothing else to show after "Not it"', () => {
    const s = notIt(initialResult(c(70)));
    expect(alternatives(s, 1)).toEqual([]);
    expect(resultHeading(c(70))).toBe('Is this your pin?');
  });

  it('all low-confidence (< 40): asks instead of asserting, alternatives shown at once', () => {
    expect(allLowConfidence(c(39, 20, 12))).toBe(true);
    expect(allLowConfidence(c(40, 20))).toBe(false);
    expect(initialResult(c(39, 20, 12)).showAlternatives).toBe(true);
    expect(resultHeading(c(39, 20, 12))).toBe('Not sure. Is it one of these?');
    expect(resultHeading(c(88, 20))).toBe('Best match');
  });
});
