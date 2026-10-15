import { allLowConfidence, alternatives, awaitingPick, initialResult, notIt, promote, resultHeading } from '../scanResult';

// UX-005 (#112): the scan result state machine.
const c = (...scores: number[]) => scores.map(confidence => ({ confidence }));

describe('scan result state', () => {
  it('starts on the most confident candidate, alternatives hidden', () => {
    expect(initialResult(c(62, 88, 41))).toEqual({ best: 1, showAlternatives: false, rejected: [] });
  });

  it('with three candidates "Not it" reveals the other two, in order', () => {
    const s = notIt(initialResult(c(88, 62, 41)));
    expect(s.showAlternatives).toBe(true);
    expect(alternatives(s, 3)).toEqual([1, 2]);
  });

  it('"Not it" rejects the compared pin: no "That\'s it" until another is picked (#299)', () => {
    const s = notIt(initialResult(c(88, 62, 41)));
    expect(awaitingPick(s)).toBe(true);
    expect(resultHeading(c(88, 62, 41), s)).toBe('Is it one of these?');
    const picked = promote(s, 1, 3);
    expect(awaitingPick(picked)).toBe(false);
    // The rejected pin is never offered again…
    expect(alternatives(picked, 3)).toEqual([2]);
    expect(promote(picked, 0, 3)).toBe(picked);
    // …and "Not it" on the new pick rejects that one too.
    const again = notIt(picked);
    expect(again.rejected).toEqual([0, 1]);
    expect(alternatives(again, 3)).toEqual([2]);
  });

  it('every candidate rejected: says so, leaving None of these', () => {
    const s = notIt(promote(notIt(initialResult(c(88, 62))), 1, 2));
    expect(alternatives(s, 2)).toEqual([]);
    expect(resultHeading(c(88, 62), s)).toBe('No other close matches');
  });

  it('tapping an alternative promotes it into the comparison', () => {
    const s = promote(notIt(initialResult(c(88, 62, 41))), 2, 3);
    expect(s.best).toBe(2);
    expect(alternatives(s, 3)).toEqual([1]);
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
    // #298: the same plain question whatever the number of candidates.
    expect(resultHeading(c(88, 20))).toBe('Is this your pin?');
  });
});
