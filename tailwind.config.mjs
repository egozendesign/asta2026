/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./app/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      // Ponte verso il design system in globals.css: così le utility Tailwind
      // (usate per i componenti nuovi / 21st.dev) parlano gli stessi colori.
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        acc: 'var(--acc)',
        tert: 'var(--tert)',
        txt: 'var(--txt)',
        muted: 'var(--muted)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        box: '16px',
      },
    },
  },
  plugins: [],
};

export default config;
