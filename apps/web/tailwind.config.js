/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#111111',
        surface: '#1a1a1a',
        border: '#2a2a2a',
        accent: '#22c55e',
        'accent-dim': '#16a34a',
        'text-primary': '#ffffff',
        'text-muted': '#888888',
      },
    },
  },
  plugins: [],
}

