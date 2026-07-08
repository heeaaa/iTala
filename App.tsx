import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MiniWordmark } from './src/components/ui';
import {
  useFonts,
  Oswald_600SemiBold, Oswald_700Bold,
} from '@expo-google-fonts/oswald';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';

import { StoreProvider } from './src/store/StoreProvider';
import { AdminProvider } from './src/store/AdminProvider';
import { colors, font } from './src/theme';
import { RootStackParams } from './src/navigation';

import LeaguesScreen from './src/screens/LeaguesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import CreateLeagueScreen from './src/screens/CreateLeagueScreen';
import RecGameScreen from './src/screens/RecGameScreen';
import LeagueDetailScreen from './src/screens/LeagueDetailScreen';
import GamesOnDateScreen from './src/screens/GamesOnDateScreen';
import ManageRosterScreen from './src/screens/ManageRosterScreen';
import EditTeamScreen from './src/screens/EditTeamScreen';
import TeamProfileScreen from './src/screens/TeamProfileScreen';
import NewGameScreen from './src/screens/NewGameScreen';
import SelectLineupScreen from './src/screens/SelectLineupScreen';
import LiveGameScreen from './src/screens/LiveGameScreen';
import BoxScoreScreen from './src/screens/BoxScoreScreen';
import FinalScoreScreen from './src/screens/FinalScoreScreen';
import SeasonRecapScreen from './src/screens/SeasonRecapScreen';
import ShareCardScreen from './src/screens/ShareCardScreen';
import ManagePromosScreen from './src/screens/ManagePromosScreen';
import PlayerProfileScreen from './src/screens/PlayerProfileScreen';

const Stack = createNativeStackNavigator<RootStackParams>();

// Screens with no natural title show the brand mark instead of dead space.
const brandHeader = { headerTitle: () => <MiniWordmark size={20} /> };

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.line,
    primary: colors.accent,
    notification: colors.accent,
  },
};

export default function App() {
  const [loaded, error] = useFonts({
    Oswald_600SemiBold, Oswald_700Bold,
    DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
  });

  // Don't block the app forever on font loading. If fonts are slow or fail
  // (e.g. first Expo Go launch on a flaky network), proceed after a short
  // timeout using system fonts so the app always opens.
  const [timedOut, setTimedOut] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const ready = loaded || !!error || timedOut;

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <AdminProvider>
            <StatusBar style="light" />
            <NavigationContainer theme={navTheme}>
              <Stack.Navigator
                screenOptions={{
                  headerStyle: { backgroundColor: colors.bg },
                  headerTintColor: colors.text,
                  headerTitleStyle: { fontFamily: font.displaySemi },
                  headerShadowVisible: false,
                  contentStyle: { backgroundColor: colors.bg },
                }}>
                <Stack.Screen name="Leagues" component={LeaguesScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
                <Stack.Screen name="CreateLeague" component={CreateLeagueScreen} options={brandHeader} />
                <Stack.Screen name="RecGame" component={RecGameScreen} options={brandHeader} />
                <Stack.Screen name="LeagueDetail" component={LeagueDetailScreen} options={brandHeader} />
                <Stack.Screen name="GamesOnDate" component={GamesOnDateScreen} options={brandHeader} />
                <Stack.Screen name="ManageRoster" component={ManageRosterScreen} options={{ title: 'Roster' }} />
                <Stack.Screen name="TeamProfile" component={TeamProfileScreen} options={brandHeader} />
          <Stack.Screen name="EditTeam" component={EditTeamScreen} options={{ title: 'Edit Team' }} />
                <Stack.Screen name="NewGame" component={NewGameScreen} options={brandHeader} />
                <Stack.Screen name="SelectLineup" component={SelectLineupScreen} options={brandHeader} />
                <Stack.Screen name="LiveGame" component={LiveGameScreen} options={{ ...brandHeader, headerBackVisible: false, gestureEnabled: false }} />
                <Stack.Screen name="BoxScore" component={BoxScoreScreen} options={{ title: 'Box Score' }} />
                <Stack.Screen name="FinalScore" component={FinalScoreScreen} options={{ ...brandHeader, headerBackVisible: false, gestureEnabled: false }} />
                <Stack.Screen name="SeasonRecap" component={SeasonRecapScreen} options={brandHeader} />
                <Stack.Screen name="ShareCard" component={ShareCardScreen} options={{ ...brandHeader, title: 'Share Card' }} />
                <Stack.Screen name="ManagePromos" component={ManagePromosScreen} options={{ ...brandHeader, title: 'Sponsor Promos' }} />
                <Stack.Screen name="PlayerProfile" component={PlayerProfileScreen} options={brandHeader} />
              </Stack.Navigator>
            </NavigationContainer>
          </AdminProvider>
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
