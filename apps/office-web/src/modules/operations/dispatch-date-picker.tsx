'use client';

import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type DispatchDatePickerProps = {
  value: string;
  onChange?: (date: string) => void;
};

export function DispatchDatePicker({ value, onChange }: DispatchDatePickerProps) {
  const effectiveValue = value || getDateInputValue();
  const [draftValue, setDraftValue] = useState(effectiveValue);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [visibleMonthDate, setVisibleMonthDate] = useState(() =>
    getMonthStart(parseDateInputValue(effectiveValue) ?? new Date())
  );
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonthDate), [visibleMonthDate]);

  useEffect(() => {
    setDraftValue(effectiveValue);
    const parsedDate = parseDateInputValue(effectiveValue);
    if (parsedDate) {
      setVisibleMonthDate(getMonthStart(parsedDate));
    }
  }, [effectiveValue]);

  function commitDate(nextDate: string) {
    setDraftValue(nextDate);
    onChange?.(nextDate);
  }

  function handleTodayClick() {
    const today = getDateInputValue();
    setVisibleMonthDate(getMonthStart(parseDateInputValue(today) ?? new Date()));
    commitDate(today);
    setIsCalendarOpen(false);
  }

  function handleDayOffset(offset: number) {
    const currentDate = parseDateInputValue(draftValue) ?? new Date();
    const nextDate = addDays(currentDate, offset);
    const nextValue = getDateInputValue(nextDate);
    setVisibleMonthDate(getMonthStart(nextDate));
    commitDate(nextValue);
  }

  function handleMonthOffset(offset: number) {
    setVisibleMonthDate(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );
  }

  function handleMonthSelect(monthIndex: number) {
    setVisibleMonthDate((current) => new Date(current.getFullYear(), monthIndex, 1));
  }

  function handleCalendarDateSelect(date: Date) {
    commitDate(getDateInputValue(date));
    setVisibleMonthDate(getMonthStart(date));
    setIsCalendarOpen(false);
  }

  function toggleCalendar() {
    const parsedDate = parseDateInputValue(draftValue);
    if (parsedDate) {
      setVisibleMonthDate(getMonthStart(parsedDate));
    }
    setIsCalendarOpen((current) => !current);
  }

  function handleCalendarKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') {
      setIsCalendarOpen(false);
    }
  }

  return (
    <div style={dateToolbarStyle}>
      <button type="button" onClick={handleTodayClick} style={styles.button}>
        Today
      </button>
      <div style={datePickerWrapStyle}>
        <button
          type="button"
          aria-controls="dispatch-calendar-popover"
          aria-expanded={isCalendarOpen}
          aria-label="Dispatch date"
          onClick={toggleCalendar}
          onKeyDown={handleCalendarKeyDown}
          style={dateDisplayButtonStyle}
        >
          <span aria-hidden="true" style={calendarGlyphStyle} />
          <span>{formatDispatchDate(draftValue)}</span>
        </button>
        {isCalendarOpen ? (
          <div
            id="dispatch-calendar-popover"
            role="dialog"
            aria-label="Dispatch calendar"
            style={calendarPopoverStyle}
          >
            <div style={monthRailStyle} aria-label="Months">
              <strong style={monthRailYearStyle}>{visibleMonthDate.getFullYear()}</strong>
              {monthShortLabels.map((label, monthIndex) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleMonthSelect(monthIndex)}
                  style={
                    monthIndex === visibleMonthDate.getMonth()
                      ? activeMonthButtonStyle
                      : monthButtonStyle
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={calendarPanelStyle}>
              <div style={calendarHeaderStyle}>
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => handleMonthOffset(-1)}
                  style={calendarNavButtonStyle}
                >
                  {'<'}
                </button>
                <strong>{formatMonthYear(visibleMonthDate)}</strong>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => handleMonthOffset(1)}
                  style={calendarNavButtonStyle}
                >
                  {'>'}
                </button>
                <button type="button" onClick={handleTodayClick} style={calendarTodayButtonStyle}>
                  Today
                </button>
              </div>
              <div style={calendarWeekHeaderStyle} aria-hidden="true">
                {weekDayLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div style={calendarDayGridStyle}>
                {calendarDays.map((date) => {
                  const dateValue = getDateInputValue(date);
                  const isSelected = dateValue === draftValue;
                  const isOutsideMonth = date.getMonth() !== visibleMonthDate.getMonth();

                  return (
                    <button
                      key={dateValue}
                      type="button"
                      aria-label={formatFullDate(date)}
                      onClick={() => handleCalendarDateSelect(date)}
                      style={{
                        ...calendarDayButtonStyle,
                        ...(isOutsideMonth ? outsideMonthDayStyle : {}),
                        ...(isSelected ? selectedDayButtonStyle : {})
                      }}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Previous dispatch day"
        onClick={() => handleDayOffset(-1)}
        style={iconButtonStyle}
      >
        {'<'}
      </button>
      <button
        type="button"
        aria-label="Next dispatch day"
        onClick={() => handleDayOffset(1)}
        style={iconButtonStyle}
      >
        {'>'}
      </button>
    </div>
  );
}

export function getDateInputValue(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsedDate = new Date(year, monthIndex, day);

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== monthIndex ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return parsedDate;
}

function addDays(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildCalendarDays(monthDate: Date): Date[] {
  const monthStart = getMonthStart(monthDate);
  const gridStart = addDays(monthStart, -monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function formatDispatchDate(value: string): string {
  const parsedDate = parseDateInputValue(value);

  if (!parsedDate) {
    return value || 'Today';
  }

  return parsedDate.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString([], {
    month: 'long',
    year: 'numeric'
  });
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

const weekDayLabels = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const monthShortLabels = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

const dateToolbarStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.65rem',
  minWidth: 0
};

const datePickerWrapStyle: CSSProperties = {
  maxWidth: '100%',
  minWidth: '17rem',
  position: 'relative'
};

const dateDisplayButtonStyle: CSSProperties = {
  alignItems: 'center',
  background: '#ffffff',
  border: '1px solid #cfd8d2',
  borderRadius: 8,
  color: '#1f2933',
  cursor: 'pointer',
  display: 'flex',
  fontSize: '0.95rem',
  fontWeight: 800,
  gap: '0.65rem',
  justifyContent: 'flex-start',
  minHeight: '2.7rem',
  padding: '0.55rem 0.75rem',
  width: '100%'
};

const calendarGlyphStyle: CSSProperties = {
  border: '2px solid #9aa5b1',
  borderRadius: 4,
  height: '1.1rem',
  width: '1.1rem'
};

const iconButtonStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid transparent',
  borderRadius: 8,
  color: '#111827',
  cursor: 'pointer',
  fontSize: '1.3rem',
  fontWeight: 900,
  minHeight: '2.7rem',
  minWidth: '2.7rem',
  padding: '0.35rem 0.55rem'
};

const calendarPopoverStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #d6ded9',
  borderRadius: 8,
  boxShadow: '0 18px 38px rgba(15, 23, 42, 0.16)',
  display: 'grid',
  gridTemplateColumns: '4.75rem minmax(0, 1fr)',
  left: 0,
  maxWidth: 'min(92vw, 31rem)',
  minWidth: 0,
  overflow: 'hidden',
  position: 'absolute',
  top: 'calc(100% + 0.45rem)',
  width: 'min(92vw, 31rem)',
  zIndex: 20
};

const monthRailStyle: CSSProperties = {
  background: '#f7f8f6',
  borderRight: '1px solid #dfe6df',
  display: 'grid',
  gap: '0.1rem',
  justifyItems: 'stretch',
  padding: '0.65rem 0.45rem'
};

const monthRailYearStyle: CSSProperties = {
  color: '#52606d',
  fontSize: '0.9rem',
  padding: '0.25rem 0.45rem'
};

const monthButtonStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 6,
  color: '#52606d',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 700,
  padding: '0.35rem 0.45rem',
  textAlign: 'left'
};

const activeMonthButtonStyle: CSSProperties = {
  ...monthButtonStyle,
  background: '#ffffff',
  border: '1px solid #cfd8d2',
  color: '#111827'
};

const calendarPanelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.75rem',
  padding: '0.9rem'
};

const calendarHeaderStyle: CSSProperties = {
  alignItems: 'center',
  display: 'grid',
  gap: '0.5rem',
  gridTemplateColumns: '2rem 1fr 2rem auto'
};

const calendarNavButtonStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #dfe6df',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: '1rem',
  fontWeight: 900,
  minHeight: '2rem'
};

const calendarTodayButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#176b5b',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 900,
  padding: '0.35rem'
};

const calendarWeekHeaderStyle: CSSProperties = {
  color: '#52606d',
  display: 'grid',
  fontSize: '0.78rem',
  fontWeight: 900,
  gridTemplateColumns: 'repeat(7, 1fr)',
  textAlign: 'center'
};

const calendarDayGridStyle: CSSProperties = {
  display: 'grid',
  gap: '0.25rem',
  gridTemplateColumns: 'repeat(7, 1fr)'
};

const calendarDayButtonStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid transparent',
  borderRadius: 6,
  color: '#111827',
  cursor: 'pointer',
  fontSize: '0.95rem',
  minHeight: '2.35rem',
  padding: '0.35rem'
};

const outsideMonthDayStyle: CSSProperties = {
  color: '#9aa5b1'
};

const selectedDayButtonStyle: CSSProperties = {
  background: '#176b5b',
  border: '1px solid #176b5b',
  color: '#ffffff',
  fontWeight: 900
};
