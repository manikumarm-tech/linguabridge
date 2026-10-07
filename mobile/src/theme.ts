import { Platform, useColorScheme } from 'react-native';

// on web, screens are see-through so the colourful backdrop shows; the app sits on a frosted panel
const web = Platform.OS === 'web';

const light = {
  bg: '#F6F7FB', card: '#FFFFFF', text: '#14161F', sub: '#6B7183', border: '#E4E7F0',
  primary: '#4F46E5', onPrimary: '#FFFFFF', mine: '#E8E7FF', theirs: '#FFFFFF',
  warn: '#B45309', warnBg: '#FEF3C7', chip: '#EEF0FA',
  screen: web ? 'transparent' : '#F6F7FB', glass: 'rgba(246,247,251,0.84)',
};
export type Theme = typeof light;
const dark: Theme = {
  bg: '#0E1016', card: '#181B25', text: '#F2F3F8', sub: '#9AA0B4', border: '#262A38',
  primary: '#8B87FF', onPrimary: '#0E1016', mine: '#2A2860', theirs: '#1E212D',
  warn: '#FBBF24', warnBg: '#3A2E10', chip: '#232738',
  screen: web ? 'transparent' : '#0E1016', glass: 'rgba(14,16,22,0.72)',
};

export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);
export const radius = { sm: 8, md: 14, lg: 20 };
