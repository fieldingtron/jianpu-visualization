/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'accent-primary': 'var(--accent-primary)',
        'text-main': 'var(--text-main)',
        'text-muted': 'var(--text-muted)',
        'glass-border': 'var(--glass-border)',
      }
    },
  },
  plugins: [],
}

