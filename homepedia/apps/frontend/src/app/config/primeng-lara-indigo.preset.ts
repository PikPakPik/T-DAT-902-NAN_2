import { definePreset } from '@primeuix/themes';
import Lara from '@primeuix/themes/lara';

/** Lara + primary color from the built-in indigo scale. */
export const laraIndigoPreset = definePreset(Lara, {
  semantic: {
    primary: {
      50: '{indigo.50}',
      100: '{indigo.100}',
      200: '{indigo.200}',
      300: '{indigo.300}',
      400: '{indigo.400}',
      500: '{indigo.500}',
      600: '{indigo.600}',
      700: '{indigo.700}',
      800: '{indigo.800}',
      900: '{indigo.900}',
      950: '{indigo.950}',
    },
    dark: {
      primary: {
        50: '{indigo.950}',
        100: '{indigo.900}',
        200: '{indigo.800}',
        300: '{indigo.700}',
        400: '{indigo.600}',
      },
    },
  },
});
