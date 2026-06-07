/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-main': 'var(--bg-main)',
        'accent': 'var(--accent)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'border-soft': 'var(--border-soft)',
        zinc: {
          850: '#1a1a1a',
        },
        surface: {
          DEFAULT: '#353531',
          90: '#2E2E2A',
          80: '#282824',
          70: '#1E1E1B',
        },
        accent: {
          DEFAULT: '#1FD17A',
          muted: '#0FA86A',
          dim: 'rgba(31,209,122,0.12)',
        },
      },
      backdropBlur: { 'xs': '4px' },
      borderRadius: {
        'card': 'var(--card-radius)',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}