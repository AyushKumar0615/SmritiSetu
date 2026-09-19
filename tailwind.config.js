/** @type {import('tailwindcss').Config} */

// The CSS custom properties in src/styles.css are the single source of truth
// for the palette — they're what repaints when the user switches to the light
// theme or turns on high-contrast mode. These tokens point at those variables
// rather than duplicating their hex values, so `text-ink-faint` stays correct
// in every theme. (Duplicated hexes here previously froze utilities to the
// dark theme, which is why components reached for inline
// `style={{ color: 'var(--ink-faint)' }}` instead of using them.)
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace']
      },
      colors: {
        canvas: {
          DEFAULT: 'var(--canvas)',
          raised: 'var(--canvas-raised)',
          recessed: 'var(--canvas-recessed)'
        },
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-soft)',
          faint: 'var(--ink-faint)'
        },
        paper: {
          DEFAULT: 'var(--paper)',
          ink: 'var(--paper-ink)',
          line: 'var(--paper-line)'
        },
        ember: {
          DEFAULT: 'var(--ember)',
          deep: 'var(--ember-deep)',
          soft: 'var(--ember-soft)'
        },
        jade: {
          DEFAULT: 'var(--jade)',
          deep: 'var(--jade-deep)',
          soft: 'var(--jade-soft)'
        },
        alert: {
          DEFAULT: 'var(--alert)',
          soft: 'var(--alert-soft)'
        },
        // Admin-dashboard-only secondary accents (caregiver / connections
        // stat cards). Named to match Tailwind's own palette, but these
        // resolve to our theme tokens — never reach for e.g. `sky-500`.
        sky: {
          DEFAULT: 'var(--sky)',
          deep: 'var(--sky-deep)',
          soft: 'var(--sky-soft)'
        },
        violet: {
          DEFAULT: 'var(--violet)',
          deep: 'var(--violet-deep)',
          soft: 'var(--violet-soft)'
        },
        hairline: {
          DEFAULT: 'var(--hairline)',
          strong: 'var(--hairline-strong)'
        },
        // Fixed tone for captions sitting on the always-dark photo scrims in
        // Memory Journal — deliberately theme-independent.
        'on-photo': {
          DEFAULT: 'var(--on-photo)',
          soft: 'var(--on-photo-soft)',
          faint: 'var(--on-photo-faint)'
        }
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)'
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        ember: 'var(--shadow-ember)',
        jade: 'var(--shadow-jade)'
      },
      transitionTimingFunction: {
        ease: 'var(--ease)',
        spring: 'var(--ease-spring)'
      },
      transitionDuration: {
        fast: '140ms',
        base: '260ms',
        slow: '520ms'
      }
    }
  },
  plugins: []
};
