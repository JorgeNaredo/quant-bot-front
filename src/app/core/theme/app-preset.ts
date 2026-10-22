import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

export const AlgotradePreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: '0',
      xs: '2px',
      sm: '4px',
      md: '6px',
      lg: '10px',
      xl: '14px',
    },
  },
  semantic: {
    primary: {
      50: '#eff5ff',
      100: '#dbe8ff',
      200: '#bfd6ff',
      300: '#94bbff',
      400: '#6ba4ff',
      500: '#4c8dff',
      600: '#3b7df5',
      700: '#2f68d6',
      800: '#2855ac',
      900: '#24478a',
      950: '#16264a',
    },
    colorScheme: {
      dark: {
        surface: {
          0: '#ffffff',
          50: '#e8edf5',
          100: '#cbd4e2',
          200: '#a7b3c6',
          300: '#8291a8',
          400: '#94a3b8',
          500: '#64748b',
          600: '#334155',
          700: '#263145',
          800: '#182033',
          900: '#111827',
          950: '#0b0f17',
        },
        primary: {
          color: '{primary.500}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.400}',
          activeColor: '{primary.600}',
        },
        highlight: {
          background: 'color-mix(in srgb, {primary.500}, transparent 82%)',
          focusBackground: 'color-mix(in srgb, {primary.500}, transparent 72%)',
          color: '#e8edf5',
          focusColor: '#ffffff',
        },
        text: {
          color: '#e8edf5',
          hoverColor: '#ffffff',
          mutedColor: '#94a3b8',
          hoverMutedColor: '#cbd5e1',
        },
      },
    },
  },
});
