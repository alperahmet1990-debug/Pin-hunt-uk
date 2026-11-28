/**
 * Shared field rules for pin submissions, used by Add Pin and Edit submission
 * so the two screens accept the same input and show the same copy.
 * Name is required; brand and the rest are optional.
 */
export type SubmissionFieldErrors = {
  proposedName?: string;
  releaseYear?: string;
  editionSize?: string;
};

export interface SubmissionFieldInput {
  proposedName: string;
  releaseYear: string;
  editionSize: string;
}

export function validateSubmissionFields(input: SubmissionFieldInput): SubmissionFieldErrors {
  const errs: SubmissionFieldErrors = {};
  if (!input.proposedName.trim()) {
    errs.proposedName = 'Enter the pin’s name. A short description is fine.';
  }
  if (input.releaseYear.trim()) {
    const y = parseInt(input.releaseYear, 10);
    if (isNaN(y) || y < 1900 || y > 2030) errs.releaseYear = 'Enter a year between 1900 and 2030.';
  }
  if (input.editionSize.trim()) {
    const s = parseInt(input.editionSize, 10);
    if (isNaN(s) || s <= 0) errs.editionSize = 'Must be a positive whole number.';
  }
  return errs;
}
