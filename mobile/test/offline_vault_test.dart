import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/offline_vault.dart';
import 'package:police_telegrams/telegram_outbox.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory directory;
  late OfflineVault vault;
  const storage = FlutterSecureStorage();

  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    directory = await Directory.systemTemp.createTemp('vault_test');
    vault = OfflineVault(
      storage: storage,
      baseDirectory: () async => directory,
    );
  });

  tearDown(() async {
    if (await directory.exists()) await directory.delete(recursive: true);
  });

  test('round-trips data and never stores plaintext on disk', () async {
    const secret = 'برقية سرية جدًا 12345';
    await vault.writeJson('offline_telegram_7', {'body': secret});

    expect(await vault.readJson('offline_telegram_7'), {'body': secret});
    final files = Directory('${directory.path}/offline_vault')
        .listSync()
        .whereType<File>()
        .toList();
    expect(files, hasLength(1));
    expect(files.single.path.contains('offline_telegram_7'), isFalse);
    final raw = files.single.readAsBytesSync();
    expect(utf8.decode(raw, allowMalformed: true).contains(secret), isFalse);
    expect(latin1.decode(raw).contains('12345'), isFalse);
  });

  test('tampered blobs are rejected as a cache miss', () async {
    await vault.write('blob', [1, 2, 3, 4]);
    final file = Directory('${directory.path}/offline_vault')
        .listSync()
        .whereType<File>()
        .single;
    final bytes = file.readAsBytesSync();
    bytes[bytes.length - 1] ^= 0xff;
    file.writeAsBytesSync(bytes);

    expect(await vault.read('blob'), isNull);
  });

  test('wipe crypto-shreds the key and the files', () async {
    await vault.write('blob', [9, 9, 9]);
    expect(await storage.read(key: OfflineVault.keyStorageKey), isNotNull);

    await vault.wipe();

    expect(await storage.read(key: OfflineVault.keyStorageKey), isNull);
    expect(await vault.read('blob'), isNull);
  });

  test(
    'outbox keeps attachments encrypted and coalesces offline edits',
    () async {
      final outbox = TelegramOutbox(storage: storage, vault: vault);
      await outbox.enqueue(
        payload: const {'subject': 'بلاغ', 'body': 'نص'},
        attachment: {
          'fileName': 'a.pdf',
          'contentType': 'application/pdf',
          'base64': base64Encode([1, 2, 3]),
        },
      );
      final raw = await storage.read(key: TelegramOutbox.storageKey);
      expect(raw!.contains('base64'), isFalse);
      expect(raw.contains('vaultRef'), isTrue);

      await outbox.enqueueUpdate(payload: const {'id': 5, 'subject': 'أول'});
      await outbox.enqueueUpdate(payload: const {'id': 5, 'subject': 'ثاني'});

      final entries = await outbox.list();
      expect(entries, hasLength(2));
      expect(entries.last.isUpdate, isTrue);
      expect(entries.last.payload['subject'], 'ثاني');
      expect((await outbox.pendingUpdateFor(5))?['subject'], 'ثاني');

      await outbox.remove(entries.first.id);
      expect(await vault.read('outbox_attachment_${entries.first.id}'), isNull);
    },
  );
}
