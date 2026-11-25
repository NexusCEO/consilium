export const EVENT_TYPES = {
  reunion: { label: 'Réunion', color: '#1a73e8' },
  rdv: { label: 'Rendez-vous', color: '#0b8043' },
  activite: { label: 'Activité', color: '#e8710a' },
  autre: { label: 'Autre', color: '#7b1fa2' },
};

export const REPEAT_OPTIONS = {
  none: 'Ne se répète pas',
  daily: 'Tous les jours',
  weekly: 'Toutes les semaines',
  monthly: 'Tous les mois',
  yearly: 'Tous les ans',
};

/** Rappel en minutes avant le début ('' = aucun). */
export const REMINDER_OPTIONS = [
  ['', 'Aucun rappel'],
  ['0', 'À l’heure de début'],
  ['5', '5 minutes avant'],
  ['15', '15 minutes avant'],
  ['30', '30 minutes avant'],
  ['60', '1 heure avant'],
  ['120', '2 heures avant'],
  ['1440', '1 jour avant'],
];
export const DEFAULT_REMINDER = '15';

/** Rappel d'échéance d'objectif, en minutes avant le jour J à 9 h ('' = aucun). */
export const GOAL_REMINDER_OPTIONS = [
  ['', 'Aucun rappel'],
  ['0', 'Le jour de l’échéance'],
  ['1440', 'La veille'],
  ['4320', '3 jours avant'],
  ['10080', '1 semaine avant'],
  ['43200', '1 mois avant (30 jours)'],
];
export const DEFAULT_GOAL_REMINDER = '1440';

export const GOAL_CATEGORIES = {
  spirituel: { label: 'Spirituel', color: '#6a4c93' },
  professionnel: { label: 'Professionnel', color: '#1f3a5f' },
  intellectuel: { label: 'Intellectuel', color: '#00838f' },
  financier: { label: 'Financier', color: '#2e7d32' },
  sante: { label: 'Santé & bien-être', color: '#c62828' },
  famille: { label: 'Famille & relations', color: '#c2185b' },
  personnel: { label: 'Personnel', color: '#ef6c00' },
};
