/**
 * Pure layout math for the estimate PDF table renderer, kept free of pdfkit
 * so row placement and page-break decisions are unit-testable.
 */

export type PdfTableColumn = {
  x: number;
  width: number;
  align?: 'left' | 'right';
};

/** Column geometry shared by the line-item table header and rows. */
export const estimateLineColumns: readonly PdfTableColumn[] = [
  { x: 48, width: 260 },
  { x: 310, width: 50, align: 'right' },
  { x: 360, width: 75, align: 'right' },
  { x: 435, width: 100, align: 'right' }
];

export type RowPlacement = {
  startsOnNewPage: boolean;
  /** Where the row's cells should be drawn. */
  y: number;
  /** Where the cursor belongs after the row, past its tallest cell. */
  nextY: number;
};

/**
 * Place one table row given the measured height of each cell. Every cell is
 * drawn at the same y; the cursor advances by the tallest cell so a wrapped
 * description can never collide with the next row. Rows that would cross the
 * bottom margin start on a fresh page instead of splitting.
 */
export function placeRow(input: {
  y: number;
  cellHeights: number[];
  rowGap: number;
  pageTop: number;
  pageBottom: number;
}): RowPlacement {
  const rowHeight = Math.max(0, ...input.cellHeights);
  if (input.y + rowHeight > input.pageBottom && input.y > input.pageTop) {
    return {
      startsOnNewPage: true,
      y: input.pageTop,
      nextY: input.pageTop + rowHeight + input.rowGap
    };
  }
  return {
    startsOnNewPage: false,
    y: input.y,
    nextY: input.y + rowHeight + input.rowGap
  };
}
