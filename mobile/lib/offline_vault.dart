import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

/// Encrypted on-device store for offline data that is too large for the
/// platform keystore (large telegram lists, attachments and queued uploads).
///
/// Every blob is sealed with AES-256-GCM using a random per-device key that
/// lives only in [FlutterSecureStorage] (Android Keystore / iOS Keychain).
/// File names are SHA-256 digests so telegram ids never appear on disk.
/// Deleting the key (logout, account switch) makes every file unreadable even
/// if a deletion fails, so wiping is a crypto-shred rather than best-effort.
class OfflineVault {
  OfflineVault({
    FlutterSecureStorage? storage,
    Future<Directory> Function()? baseDirectory,
  }) : _storage = storage ?? const FlutterSecureStorage(),
       _baseDirectory = baseDirectory ?? getApplicationSupportDirectory;

  /// Starts with `offline_` on purpose: the API offline-cache cleanup deletes
  /// every `offline_*` keystore entry, which also destroys this key.
  static const keyStorageKey = 'offline_vault_key_v1';
  static const maxBlobBytes = 25 * 1024 * 1024;
  static final _algorithm = AesGcm.with256bits();
  static const _aad = <int>[0x70, 0x74, 0x2d, 0x76, 0x31]; // "pt-v1"

  final FlutterSecureStorage _storage;
  final Future<Directory> Function() _baseDirectory;

  /// Shared across instances so concurrent first writes never mint two keys.
  static Future<SecretKey>? _creating;

  // The key is re-read from the keystore on every operation (never cached in
  // memory) so a wipe from any instance takes effect immediately everywhere.
  Future<SecretKey> _key() async {
    final existing = await _readKey();
    if (existing != null) return existing;
    final pending = _creating ??= _createKey();
    try {
      return await pending;
    } finally {
      if (identical(_creating, pending)) _creating = null;
    }
  }

  Future<SecretKey?> _readKey() async {
    final stored = await _storage.read(key: keyStorageKey);
    if (stored == null || stored.isEmpty) return null;
    final bytes = base64Decode(stored);
    return bytes.length == 32 ? SecretKey(bytes) : null;
  }

  Future<SecretKey> _createKey() async {
    final random = Random.secure();
    final bytes = List<int>.generate(32, (_) => random.nextInt(256));
    await _storage.write(key: keyStorageKey, value: base64Encode(bytes));
    return SecretKey(bytes);
  }

  Future<Directory> _directory() async {
    final base = await _baseDirectory();
    final directory = Directory('${base.path}/offline_vault');
    if (!await directory.exists()) await directory.create(recursive: true);
    return directory;
  }

  Future<File> _file(String name) async {
    final digest = await Sha256().hash(utf8.encode(name));
    final hex = digest.bytes
        .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
        .join();
    return File('${(await _directory()).path}/$hex.bin');
  }

  Future<void> write(String name, List<int> bytes) async {
    if (bytes.length > maxBlobBytes) {
      throw const FormatException('حجم البيانات أكبر من المسموح للحفظ المحلي.');
    }
    final box = await _algorithm.encrypt(
      bytes,
      secretKey: await _key(),
      aad: _aad,
    );
    final file = await _file(name);
    // Write then rename so a crash never leaves a half-written blob behind.
    final temporary = File('${file.path}.tmp');
    await temporary.writeAsBytes(box.concatenation(), flush: true);
    await temporary.rename(file.path);
  }

  Future<Uint8List?> read(String name) async {
    try {
      final file = await _file(name);
      if (!await file.exists()) return null;
      final box = SecretBox.fromConcatenation(
        await file.readAsBytes(),
        nonceLength: _algorithm.nonceLength,
        macLength: _algorithm.macAlgorithm.macLength,
      );
      final clear = await _algorithm.decrypt(
        box,
        secretKey: await _key(),
        aad: _aad,
      );
      return Uint8List.fromList(clear);
    } catch (_) {
      // Tampered data or a rotated key: treat as a cache miss and drop it.
      await delete(name);
      return null;
    }
  }

  Future<void> writeJson(String name, Object? value) =>
      write(name, utf8.encode(jsonEncode(value)));

  Future<dynamic> readJson(String name) async {
    final bytes = await read(name);
    if (bytes == null) return null;
    try {
      return jsonDecode(utf8.decode(bytes));
    } catch (_) {
      return null;
    }
  }

  Future<void> delete(String name) async {
    try {
      final file = await _file(name);
      if (await file.exists()) await file.delete();
    } catch (_) {
      // Deletion is best-effort; the blob stays encrypted regardless.
    }
  }

  /// Destroys the key and every encrypted blob.
  Future<void> wipe() async {
    try {
      await _storage.delete(key: keyStorageKey);
    } catch (_) {}
    try {
      final base = await _baseDirectory();
      final directory = Directory('${base.path}/offline_vault');
      if (await directory.exists()) await directory.delete(recursive: true);
    } catch (_) {}
  }
}
