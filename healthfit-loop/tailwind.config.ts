import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // FYTR Brand Colors
        fytr: {
          blue: '#4338CA',      // Deep Blue
          red: '#DC2626',       // Accent Red
          black: '#000000',
          'near-black': '#0A0A0B',
          'dark-gray': '#18181B',
          'medium-gray': '#52525B',
          'light-gray': '#A1A1AA',
          'pale-gray': '#F4F4F5',
          'off-white': '#FAFAFA',
          white: '#FFFFFF',
        },
        // Semantic colors for the app
        primary: {
          DEFAULT: '#4338CA',
          dark: '#3730A3',
          light: '#6366F1',
        },
        accent: {
          DEFAULT: '#DC2626',
          dark: '#B91C1C',
          light: '#EF4444',
          purple: '#7C3AED', // For accent-purple used in UI components
          red: '#DC2626',
          blue: '#2563EB',
          green: '#059669',
          pink: '#EC4899',
        },
        // Additional semantic colors for UI components
        neutral: {
          50: '#FAFAFA',
          100: '#F4F4F5',
          200: '#E4E4E7',
          300: '#D4D4D8',
          400: '#A1A1AA',
          500: '#71717A',
          600: '#52525B',
          700: '#3F3F46',
          800: '#27272A',
          900: '#18181B',
        },
      },
      backgroundImage: {
        'fytr-gradient': 'linear-gradient(135deg, #4338CA 0%, #DC2626 100%)',
        'fytr-gradient-reverse': 'linear-gradient(135deg, #DC2626 0%, #4338CA 100%)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'subtle': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'medium': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'large': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      },
      animation: {
        'in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;