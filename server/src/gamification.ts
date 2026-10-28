export const XP_PER_CHECKIN = 10;
export const XP_PER_ACHIEVEMENT = 50;

// Уровень n начинается с 50·(n-1)² XP: 0, 50, 200, 450, 800, ...
export const xpForLevel = (level: number) => 50 * (level - 1) ** 2;
export const levelForXp = (xp: number) => Math.floor(Math.sqrt(xp / 50)) + 1;

export const LEVEL_TITLES = ['Новичок', 'Ученик', 'Практик', 'Мастер', 'Эксперт', 'Легенда'];
export const levelTitle = (level: number) => LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1];

export interface UserStats {
  totalCheckins: number;
  maxStreak: number;
  habitCount: number;
  perfectDay: boolean;
  level: number;
}

export interface AchievementDef {
  code: string;
  emoji: string;
  title: string;
  description: string;
  test: (s: UserStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'first_checkin', emoji: '🌱', title: 'Первый шаг', description: 'Отметь первую привычку', test: (s) => s.totalCheckins >= 1 },
  { code: 'checkins_10', emoji: '🔟', title: 'Десятка', description: '10 отметок', test: (s) => s.totalCheckins >= 10 },
  { code: 'checkins_50', emoji: '💪', title: 'Набираю ход', description: '50 отметок', test: (s) => s.totalCheckins >= 50 },
  { code: 'checkins_100', emoji: '💯', title: 'Сотня', description: '100 отметок', test: (s) => s.totalCheckins >= 100 },
  { code: 'checkins_500', emoji: '🏛️', title: 'Железная воля', description: '500 отметок', test: (s) => s.totalCheckins >= 500 },
  { code: 'streak_3', emoji: '🔥', title: 'Разгон', description: 'Серия 3 подряд', test: (s) => s.maxStreak >= 3 },
  { code: 'streak_7', emoji: '⚡', title: 'Неделя силы', description: 'Серия 7 подряд', test: (s) => s.maxStreak >= 7 },
  { code: 'streak_30', emoji: '🚀', title: 'Месяц без пропусков', description: 'Серия 30 подряд', test: (s) => s.maxStreak >= 30 },
  { code: 'streak_100', emoji: '👑', title: 'Король постоянства', description: 'Серия 100 подряд', test: (s) => s.maxStreak >= 100 },
  { code: 'habits_3', emoji: '🎯', title: 'Коллекционер', description: 'Заведи 3 привычки', test: (s) => s.habitCount >= 3 },
  { code: 'perfect_day', emoji: '🌟', title: 'Идеальный день', description: 'Выполни все привычки дня (от двух)', test: (s) => s.perfectDay },
  { code: 'level_5', emoji: '🏆', title: 'Пятый уровень', description: 'Достигни 5 уровня', test: (s) => s.level >= 5 },
];

export const totalXp = (checkins: number, achievements: number) =>
  checkins * XP_PER_CHECKIN + achievements * XP_PER_ACHIEVEMENT;
