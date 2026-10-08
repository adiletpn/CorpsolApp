import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:package_info_plus/package_info_plus.dart';

class DeviceDescriptor {
  const DeviceDescriptor({
    required this.deviceId,
    required this.platform,
    this.model,
    this.osVersion,
    this.appVersion,
  });

  final String deviceId;
  final String platform;
  final String? model;
  final String? osVersion;
  final String? appVersion;
}

const _deviceIdKey = 'corpsol.deviceId';

/// Keychain на iOS не чистится при удалении приложения, поэтому
/// идентификатор переживает переустановку.
const _storage = FlutterSecureStorage(
  iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);

final _deviceInfo = DeviceInfoPlugin();

/// Системный идентификатор железа.
///
/// iOS: identifierForVendor. Android: ANDROID_ID, стабильный до сброса
/// к заводским настройкам. Обе ветки затем хешируются, чтобы наружу
/// не уходил сырой системный идентификатор.
Future<String?> _deriveHardwareId() async {
  try {
    if (Platform.isIOS) {
      return (await _deviceInfo.iosInfo).identifierForVendor;
    }
    return (await _deviceInfo.androidInfo).id;
  } catch (_) {
    return null;
  }
}

String _randomSeed() {
  final random = Random.secure();
  final bytes = List<int>.generate(32, (_) => random.nextInt(256));
  return base64UrlEncode(bytes);
}

/// Идентификатор должен переживать переустановку приложения — иначе сотрудник
/// снесёт приложение и получит «новое устройство» в обход привязки.
Future<String> getDeviceId() async {
  final stored = await _storage.read(key: _deviceIdKey).catchError((_) => null);
  if (stored != null && stored.isNotEmpty) return stored;

  final hardwareId = await _deriveHardwareId();
  final seed = hardwareId ?? _randomSeed();
  final deviceId = sha256.convert(utf8.encode('corpsol.v1.$seed')).toString();

  try {
    await _storage.write(key: _deviceIdKey, value: deviceId);
  } catch (_) {
    // Запись в хранилище не удалась — идентификатор всё равно вернём,
    // он пересоберётся из того же системного значения при следующем запуске.
  }

  return deviceId;
}

Future<DeviceDescriptor> getDeviceDescriptor() async {
  String? model;
  String? osVersion;

  try {
    if (Platform.isIOS) {
      final info = await _deviceInfo.iosInfo;
      model = info.utsname.machine;
      osVersion = info.systemVersion;
    } else {
      final info = await _deviceInfo.androidInfo;
      model = info.model;
      osVersion = info.version.release;
    }
  } catch (_) {
    // Модель и версия — справочные поля, без них отметка всё равно пройдёт.
  }

  String? appVersion;
  try {
    appVersion = (await PackageInfo.fromPlatform()).version;
  } catch (_) {
    appVersion = null;
  }

  return DeviceDescriptor(
    deviceId: await getDeviceId(),
    platform: Platform.isIOS ? 'ios' : 'android',
    model: model,
    osVersion: osVersion,
    appVersion: appVersion,
  );
}
