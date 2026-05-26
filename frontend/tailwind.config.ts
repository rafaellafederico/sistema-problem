import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#111111',
        'surface-2': '#161616',
        'surface-3': '#1a1a1a',
        border: '#1e1e1e',
        'border-2': '#252525',
        accent: '#f5e6d0',
        'accent-dim': '#c9b99a',
        'text-primary': '#ffffff',
        'text-secondary': '#888888',
        'text-tertiary': '#555555',
        critical: '#ef4444',
        'critical-dim': '#7f1d1d',
        'critical-bg': '#1c0a0a',
        high: '#f97316',
        'high-dim': '#7c2d12',
        'high-bg': '#1c0e06',
        medium: '#eab308',
        'medium-dim': '#713f12',
        'medium-bg': '#1a1400',
        low: '#22c55e',
        'low-dim': '#14532d',
        'low-bg': '#071510',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-accent': 'linear-gradient(135deg, #f5e6d0, #c9b99a)',
      },
    },
  },
  plugins: [],
}

export default config
