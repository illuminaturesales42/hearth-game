import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.mastermind.hearth',
  appName: 'Hearth',
  webDir: 'dist',
  backgroundColor: '#1c0f08',
  ios: {
    contentInset: 'never',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
