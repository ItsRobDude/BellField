import { placeRow } from './estimate-pdf-layout';

describe('placeRow', () => {
  const page = { pageTop: 48, pageBottom: 744, rowGap: 6 };

  it('advances the cursor by the tallest cell so wrapped text cannot collide', () => {
    const placement = placeRow({ y: 100, cellHeights: [36, 12, 12, 12], ...page });

    expect(placement.startsOnNewPage).toBe(false);
    expect(placement.y).toBe(100);
    expect(placement.nextY).toBe(100 + 36 + 6);
  });

  it('starts a new page when the row would cross the bottom margin', () => {
    const placement = placeRow({ y: 730, cellHeights: [24, 12], ...page });

    expect(placement.startsOnNewPage).toBe(true);
    expect(placement.y).toBe(48);
    expect(placement.nextY).toBe(48 + 24 + 6);
  });

  it('keeps a row exactly touching the bottom margin on the current page', () => {
    const placement = placeRow({ y: 720, cellHeights: [24], ...page });

    expect(placement.startsOnNewPage).toBe(false);
    expect(placement.nextY).toBe(720 + 24 + 6);
  });

  it('does not loop a too-tall row onto endless new pages when already at the top', () => {
    const placement = placeRow({ y: 48, cellHeights: [2000], ...page });

    expect(placement.startsOnNewPage).toBe(false);
    expect(placement.y).toBe(48);
  });
});
