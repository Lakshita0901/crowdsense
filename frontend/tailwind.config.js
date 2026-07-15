/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      colors: {
        // Google Maps blue palette
        'gmaps-blue': '#1A73E8',
        'gmaps-blue-dark': '#1557B0',
        'gmaps-blue-light': '#E8F0FE',

        // Light surface grays (replaces navy)
        surface: {
          50:  '#FFFFFF',
          100: '#F8F9FA',
          200: '#F1F3F4',
          300: '#E8EAED',
          400: '#DADCE0',
          500: '#BDC1C6',
        },

        // Google text grays
        'g-text':   '#202124',
        'g-text-2': '#5F6368',
        'g-muted':  '#9AA0A6',

        // Keep navy for any legacy references (maps to transparent now)
        navy: {
          950: '#F8F9FA',
          900: '#F1F3F4',
          800: '#E8EAED',
          700: '#DADCE0',
          600: '#BDC1C6',
          500: '#9AA0A6',
        },

        // Status colors — unchanged, carry semantic meaning
        teal: {
          400: '#34A853',
          500: '#1E8E3E',
          glow: '#1A73E8',
        },
      },
      boxShadow: {
        // Google Maps card shadow — very subtle
        'card':       '0 1px 3px rgba(60,64,67,0.15), 0 1px 2px rgba(60,64,67,0.10)',
        'card-hover': '0 4px 8px rgba(60,64,67,0.20), 0 2px 4px rgba(60,64,67,0.10)',
        'card-lg':    '0 8px 24px rgba(60,64,67,0.15), 0 2px 6px rgba(60,64,67,0.10)',
        // Keep old names to avoid breaking any usages
        'glass':      '0 1px 3px rgba(60,64,67,0.15), 0 1px 2px rgba(60,64,67,0.10)',
        'teal-glow':  '0 2px 8px rgba(26,115,232,0.20)',
        'teal-glow-lg':'0 4px 16px rgba(26,115,232,0.25)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up':   'slideUp 0.3s ease-out',
        'fade-in':    'fadeIn 0.4s ease-out',
        'spin-slow':  'spin 8s linear infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%':   { transform: 'translateY(10px)', opacity: 0 },
          '100%': { transform: 'translateY(0)',     opacity: 1 },
        },
        fadeIn: {
          '0%':   { opacity: 0 },
          '100%': { opacity: 1 },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(26,115,232,0.2)' },
          '50%':      { boxShadow: '0 0 20px rgba(26,115,232,0.4)' },
        },
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
}
