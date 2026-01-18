import { useMemo, useState, useEffect } from 'react';
import { useTheme } from '../../../../../hooks/useTheme';
import { spacing } from '../../../../../tokens/spacing';
import { sidebarLayout } from '../../../../../tokens/sidebar';

interface CalendarDateGridProps {
  view?: 'week' | 'month';
  weekStart: Date; // Start of the week to display
  onDateClick?: (_date: Date) => void;
  selectedDate?: Date;
}

export const CalendarDateGrid = ({
  view: _view = 'week', // Reserved for future month view implementation
  weekStart,
  onDateClick,
  selectedDate,
}: CalendarDateGridProps) => {
  const { colors } = useTheme();

  // Get today at start of day (normalized) - updates at midnight
  const [today, setToday] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });

  // 🕐 AUTO-UPDATE: Detect day change at exactly 00:00:00 and update "today"
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

        // Schedule next day check
        scheduleNextDayCheck();
      }, msUntilMidnight);

      return timeoutId;
    };

    const timeoutId = scheduleNextDayCheck();

    return () => clearTimeout(timeoutId);
  }, []);

  // Calculate week days based on the provided weekStart
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      return date;
    });
  }, [weekStart]);

  // Check if two dates are the same day
  const isSameDay = (date1: Date, date2: Date | undefined) => {
    if (!date2) return false;
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const handleDateClick = (date: Date) => {
    if (onDateClick) {
      onDateClick(date);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing['0'], // Gap between weekday headers and date grid
      }}
    >
      {/* Weekday Headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: sidebarLayout.calendarGridGap, // ✅ Controlled by global token
          padding: spacing['2'],
        }}
      >
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div
            key={i}
            style={{
              height: sidebarLayout.calendarCellHeight, // ✅ Controlled by global token
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              fontWeight: 500,
              color: colors.text.secondary,
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Date Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: sidebarLayout.calendarGridGap, // ✅ Controlled by global token
          backgroundColor: colors.background.tertiary,
          padding: sidebarLayout.calendarPadding, // ✅ Controlled by global token
          borderRadius: sidebarLayout.calendarBorderRadius, // ✅ Controlled by global token
        }}
      >
        {weekDays.map((date, index) => {
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          // Use Thursday (4th day) to determine the "current" month - ISO week date standard
          const thursday = new Date(weekStart);
          thursday.setDate(thursday.getDate() + 4);
          const currentMonth = thursday.getMonth();
          const isCurrentMonth = date.getMonth() === currentMonth;

          return (
            <button
              key={index}
              onClick={() => handleDateClick(date)}
              style={{
                height: sidebarLayout.calendarCellHeight, // ✅ Controlled by global token
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: isToday || isSelected ? 600 : 400,
                color: isSelected
                  ? '#FFFFFF' // Selected: white text
                  : isToday
                    ? colors.semantic.calendarAccent // ✅ Today (not selected): orange text
                    : isCurrentMonth
                      ? colors.text.default // Current month: normal text
                      : colors.text.tertiary, // Other month: faded text
                backgroundColor: isSelected
                  ? colors.semantic.calendarAccent // Selected: orange background
                  : 'transparent', // ✅ Today/others: no background
                border: '1px solid transparent',
                borderRadius: sidebarLayout.calendarBorderRadius, // ✅ Controlled by global token
                cursor: 'pointer',
                transition: 'all 150ms ease',
                padding: '4px 0',
                boxSizing: 'border-box',
              }}
              onMouseEnter={(e) => {
                // OVERLAY STRATEGY: Calendar dates are ghost-like
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = colors.overlay.soft;
                }
              }}
              onMouseLeave={(e) => {
                if (isSelected) {
                  e.currentTarget.style.backgroundColor =
                    colors.semantic.calendarAccent;
                } else {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};
