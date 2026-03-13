import { useState, useMemo, useEffect } from 'react';
import { useTheme } from '../../../../../hooks/useTheme';
import { ChevronLeft, ChevronRight } from '../../../../../icons';
import { spacing } from '../../../../../tokens/spacing';
import { radius } from '../../../../../tokens/radius';

interface SidebarCalendarProps {
  onDateSelect?: (_date: Date) => void;
  selectedDate?: Date;
  noPadding?: boolean; // Option to remove padding for compact views
  datesWithNotes?: Set<string>; // Set of YYYY-MM-DD strings that have notes
}

export const SidebarCalendar = ({
  onDateSelect,
  selectedDate,
  noPadding = false,
  datesWithNotes,
}: SidebarCalendarProps) => {
  const { colors } = useTheme();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [today, setToday] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });

  // 🕐 AUTO-UPDATE: Detect day change at exactly 00:00:00 and scroll calendar
  useEffect(() => {
    const scheduleNextDayCheck = () => {
      const now = new Date();
      const tomorrow = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        0
      ); // 00:00:00 tomorrow
      const msUntilMidnight = tomorrow.getTime() - now.getTime();

      // Set timeout to trigger at exactly 00:00:00
      const timeoutId = setTimeout(() => {
        const newToday = new Date();
        const normalizedToday = new Date(
          newToday.getFullYear(),
          newToday.getMonth(),
          newToday.getDate()
        );

        

        // Update today
        setToday(normalizedToday);

        // Auto-scroll calendar to the new month
        setCurrentMonth(
          new Date(newToday.getFullYear(), newToday.getMonth(), 1)
        );

        // Schedule next day check
        scheduleNextDayCheck();
      }, msUntilMidnight);

      return timeoutId;
    };

    const timeoutId = scheduleNextDayCheck();

    return () => clearTimeout(timeoutId);
  }, []);

  // Get days in month including overflow from previous/next months
  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: Date[] = [];

    // Add trailing days from previous month
    const prevMonthLastDay = new Date(year, month, 0);
    const prevMonthDays = prevMonthLastDay.getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push(new Date(year, month - 1, prevMonthDays - i));
    }

    // Add all days in the current month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    // Add leading days from next month to complete the grid
    const remainingCells = 42 - days.length; // 6 rows * 7 days
    for (let day = 1; day <= remainingCells; day++) {
      days.push(new Date(year, month + 1, day));
    }

    return days;
  }, [currentMonth]);

  const monthName = currentMonth.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  const handlePreviousMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    );
  };

  const handleNextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    );
  };

  const handleDateClick = (date: Date) => {
    if (onDateSelect) {
      onDateSelect(date);
    }
  };

  const isSameDay = (
    date1: Date | null | undefined,
    date2: Date | null | undefined
  ) => {
    if (!date1 || !date2) return false;
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  return (
    <div
      style={{
        padding: noPadding ? '0' : '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: spacing['8'],
      }}
    >
      {/* Header with month navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '4px',
        }}
      >
        <button
          onClick={handlePreviousMonth}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: spacing['4'],
            display: 'flex',
            alignItems: 'center',
            color: colors.text.secondary,
            borderRadius: radius['3'],
            transition: 'background-color 150ms ease',
          }}
          onMouseEnter={(e) => {
            // OVERLAY STRATEGY: Sidebar calendar elements are ghost-like
            e.currentTarget.style.backgroundColor = colors.overlay.soft;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <ChevronLeft size={16} />
        </button>

        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: colors.text.default,
          }}
        >
          {monthName}
        </div>

        <button
          onClick={handleNextMonth}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: spacing['4'],
            display: 'flex',
            alignItems: 'center',
            color: colors.text.secondary,
            borderRadius: radius['3'],
            transition: 'background-color 150ms ease',
          }}
          onMouseEnter={(e) => {
            // OVERLAY STRATEGY: Sidebar calendar elements are ghost-like
            e.currentTarget.style.backgroundColor = colors.overlay.soft;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day names */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: spacing['4'],
          marginBottom: '4px',
        }}
      >
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div
            key={i}
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: colors.text.tertiary,
              textAlign: 'center',
              padding: '4px 0',
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: spacing['2'],
        }}
      >
        {daysInMonth.map((date, index) => {
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          const isCurrentMonth = date.getMonth() === currentMonth.getMonth();

          // Check if this date has a note
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          const hasNote = datesWithNotes?.has(dateStr);

          return (
            <button
              key={index}
              onClick={() => handleDateClick(date)}
              style={{
                aspectRatio: '1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing['2'],
                fontSize: '12px',
                fontWeight: isToday || isSelected ? 600 : 400,
                color: isSelected
                  ? colors.text.default
                  : isToday
                    ? colors.text.default
                    : isCurrentMonth
                      ? colors.text.default
                      : colors.text.disabled,
                backgroundColor: isSelected
                  ? colors.background.tertiary
                  : 'transparent',
                border: isToday
                  ? `1px solid ${colors.border.default}`
                  : '1px solid transparent',
                borderRadius: radius['3'],
                cursor: 'pointer',
                transition: 'all 150ms ease',
                padding: '4px 0',
                boxSizing: 'border-box',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  // OVERLAY STRATEGY: Sidebar calendar elements are ghost-like
                  e.currentTarget.style.backgroundColor = colors.overlay.soft;
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = isSelected
                    ? colors.background.tertiary
                    : 'transparent';
                }
              }}
            >
              <span>{date.getDate()}</span>
              {/* Dot indicator for dates with notes */}
              {hasNote && (
                <div
                  style={{
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    backgroundColor: colors.semantic.info,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
