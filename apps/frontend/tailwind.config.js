/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts}', '../../packages/ui/src/**/*.{css,ts}'],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      boxShadow: {
        card: 'var(--shadow-md)',
        panel: 'var(--shadow-lg)',
      },
      colors: {
        surface: 'var(--bg-surface)',
        ink: {
          DEFAULT: 'var(--text-primary)',
          muted: 'var(--text-secondary)',
          soft: 'var(--text-muted)',
        },
      },
      spacing: {
        18: '4.5rem',
      },
    },
  },
};
