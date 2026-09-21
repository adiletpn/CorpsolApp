import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'corpsol.deviceId';

export interface DeviceDescriptor {
  deviceId: string;
  platform: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
}

/**
 * Идентификатор должен переживать переустановку приложения — иначе сотрудник
 * снесёт приложение и получит «новое устройство» в обход привязки.
 *
 * iOS: identifierForVendor + Keychain, который не чистится при удалении приложения.
 * Android: ANDROID_ID, стабильный до сброса к заводским настройкам.
 * Обе ветки хешируются, чтобы наружу не уходил сырой системный идентификатор.
 */
async function deriveHardwareId(): Promise<string | null> {
  try {
    if (Platform.OS === 'ios') {
      return await Application.getIosIdForVendorAsync();
    }
    return Application.getAndroidId();
  } catch {
    return null;
  }
}

export async function getDeviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null);
  if (stored) return stored;

  const hardwareId = await deriveHardwareId();
  const seed = hardwareId ?? Crypto.randomUUID();

  const deviceId = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `corpsol.v1.${seed}`,
  );

  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  }).catch(() => undefined);

  return deviceId;
}

export async function getDeviceDescriptor(): Promise<DeviceDescriptor> {
  return {
    deviceId: await getDeviceId(),
    platform: Platform.OS,
    model: Device.modelName ?? undefined,
    osVersion: Device.osVersion ?? undefined,
    appVersion: Application.nativeApplicationVersion ?? undefined,
  };
}
