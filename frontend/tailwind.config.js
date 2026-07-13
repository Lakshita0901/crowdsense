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
        navy: {
          950: '#04070f',
          900: '#080e1a',
          800: '#0d1626',
          700: '#121f35',
          600: '#1a2d4a',
          500: '#22385e',
        },
        teal: {
          400: '#2dd4bf',
          500: '#14b8a6',
          glow: '#00f5e4',
        },
        amber: {
          warn: '#f59e0b',
        },
        red: {
          danger: '#ef4444',
          glow: '#ff3d3d',
        },
      },
      backgroundImage: {
        'grid-pattern': "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%2322385e' fill-opacity='0.25' fill-rule='evenodd'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/svg%3E\")",
      },
      boxShadow: {
        'teal-glow': '0 0 20px rgba(0, 245, 228, 0.25)',
        'teal-glow-lg': '0 0 40px rgba(0, 245, 228, 0.35)',
        'glass': '0 8px 32px 0 rgba(0,0,0,0.37)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
        'spin-slow': 'spin 8s linear infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0,245,228,0.3)' },
          '50%': { boxShadow: '0 0 25px rgba(0,245,228,0.6)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
