import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'corpsol.accessToken';
const REFRESH_TOKEN_KEY = 'corpsol.refreshToken';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function saveTokens(tokens: TokenPair): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}

export async function loadTokens(): Promise<TokenPair | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY).catch(() => null),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY).catch(() => null),
  ]);
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => undefined),
  ]);
}
