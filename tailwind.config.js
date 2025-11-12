/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        skin: {
          fill: 'var(--color-fill)',
          'fill-secondary': 'var(--color-fill-secondary)',
          'fill-modal': 'var(--color-fill-modal)',
          'input-bg': 'var(--color-input-bg)',
          base: 'var(--color-text-base)',
          muted: 'var(--color-text-muted)',
          accent: 'rgb(var(--color-accent) / <alpha-value>)',
          'accent-secondary': 'var(--color-accent-secondary)',
          'accent-text': 'var(--color-accent-text)',
          border: 'var(--color-border)',
          'border-accent': 'var(--color-border-accent)',
        }
      },
      boxShadow: {
        'accent': 'var(--shadow-accent)',
        'accent-lg': 'var(--shadow-accent-lg)',
      }
    },
  },
  plugins: [],
}