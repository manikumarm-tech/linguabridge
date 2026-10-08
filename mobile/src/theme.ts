import { Platform, useColorScheme } from 'react-native';

// on web, screens are see-through so the colourful backdrop shows; the app sits on a frosted panel
const web = Platform.OS === 'web';

const light = {
  bg: '#F5F5FA', card: '#FFFFFF', text: '#151622', sub: '#6B6F85', border: '#E6E6F0',
  primary: '#7C3AED', onPrimary: '#FFFFFF', accent: '#DB2777',
  // my bubbles: violet gradient on web, solid violet on native; always white text
  mine: '#6D28D9', onMine: '#FFFFFF', onMineSub: 'rgba(255,255,255,0.78)', theirs: '#FFFFFF',
  warn: '#B45309', warnBg: '#FEF3C7', chip: '#F0EEFB', success: '#16A34A',
  screen: web ? 'transparent' : '#F5F5FA', glass: 'rgba(245,245,250,0.86)',
};
export type Theme = typeof light;
const dark: Theme = {
  bg: '#0B0D14', card: '#171A26', text: '#F4F4FA', sub: '#9A9DB5', border: '#262A3B',
  primary: '#8B5CF6', onPrimary: '#FFFFFF', accent: '#F472B6',
  mine: '#6D28D9', onMine: '#FFFFFF', onMineSub: 'rgba(255,255,255,0.75)', theirs: web ? 'rgba(30,33,48,0.92)' : '#1E2130',
  warn: '#FBBF24', warnBg: '#3A2E10', chip: '#232639', success: '#22C55E',
  screen: web ? 'transparent' : '#0B0D14', glass: 'rgba(11,13,20,0.74)',
};

export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);
export const radius = { sm: 8, md: 14, lg: 20, xl: 28 };
