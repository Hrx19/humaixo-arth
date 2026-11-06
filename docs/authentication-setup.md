# Humaixo Arth authentication setup

Email/password, Google, and GitHub accounts use the Humaixo Arth API and MongoDB. Google and GitHub client secrets stay on the backend. Existing backend `.env` files using `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ALLOWED_ORIGINS`, and `FRONTEND_URL` are supported; the new map variables are preferred when separate OAuth apps are configured for web and mobile.

## 1. Set up the app and API address

Copy `HumaixoArth/.env.example` to `HumaixoArth/.env` if the file does not exist. Set `EXPO_PUBLIC_API_URL`:

- Web on the same computer: `http://localhost:5000`
- Android emulator: `http://10.0.2.2:5000`
- Physical phone during Expo LAN development: leave the local default; the app derives the backend host from the Expo LAN address.
- Production Android APK: `https://humaixo-arth-api-hrx19.onrender.com`

The phone and computer must share a network for the LAN fallback. Windows Firewall must allow the backend port. Expo tunnel mode does not expose the backend, so use a deployed HTTPS API URL in that case.

For browser sign-in, set `CORS_ORIGINS` in `backend/.env` to the exact app origins, such as `http://localhost:8081` and `https://<your-web-domain>`. Do not put OAuth callback paths in this variable; it accepts origins only.

Never put OAuth client secrets in `HumaixoArth/.env`, app source, or an `EXPO_PUBLIC_*` variable. Those values are bundled into the client.

## 2. Configure Google

In Google Cloud Console, configure the OAuth consent screen and test users, then create these OAuth clients in the same Google Cloud project:

### Web client

Create a **Web application** client. Add JavaScript origins for your local and production web app. Add these exact authorized redirect URIs:

- Local Expo Web: `http://localhost:8081/oauth/google`
- Production web: `https://<your-web-domain>/oauth/google`

Set its client ID in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Put its client secret only in `backend/.env` under `GOOGLE_OAUTH_CLIENTS_JSON`. Legacy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` values are automatically mapped for a single-client setup. The Android app passes this exact Web client ID to `GoogleSignin.configure`; never substitute the Android client ID here.

### Android client

Create an **Android** client using package name `com.humaixo.arth`. Add the SHA-1 fingerprint for every certificate that can sign the app: EAS development, EAS production, and Google Play App Signing (when used). The Android client is configured in Google Cloud and does not belong in an Expo frontend environment variable. The native SDK uses the Web client ID to request the ID token verified by the backend.

### iOS client

Create an **iOS** client using bundle ID `com.humaixo.arth`. Set it in `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. `HumaixoArth/app.config.ts` derives the iOS URL scheme from this value and registers the Google Sign-In config plugin.

On Android and iOS, the app uses the native Google Sign-In SDK to obtain an ID token whose audience is the Web client ID. The API verifies the signed token, issuer, audience, expiry, and verified email before creating or linking the account. The Android/iOS client IDs identify their installed apps; the Web ID is the server audience.

## 3. Configure GitHub

Register the HTTPS API callback below with the GitHub OAuth App. GitHub redirects to the API first; the API relays only the OAuth code, state, or provider error to the app's fixed deep link so that Expo can complete the PKCE exchange.

- Android APK callback: `https://humaixo-arth-api-hrx19.onrender.com/api/auth/callback/github`
- Local Expo Web callback: `http://localhost:8081/oauth/github`
- Production web callback: `https://<your-web-domain>/oauth/github`

Set the GitHub client ID in `EXPO_PUBLIC_GITHUB_NATIVE_CLIENT_ID`. Set `EXPO_PUBLIC_GITHUB_NATIVE_REDIRECT_URI=https://humaixo-arth-api-hrx19.onrender.com/api/auth/callback/github`; do not set it to `humaixoarth://oauth/github`. Put that client ID and secret in `GITHUB_OAUTH_CLIENTS_JSON` in `backend/.env`. If web OAuth uses a different callback, use a separate GitHub OAuth App and put its ID/secret in the corresponding web variables/map entry. The native flow uses Authorization Code + PKCE and the secret remains only on the API server.

GitHub account creation requires a primary, verified email. Humaixo requests only `read:user` and `user:email`.

## 4. Put the secrets on the backend

Edit `backend/.env`. The maps are single-line JSON objects. The Google map key must include the Google Web client ID because native ID tokens use it as their audience. GitHub maps each OAuth app ID to that app's secret.

```dotenv
GOOGLE_OAUTH_CLIENTS_JSON={"<google-web-client-id>":"<google-web-client-secret>"}
GITHUB_OAUTH_CLIENTS_JSON={"<github-native-client-id>":"<github-native-client-secret>","<github-web-client-id>":"<github-web-client-secret>"}
GITHUB_OAUTH_CALLBACK_URL=https://humaixo-arth-api-hrx19.onrender.com/api/auth/callback/github
GITHUB_MOBILE_REDIRECT_URI=humaixoarth://oauth/github
OAUTH_ALLOWED_REDIRECT_URIS=https://humaixo-arth-api-hrx19.onrender.com/api/auth/callback/github,http://localhost:8081/oauth/google,http://localhost:8081/oauth/github,https://<your-web-domain>/oauth/google,https://<your-web-domain>/oauth/github
```

`GITHUB_OAUTH_CALLBACK_URL` and `EXPO_PUBLIC_GITHUB_NATIVE_REDIRECT_URI` must be identical. `OAUTH_ALLOWED_REDIRECT_URIS` must contain exact values with no wildcards. Google native ID-token sign-in does not use an OAuth redirect URI.

## 5. Enable and rebuild

After setting client IDs in `HumaixoArth/.env` and secrets/redirect allowlists in `backend/.env`:

1. Restart the API so it loads the OAuth secrets.
2. Restart Expo with `npx expo start --clear` so it picks up public client IDs.
3. Email/password sign-in works in Expo Go. Native Google and GitHub redirects require an installed development build; Expo Go cannot load the Google native module or register this app's custom callback scheme. Rebuild Android/iOS after changing OAuth IDs, signing credentials, or app configuration.
4. Test `GET /health`, email signup with a new address, login, then provider sign-in.

Check the backend log for a specific OAuth configuration error if a provider remains disabled or a callback is rejected. Never send or commit the client secret values.
