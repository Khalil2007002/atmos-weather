import { APP_CONFIG } from '../config.js';

export function formatTemperature(value) {
  return `${Math.round(value)}°`;
}

export function formatLocalTime(timezone) {
  return new Intl.DateTimeFormat(APP_CONFIG.locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date());
}

export function formatLocalDate(timezone) {
  return new Intl.DateTimeFormat(APP_CONFIG.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(new Date());
}

export function formatUpdateTime(timezone) {
  return new Intl.DateTimeFormat(APP_CONFIG.locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date());
}

export function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
