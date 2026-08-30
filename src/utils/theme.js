const THEME_STORAGE_KEY = 'atmos-theme';

export function getPreferredTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    theme === 'light' ? '#dbeeff' : '#081a35',
  );
}

export function persistTheme(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}
