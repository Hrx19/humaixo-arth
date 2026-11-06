import type { ConfigContext, ExpoConfig } from 'expo/config';

const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';
const GOOGLE_SIGN_IN_PLUGIN = '@react-native-google-signin/google-signin';
const DATE_TIME_PICKER_PLUGIN = '@react-native-community/datetimepicker';

type ExpoPlugin = NonNullable<ExpoConfig['plugins']>[number];

function getPluginName(plugin: ExpoPlugin): string {
  return typeof plugin === 'string' ? plugin : plugin[0] ?? '';
}

function getGoogleIosUrlScheme(): string | null {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (!iosClientId?.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) return null;

  const clientIdentifier = iosClientId.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length);
  return clientIdentifier ? `com.googleusercontent.apps.${clientIdentifier}` : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? '';
  const iosUrlScheme = getGoogleIosUrlScheme();
  const plugins = (config.plugins ?? []).filter(
    (plugin) => getPluginName(plugin) !== GOOGLE_SIGN_IN_PLUGIN,
  );

  if (!plugins.some((plugin) => getPluginName(plugin) === DATE_TIME_PICKER_PLUGIN)) {
    plugins.push(DATE_TIME_PICKER_PLUGIN);
  }

  plugins.push(
    iosUrlScheme
      ? [GOOGLE_SIGN_IN_PLUGIN, { iosUrlScheme }]
      : GOOGLE_SIGN_IN_PLUGIN,
  );

  const existingGoogleSignInExtra = config.extra?.googleSignIn;

  return {
    ...config,
    name: config.name ?? 'HumaixoArth',
    slug: config.slug ?? 'humaixoarth',
    version: config.version ?? '1.0.0',
    plugins,
    extra: {
      ...config.extra,
      googleSignIn: {
        ...(isRecord(existingGoogleSignInExtra) ? existingGoogleSignInExtra : {}),
        webClientId: googleWebClientId,
      },
    },
  };
};
