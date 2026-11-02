import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_API_PORT = 5000;
const configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '::1' || normalized === '127.0.0.1';
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function getExpoLanHostname(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;

  try {
    const candidate = hostUri.includes('://') ? hostUri : `http://${hostUri}`;
    const hostname = new URL(candidate).hostname.replace(/^\[|\]$/g, '');
    return isPrivateIpv4(hostname) ? hostname : null;
  } catch {
    return null;
  }
}

function getConfiguredPort(value: string): number {
  try {
    const port = new URL(value).port;
    return port ? Number(port) : DEFAULT_API_PORT;
  } catch {
    return DEFAULT_API_PORT;
  }
}

function resolveApiBaseUrl(): string {
  const configured = configuredBaseUrl ? normalizeUrl(configuredBaseUrl) : null;

  if (Platform.OS === 'web') {
    return configured ?? `http://localhost:${DEFAULT_API_PORT}`;
  }

  if (configured) {
    try {
      const parsed = new URL(configured);
      if (!isLoopbackHostname(parsed.hostname)) return configured;

      // On a real phone, localhost points back to the phone. During Expo LAN
      // development, use the same private host that serves the JavaScript bundle.
      if (__DEV__) {
        const lanHostname = getExpoLanHostname();
        if (lanHostname) return `${parsed.protocol}//${lanHostname}:${getConfiguredPort(configured)}`;
        if (Platform.OS === 'android') {
          return `${parsed.protocol}//10.0.2.2:${getConfiguredPort(configured)}`;
        }
      }
    } catch {
      // Preserve the configured string so the request layer can report a clear
      // connection error instead of crashing app startup.
    }

    return configured;
  }

  if (__DEV__) {
    const lanHostname = getExpoLanHostname();
    if (lanHostname) return `http://${lanHostname}:${DEFAULT_API_PORT}`;
    if (Platform.OS === 'android') return `http://10.0.2.2:${DEFAULT_API_PORT}`;
  }

  return `http://localhost:${DEFAULT_API_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

export function apiUrl(path: string): string {
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
}
