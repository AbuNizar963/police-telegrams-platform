import 'package:flutter_test/flutter_test.dart';

import 'dart:convert';

import 'package:police_telegrams/telegram_outbox.dart';

void main() {
  test('rejects an attachment larger than 2MB before writing offline data', () {
    final oversizedBase64 = base64Encode(
      List<int>.filled(TelegramOutbox.maxOfflineAttachmentBytes + 1, 0),
    );

    expect(
      () => TelegramOutbox.validateOfflineAttachmentBase64(oversizedBase64),
      throwsA(
        isA<FormatException>().having(
          (error) => error.message,
          'message',
          contains('أصغر من 2 ميغابايت'),
        ),
      ),
    );
  });

  test('accepts an attachment exactly at the 2MB offline limit', () {
    final base64 = base64Encode(
      List<int>.filled(TelegramOutbox.maxOfflineAttachmentBytes, 0),
    );

    expect(
      () => TelegramOutbox.validateOfflineAttachmentBase64(base64),
      returnsNormally,
    );
  });

  test('serializes a queued telegram with its idempotency key', () {
    final created = DateTime.utc(2026, 10, 17, 2, 0);
    final entry = TelegramOutboxEntry(
      id: 'local-1',
      idempotencyKey: 'mobile-offline-1234567890',
      payload: const {
        'subject': 'بلاغ',
        'body': 'نص البرقية',
        'requestedOrganizationSerialNumber': 18,
      },
      createdAt: created,
      attempts: 2,
      lastError: 'تعذر الاتصال بالخادم',
    );

    final restored = TelegramOutboxEntry.fromJson(entry.toJson());
    expect(restored.id, entry.id);
    expect(restored.idempotencyKey, entry.idempotencyKey);
    expect(restored.payload['body'], 'نص البرقية');
    expect(restored.createdAt, created);
    expect(restored.attempts, 2);
    expect(restored.lastError, 'تعذر الاتصال بالخادم');
  });

  test(
    'copyWith increments attempts while retaining the immutable payload',
    () {
      final entry = TelegramOutboxEntry(
        id: 'local-2',
        idempotencyKey: 'mobile-offline-abcdefgh',
        payload: const {'body': 'محتوى'},
        createdAt: DateTime.utc(2026, 10, 17),
      );

      final retry = entry.copyWith(
        attempts: entry.attempts + 1,
        lastError: 'انقطع الاتصال',
      );
      expect(retry.id, entry.id);
      expect(retry.payload, entry.payload);
      expect(retry.attempts, 1);
      expect(retry.lastError, 'انقطع الاتصال');
    },
  );
}
