import type { ConfigContext, ExpoConfig } from 'expo/config';

const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

function getGoogleIosUrlScheme(): string | null {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (!iosClientId?.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) return null;

  const clientIdentifier = iosClientId.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length);
  if (!clientIdentifier) return null;

  return `com.googleusercontent.apps.${clientIdentifier}`;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = getGoogleIosUrlScheme();
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const googleSignInPlugin = '@react-native-google-signin/google-signin';
  const plugins = (config.plugins ?? []).filter((plugin) => {
    const pluginName = typeof plugin === 'string' ? plugin : plugin[0];
    return pluginName !== googleSignInPlugin;
  });
  if (!plugins.some((plugin) =>
    (typeof plugin === 'string' ? plugin : plugin[0]) === '@react-native-community/datetimepicker')) {
    plugins.push('@react-native-community/datetimepicker');
  }

  // The native Google module needs this URL handler on iOS. Keeping it tied to
  // the configured public client ID lets web/email development run unconfigured.
  if (iosUrlScheme) {
    plugins.push([
      googleSignInPlugin,
      {
        iosUrlScheme,
        // Kept in the resolved Expo config so the Web client used at runtime
        // is visible alongside the native plugin configuration. Version 17 of
        // this plugin uses iosUrlScheme; Android receives this Web ID through
        // GoogleSignin.configure in the app code.
        webClientId: googleWebClientId,
      },
    ]);
  }

  return {
    ...config,
    name: config.name ?? 'HumaixoArth',
    slug: config.slug ?? 'humaixoarth',
    version: config.version ?? '1.0.0',
    plugins,
    extra: {
      ...config.extra,
      googleSignIn: {
        webClientId: googleWebClientId,
      },
    },
  };
};
