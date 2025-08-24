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
        },
      },
      backgroundImage: {
        'fytr-gradient': 'linear-gradient(135deg, #4338CA 0%, #DC2626 100%)',
        'fytr-gradient-reverse': 'linear-gradient(135deg, #DC2626 0%, #4338CA 100%)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;