/**
 * Date utilities for the health app
 * Ensures consistent date handling across the application
 */

/**
 * Get the start of the current week (Monday at 00:00:00 LOCAL time).
 * Used for both meals and workouts to keep "Monday" consistent for users.
 */
export function getStartOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday is start of week
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format a date as YYYY-MM-DD for consistent storage/display.
 */
export function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get the end of the current week (Sunday at 23:59:59 UTC)
 */
export function getEndOfWeek(date: Date = new Date()): Date {
  const startOfWeek = getStartOfWeek(date);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setUTCHours(23, 59, 59, 999);
  return endOfWeek;
}

/**
 * Get the current week number of the year
 */
export function getWeekNumber(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Format date for display (e.g., "Week of Jan 15, 2024")
 */
export function formatWeekDisplay(date: Date): string {
  const startOfWeek = getStartOfWeek(date);
  return `Week of ${startOfWeek.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })}`;
}

/**
 * Get day name from date
 */
export function getDayName(date: Date): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
}

/**
 * Get days array starting from Monday
 */
export function getWeekDays(): string[] {
  return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
}

/**
 * Check if two dates are in the same week
 */
export function isSameWeek(date1: Date, date2: Date): boolean {
  const start1 = getStartOfWeek(date1);
  const start2 = getStartOfWeek(date2);
  return start1.getTime() === start2.getTime();
}

/**
 * Get current date in YYYY-MM-DD format
 */
export function getCurrentDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get the current week's date range for display
 */
export function getCurrentWeekRange(): { start: Date; end: Date; weekNumber: number } {
  const now = new Date();
  return {
    start: getStartOfWeek(now),
    end: getEndOfWeek(now),
    weekNumber: getWeekNumber(now)
  };
}

export const MEAL_BOUNDARIES = {
  breakfast: { start: 0, end: 11 },
  lunch: { start: 11, end: 17 },
  dinner: { start: 17, end: 24 }
};

export type MealPeriod = 'breakfast' | 'lunch' | 'dinner';

export function getPlanDayIndex(planStartDate: Date | string, timezone: string = 'America/Los_Angeles'): number {
  const start = new Date(planStartDate);
  const now = new Date();
  const startLocal = new Date(start.toLocaleString('en-US', { timeZone: timezone }));
  const nowLocal = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  startLocal.setHours(0, 0, 0, 0);
  nowLocal.setHours(0, 0, 0, 0);
  return Math.floor((nowLocal.getTime() - startLocal.getTime()) / (1000 * 60 * 60 * 24));
}

export function getCurrentMealPeriod(timezone: string = 'America/Los_Angeles'): MealPeriod {
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const hour = localTime.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 17) return 'lunch';
  return 'dinner';
}

export function isPlanExpired(planStartDate: Date | string, timezone: string = 'America/Los_Angeles'): boolean {
  return getPlanDayIndex(planStartDate, timezone) >= 7;
}

export function getDayStatus(dayIndex: number, currentDayIndex: number): 'past' | 'today' | 'future' {
  if (dayIndex < currentDayIndex) return 'past';
  if (dayIndex === currentDayIndex) return 'today';
  return 'future';
}

export function getPlanDays(planStartDate: Date | string) {
  const start = new Date(planStartDate);
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayDisplayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const startDayIndex = start.getDay();

  return Array.from({ length: 7 }, (_, i) => {
    const dayIndex = (startDayIndex + i) % 7;
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return {
      id: dayNames[dayIndex],
      name: dayDisplayNames[dayIndex],
      dayNumber: i + 1,
      dayIndex: i,
      date: date.toISOString().split('T')[0]
    };
  });
}

export function getBrowserTimezone(): string {
  if (typeof window !== 'undefined') {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return 'America/Los_Angeles';
}