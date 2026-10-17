import 'dart:convert';

import 'api.dart';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

class TelegramOutboxEntry {
  const TelegramOutboxEntry({
    required this.id,
    required this.idempotencyKey,
    required this.payload,
    required this.createdAt,
    this.attachment,
    this.attempts = 0,
    this.lastError,
  });

  factory TelegramOutboxEntry.fromJson(Map<String, dynamic> json) {
    return TelegramOutboxEntry(
      id: '${json['id'] ?? ''}',
      idempotencyKey: '${json['idempotencyKey'] ?? ''}',
      payload: Map<String, dynamic>.from(json['payload'] as Map? ?? const {}),
      createdAt:
          DateTime.tryParse('${json['createdAt'] ?? ''}') ??
          DateTime.now().toUtc(),
      attachment: json['attachment'] is Map
          ? Map<String, dynamic>.from(json['attachment'] as Map)
          : null,
      attempts: int.tryParse('${json['attempts'] ?? 0}') ?? 0,
      lastError: json['lastError']?.toString(),
    );
  }

  final String id;
  final String idempotencyKey;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  final Map<String, dynamic>? attachment;
  final int attempts;
  final String? lastError;

  TelegramOutboxEntry copyWith({int? attempts, String? lastError}) =>
      TelegramOutboxEntry(
        id: id,
        idempotencyKey: idempotencyKey,
        payload: payload,
        createdAt: createdAt,
        attachment: attachment,
        attempts: attempts ?? this.attempts,
        lastError: lastError,
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'idempotencyKey': idempotencyKey,
    'payload': payload,
    'createdAt': createdAt.toUtc().toIso8601String(),
    if (attachment != null) 'attachment': attachment,
    'attempts': attempts,
    if (lastError != null) 'lastError': lastError,
  };
}

class TelegramOutboxSyncResult {
  const TelegramOutboxSyncResult({
    required this.synced,
    required this.remaining,
    required this.failed,
    this.permanentFailures = 0,
    this.permanentErrorMessages = const [],
  });

  final int synced;
  final int remaining;
  final int failed;
  final int permanentFailures;
  final List<String> permanentErrorMessages;
}

class TelegramOutbox {
  TelegramOutbox({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _storageKey = 'telegram_outbox_v1';
  static const maxOfflineAttachmentBytes = 2 * 1024 * 1024;
  static const _uuid = Uuid();
  final FlutterSecureStorage _storage;

  Future<List<TelegramOutboxEntry>> list() async {
    final raw = await _storage.read(key: _storageKey);
    if (raw == null || raw.trim().isEmpty) return <TelegramOutboxEntry>[];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return <TelegramOutboxEntry>[];
      return decoded
          .whereType<Map>()
          .map(
            (row) =>
                TelegramOutboxEntry.fromJson(Map<String, dynamic>.from(row)),
          )
          .where(
            (entry) => entry.id.isNotEmpty && entry.idempotencyKey.length >= 16,
          )
          .toList();
    } catch (_) {
      return <TelegramOutboxEntry>[];
    }
  }

  Future<int> pendingCount() async => (await list()).length;

  Future<TelegramOutboxEntry> enqueue({
    required Map<String, dynamic> payload,
    Map<String, dynamic>? attachment,
  }) async {
    final encodedAttachment = attachment?['base64'];
    if (encodedAttachment is String) {
      validateOfflineAttachmentBase64(encodedAttachment);
    }
    final entry = TelegramOutboxEntry(
      id: _uuid.v4(),
      idempotencyKey: 'mobile-offline-${_uuid.v4()}',
      payload: Map<String, dynamic>.from(payload),
      createdAt: DateTime.now().toUtc(),
      attachment: attachment == null
          ? null
          : Map<String, dynamic>.from(attachment),
    );
    final entries = await list();
    entries.add(entry);
    await _save(entries);
    return entry;
  }

  static void validateOfflineAttachmentBase64(String base64) {
    final estimatedBytes =
        (base64.length * 3 ~/ 4) -
        (base64.endsWith('==')
            ? 2
            : base64.endsWith('=')
            ? 1
            : 0);
    if (estimatedBytes > maxOfflineAttachmentBytes) {
      throw const FormatException(
        'لا يمكن حفظ مرفق بهذا الحجم دون اتصال. أعد المحاولة مع اتصال الإنترنت أو اختر مرفقًا أصغر من 2 ميغابايت.',
      );
    }
  }

  Future<TelegramOutboxSyncResult> sync(PoliceApi api) async {
    final entries = await list();
    var synced = 0;
    var failed = 0;
    var permanentFailures = 0;
    final permanentErrorMessages = <String>[];
    final remaining = <TelegramOutboxEntry>[];
    for (final entry in entries) {
      try {
        final result = await api.call(
          'telegrams.create',
          mutation: true,
          input: {...entry.payload, 'idempotencyKey': entry.idempotencyKey},
        );
        final telegramId = result is Map
            ? int.tryParse('${result['id']}')
            : null;
        final attachment = entry.attachment;
        if (telegramId != null && attachment != null) {
          await api.call(
            'telegrams.uploadAttachment',
            mutation: true,
            input: {'telegramId': telegramId, ...attachment},
          );
        }
        synced++;
      } on ApiException catch (exception) {
        // Validation and permission failures are permanent. Keeping them in
        // the outbox would retry invalid work forever and hide the real error.
        if (exception.statusCode >= 400 && exception.statusCode < 500 &&
            exception.statusCode != 408 &&
            exception.statusCode != 429) {
          failed++;
          permanentFailures++;
          permanentErrorMessages.add(exception.message);
          continue;
        }
        failed++;
        remaining.add(
          entry.copyWith(
            attempts: entry.attempts + 1,
            lastError: exception.toString(),
          ),
        );
        remaining.addAll(entries.skip(entries.indexOf(entry) + 1));
        break;
      } catch (exception) {
        failed++;
        remaining.add(
          entry.copyWith(
            attempts: entry.attempts + 1,
            lastError: exception.toString().replaceFirst('Exception: ', ''),
          ),
        );
        // Preserve FIFO ordering and avoid hammering the server when offline.
        remaining.addAll(entries.skip(entries.indexOf(entry) + 1));
        break;
      }
    }
    await _save(remaining);
    return TelegramOutboxSyncResult(
      synced: synced,
      remaining: remaining.length,
      failed: failed,
      permanentFailures: permanentFailures,
      permanentErrorMessages: List.unmodifiable(permanentErrorMessages),
    );
  }

  Future<void> remove(String id) async {
    final entries = await list();
    await _save(entries.where((entry) => entry.id != id).toList());
  }

  Future<void> clear() => _storage.delete(key: _storageKey);

  Future<void> _save(List<TelegramOutboxEntry> entries) async {
    if (entries.isEmpty) {
      await _storage.delete(key: _storageKey);
      return;
    }
    await _storage.write(
      key: _storageKey,
      value: jsonEncode(entries.map((entry) => entry.toJson()).toList()),
    );
  }
}
