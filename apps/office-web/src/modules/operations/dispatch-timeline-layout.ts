export const timelineStartMinutes = 7 * 60;
export const timelineEndMinutes = 18 * 60;
export const timelineSlotMinutes = 15;
export const timelineSlotCount = (timelineEndMinutes - timelineStartMinutes) / timelineSlotMinutes;

export const timelineTickLabels = [
  { label: '7 AM', column: 1 },
  { label: '9 AM', column: 9 },
  { label: '11 AM', column: 17 },
  { label: '1 PM', column: 25 },
  { label: '3 PM', column: 33 },
  { label: '5 PM', column: 41 }
];

export const timelineLabelWidth = '8.5rem';
export const timelineLaneMinWidth = '96rem';
export const timelineColumnGap = '0.75rem';
export const timelineRowMinHeight = '4.85rem';
export const timelineCardMinHeight = '3.8rem';
export const timelineCardTextLineHeight = '1.1rem';

export const timelineGridTemplateColumns = `repeat(${timelineSlotCount}, minmax(1rem, 1fr)) minmax(11rem, 12rem)`;
