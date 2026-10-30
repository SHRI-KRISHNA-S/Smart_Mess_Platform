/**
 * Authoritative Smart Mess Meal Serving Times (Asia/Kolkata IST)
 *
 * Serving Hours:
 * - Morning Tiffin / Breakfast: 7:00 AM – 8:30 AM
 * - Lunch: 12:30 PM – 1:30 PM
 * - Night Dinner: 7:00 PM – 8:15 PM
 *
 * Distinct from poll closing deadlines:
 * - Morning Tiffin: 8:00 PM IST on the previous day.
 * - Evening Lunch: 8:00 PM IST on the previous day.
 * - Night Dinner: 10:00 AM IST on the same day.
 */

export const MEAL_SERVING_TIMES = {
  breakfast: '7:00 AM – 8:30 AM',
  lunch: '12:30 PM – 1:30 PM',
  dinner: '7:00 PM – 8:15 PM'
};

export const MEAL_TIMING_CONFIG = [
  {
    id: 'breakfast',
    key: 'breakfast',
    label: 'Morning Tiffin',
    icon: '🌅',
    servingHours: '7:00 AM – 8:30 AM',
    servingFormatted: 'Serving: 7:00 AM – 8:30 AM',
    deadlineDisplay: 'Deadline: 8:00 PM IST'
  },
  {
    id: 'lunch',
    key: 'lunch',
    label: 'Evening Lunch',
    icon: '☀️',
    servingHours: '12:30 PM – 1:30 PM',
    servingFormatted: 'Serving: 12:30 PM – 1:30 PM',
    deadlineDisplay: 'Deadline: 8:00 PM IST'
  },
  {
    id: 'dinner',
    key: 'dinner',
    label: 'Night Dinner',
    icon: '🌙',
    servingHours: '7:00 PM – 8:15 PM',
    servingFormatted: 'Serving: 7:00 PM – 8:15 PM',
    deadlineDisplay: 'Deadline: 10:00 AM IST'
  }
];

export function getMealServingTime(mealType) {
  if (!mealType) return '';
  const norm = String(mealType).toLowerCase().trim();
  if (norm.includes('break') || norm.includes('tiffin')) return MEAL_SERVING_TIMES.breakfast;
  if (norm.includes('lunch')) return MEAL_SERVING_TIMES.lunch;
  if (norm.includes('dinner') || norm.includes('night')) return MEAL_SERVING_TIMES.dinner;
  return MEAL_SERVING_TIMES[norm] || '';
}

export function formatServingTime(mealType) {
  const time = getMealServingTime(mealType);
  return time ? `Serving: ${time}` : '';
}
