import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

type TokenState = { status: 'loading' } | { status: 'ready'; token: string } | { status: 'error'; message: string };

async function registerForPushNotifications(): Promise<TokenState> {
  if (!Device.isDevice) {
    return { status: 'error', message: 'Push notifications require a physical device (or a properly configured simulator).' };
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== 'granted') {
    return { status: 'error', message: 'Notification permission was not granted.' };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return { status: 'ready', token: tokenResponse.data };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export default function App() {
  const [tokenState, setTokenState] = useState<TokenState>({ status: 'loading' });

  useEffect(() => {
    registerForPushNotifications().then(setTokenState);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Prophet</Text>
        <Text style={styles.subtitle}>
          Aggregates the top Fomo traders' buys, sells, and theses into a coin-promise score, and
          pushes a notification here when one crosses the threshold.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Your Expo push token</Text>
          {tokenState.status === 'loading' && <Text style={styles.mono}>Requesting permission…</Text>}
          {tokenState.status === 'error' && (
            <Text style={[styles.mono, styles.error]}>{tokenState.message}</Text>
          )}
          {tokenState.status === 'ready' && (
            <Text selectable style={styles.mono}>
              {tokenState.token}
            </Text>
          )}
          <Text style={styles.cardHint}>
            Long-press to copy, then save it as the `EXPO_PUSH_TOKEN` secret in the prophet GitHub
            repo (Settings → Secrets and variables → Actions). The scheduled poller uses it to
            send you notifications.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0B0A',
  },
  content: {
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 15,
    color: '#B8B4AE',
    lineHeight: 21,
  },
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1A1817',
    gap: 8,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C5CFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#FFFFFF',
  },
  error: {
    color: '#FF6B6B',
  },
  cardHint: {
    fontSize: 12,
    color: '#8A8580',
    lineHeight: 17,
  },
});
