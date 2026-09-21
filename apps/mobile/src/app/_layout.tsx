import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { queryClient } from '@/lib/query-client';
import { LocaleProvider } from '@/lib/locale-context';
import { JourneyProvider } from '@/lib/journey-context';

SplashScreen.preventAutoHideAsync();

/**
 * Root layout for the customer app: a guided, single-column journey
 * (station -> service -> need -> queue|book -> confirmation), not a tab
 * bar — avoids presenting "a huge dashboard of options immediately" per
 * the UX brief. Every screen builds its own header (back button + title +
 * progress) inside components/ui/screen-header.tsx, so headerShown is off
 * here — that gives full control over RTL mirroring and translated
 * titles, which a native Stack header's static `options.title` can't do
 * as cleanly across a locale switch.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <JourneyProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeProvider>
        </JourneyProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
