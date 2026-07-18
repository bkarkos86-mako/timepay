import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle light/dark theme">
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
