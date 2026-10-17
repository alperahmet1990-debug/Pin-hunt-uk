// #257: a submission's back photo is evidence for the admin review only. It
// must not be pre-filled onto the new public catalogue pin on approval.
const fs = require('fs');
const path = require('path');

const review = fs.readFileSync(path.join(__dirname, '../app/admin/review/[id].tsx'), 'utf8');

describe('admin review: back photo stays admin-only (#257)', () => {
  it('approval pre-fills the front photo but not the back', () => {
    const approve = review.slice(review.indexOf('const approveAndAddToCatalogue'), review.indexOf('if (loading)'));
    expect(approve).toMatch(/prefillFrontPath:/);
    expect(approve).not.toMatch(/prefillBackPath:/);
  });

  it('the review labels the back as admin-only', () => {
    expect(review).toMatch(/BACK OF PIN · ADMINS ONLY/);
  });
});
