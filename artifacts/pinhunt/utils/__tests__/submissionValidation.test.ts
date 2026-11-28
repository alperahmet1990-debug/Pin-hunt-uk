import { validateSubmissionFields } from '../submissionValidation';

const ok = { proposedName: 'Mickey', releaseYear: '', editionSize: '' };

describe('validateSubmissionFields', () => {
  it('accepts a name alone (brand is not a field, so it is optional)', () => {
    expect(validateSubmissionFields(ok)).toEqual({});
  });
  it('requires a name', () => {
    expect(validateSubmissionFields({ ...ok, proposedName: '  ' }).proposedName).toMatch(/name/);
  });
  it('rejects out-of-range or non-numeric years with one message', () => {
    const msg = 'Enter a year between 1900 and 2030.';
    expect(validateSubmissionFields({ ...ok, releaseYear: '1800' }).releaseYear).toBe(msg);
    expect(validateSubmissionFields({ ...ok, releaseYear: '2031' }).releaseYear).toBe(msg);
    expect(validateSubmissionFields({ ...ok, releaseYear: 'abc' }).releaseYear).toBe(msg);
    expect(validateSubmissionFields({ ...ok, releaseYear: '2020' })).toEqual({});
  });
  it('rejects non-positive edition sizes', () => {
    expect(validateSubmissionFields({ ...ok, editionSize: '0' }).editionSize).toMatch(/positive/);
    expect(validateSubmissionFields({ ...ok, editionSize: '2500' })).toEqual({});
  });
});
