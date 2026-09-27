import { NavigationContainer, DarkTheme, type LinkingOptions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors, space, type } from "./src/theme";
import { UserDataProvider } from "./src/store/userData";
import { SettingsProvider } from "./src/store/settings";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { DetailsScreen } from "./src/screens/DetailsScreen";
import { PlayerScreen } from "./src/screens/PlayerScreen";
import type { RootStackParamList, TabParamList } from "./src/navigation/types";
import { useWarmup } from "./src/hooks/useWarmup";
import { logInfo } from "./src/utils/logger";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.red,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

/* Glyph tab icons: the app ships no icon font, and a text glyph is one less
 * native dependency to keep in sync with the Android build. */
const TAB_GLYPH: Record<keyof TabParamList, string> = {
  Home: "⌂",
  Search: "⌕",
  Library: "☰",
  Settings: "⚙",
};

function TabsNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 18 }}>{TAB_GLYPH[route.name]}</Text>
        ),
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Search" component={SearchScreen} />
      <Tabs.Screen name="Library" component={LibraryScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

export default function App() {
  useWarmup();

  useEffect(() => {
    // Phone-shaped UI everywhere except the player, which unlocks landscape.
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch((error) =>
      logInfo("app", "Portrait lock request was rejected by the OS.", { message: String(error) }),
    );
    logInfo("app", "Streamly Android app mounted.");
  }, []);

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <UserDataProvider>
          <StatusBar style="light" backgroundColor="transparent" translucent />
          <View style={styles.root}>
            <NavigationContainer theme={navTheme} linking={LINKING}>
              <Stack.Navigator
                screenOptions={{
                  headerStyle: { backgroundColor: colors.bg },
                  headerTintColor: colors.text,
                  headerTitleStyle: styles.headerTitle,
                  contentStyle: { backgroundColor: colors.bg },
                }}
              >
                <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
                <Stack.Screen name="Details" component={DetailsScreen} options={{ title: "" }} />
                <Stack.Screen
                  name="Player"
                  component={PlayerScreen}
                  options={{ headerShown: false, animation: "fade", orientation: "all" }}
                />
              </Stack.Navigator>
            </NavigationContainer>
          </View>
        </UserDataProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const LINKING: LinkingOptions<RootStackParamList> = {
  prefixes: ["streamly://"],
  config: {
    screens: {
      Tabs: {
        screens: { Home: "", Search: "search", Library: "library" },
      },
      Details: "title/:id",
      Player: "play/:id",
    },
  },
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    height: 58,
    paddingBottom: 6,
    paddingTop: 6,
    gap: space.xs,
  },
  headerTitle: { fontSize: type.body, fontWeight: "700" },
});
