import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#020617',
        surface: '#0f172a',
        'surface-2': '#1e293b',
        border: '#334155',
        primary: '#10b981',
        'primary-light': '#34d399',
        danger: '#dc2626',
        warning: '#f59e0b',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
