import 'dart:convert';

import 'api.dart';
import 'offline_vault.dart';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

class TelegramOutboxEntry {
  const TelegramOutboxEntry({
    required this.id,
    required this.idempotencyKey,
    required this.payload,
    required this.createdAt,
    this.operation = TelegramOutbox.operationCreate,
    this.attachment,
    this.attempts = 0,
    this.lastError,
  });

  factory TelegramOutboxEntry.fromJson(Map<String, dynamic> json) {
    final operation = '${json['operation'] ?? TelegramOutbox.operationCreate}';
    return TelegramOutboxEntry(
      id: '${json['id'] ?? ''}',
      idempotencyKey: '${json['idempotencyKey'] ?? ''}',
      payload: Map<String, dynamic>.from(json['payload'] as Map? ?? const {}),
      createdAt:
          DateTime.tryParse('${json['createdAt'] ?? ''}') ??
          DateTime.now().toUtc(),
      operation: operation == TelegramOutbox.operationUpdate
          ? TelegramOutbox.operationUpdate
          : TelegramOutbox.operationCreate,
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

  /// `create` for a new telegram, `update` for an edit of an existing one.
  final String operation;

  /// Attachment metadata. Bytes live in the encrypted [OfflineVault]
  /// (`vaultRef`); legacy entries may still carry inline `base64`.
  final Map<String, dynamic>? attachment;
  final int attempts;
  final String? lastError;

  bool get isUpdate => operation == TelegramOutbox.operationUpdate;

  int? get telegramId => isUpdate ? int.tryParse('${payload['id']}') : null;

  TelegramOutboxEntry copyWith({
    int? attempts,
    String? lastError,
    Map<String, dynamic>? payload,
  }) => TelegramOutboxEntry(
    id: id,
    idempotencyKey: idempotencyKey,
    payload: payload ?? this.payload,
    createdAt: createdAt,
    operation: operation,
    attachment: attachment,
    attempts: attempts ?? this.attempts,
    lastError: lastError,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'idempotencyKey': idempotencyKey,
    'operation': operation,
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
  TelegramOutbox({FlutterSecureStorage? storage, OfflineVault? vault})
    : _storage = storage ?? const FlutterSecureStorage(),
      _vault = vault ?? OfflineVault(storage: storage);

  static const storageKey = 'telegram_outbox_v1';
  static const epochKey = 'telegram_outbox_epoch_v1';
  static const operationCreate = 'create';
  static const operationUpdate = 'update';

  /// Matches the server attachment upload limit. Bytes are kept AES-256-GCM
  /// encrypted on disk instead of the size-limited platform keystore.
  static const maxOfflineAttachmentBytes = 10 * 1024 * 1024;
  static const _uuid = Uuid();
  final FlutterSecureStorage _storage;
  final OfflineVault _vault;

  static String _attachmentVaultName(String entryId) =>
      'outbox_attachment_$entryId';

  Future<List<TelegramOutboxEntry>> list() async {
    final raw = await _storage.read(key: storageKey);
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

  /// Pending local edits for [telegramId], used to overlay cached details.
  Future<Map<String, dynamic>?> pendingUpdateFor(int telegramId) async {
    for (final entry in (await list()).reversed) {
      if (entry.telegramId == telegramId) return entry.payload;
    }
    return null;
  }

  Future<TelegramOutboxEntry> enqueue({
    required Map<String, dynamic> payload,
    Map<String, dynamic>? attachment,
  }) async {
    final entryId = _uuid.v4();
    Map<String, dynamic>? storedAttachment;
    if (attachment != null) {
      storedAttachment = Map<String, dynamic>.from(attachment);
      final encoded = storedAttachment.remove('base64');
      if (encoded is String) {
        validateOfflineAttachmentBase64(encoded);
        final vaultName = _attachmentVaultName(entryId);
        await _vault.write(vaultName, utf8.encode(encoded));
        storedAttachment['vaultRef'] = vaultName;
      }
    }
    final entry = TelegramOutboxEntry(
      id: entryId,
      idempotencyKey: 'mobile-offline-${_uuid.v4()}',
      payload: Map<String, dynamic>.from(payload),
      createdAt: DateTime.now().toUtc(),
      attachment: storedAttachment,
    );
    final entries = await list();
    entries.add(entry);
    try {
      await _save(entries);
    } catch (_) {
      await _vault.delete(_attachmentVaultName(entryId));
      rethrow;
    }
    return entry;
  }

  /// Queues an edit of an existing telegram. Several offline edits of the
  /// same telegram collapse into one so only the final state is sent.
  Future<TelegramOutboxEntry> enqueueUpdate({
    required Map<String, dynamic> payload,
  }) async {
    final telegramId = int.tryParse('${payload['id']}');
    if (telegramId == null) {
      throw const FormatException('رقم البرقية غير صالح للحفظ المحلي.');
    }
    final entries = await list();
    final index = entries.indexWhere((entry) => entry.telegramId == telegramId);
    if (index >= 0) {
      final merged = entries[index].copyWith(
        payload: {...entries[index].payload, ...payload},
        attempts: 0,
      );
      entries[index] = merged;
      await _save(entries);
      return merged;
    }
    final entry = TelegramOutboxEntry(
      id: _uuid.v4(),
      idempotencyKey: 'mobile-offline-${_uuid.v4()}',
      payload: Map<String, dynamic>.from(payload),
      createdAt: DateTime.now().toUtc(),
      operation: operationUpdate,
    );
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
        'لا يمكن حفظ مرفق بهذا الحجم دون اتصال. أعد المحاولة مع اتصال الإنترنت أو اختر مرفقًا أصغر من 10 ميغابايت.',
      );
    }
  }

  Future<Map<String, dynamic>?> _resolveAttachment(
    TelegramOutboxEntry entry,
  ) async {
    final attachment = entry.attachment;
    if (attachment == null) return null;
    final resolved = Map<String, dynamic>.from(attachment);
    final vaultRef = resolved.remove('vaultRef');
    if (vaultRef is String) {
      final bytes = await _vault.read(vaultRef);
      if (bytes == null) {
        throw const FormatException(
          'تعذر قراءة المرفق المحفوظ محليًا؛ أعد إرفاقه بعد المزامنة.',
        );
      }
      resolved['base64'] = utf8.decode(bytes);
    }
    return resolved.containsKey('base64') ? resolved : null;
  }

  Future<void> _sendEntry(PoliceApi api, TelegramOutboxEntry entry) async {
    if (entry.isUpdate) {
      await api.call('telegrams.update', mutation: true, input: entry.payload);
      return;
    }
    final result = await api.call(
      'telegrams.create',
      mutation: true,
      input: {...entry.payload, 'idempotencyKey': entry.idempotencyKey},
    );
    final telegramId = result is Map ? int.tryParse('${result['id']}') : null;
    final attachment = await _resolveAttachment(entry);
    if (telegramId != null && attachment != null) {
      await api.call(
        'telegrams.uploadAttachment',
        mutation: true,
        input: {'telegramId': telegramId, ...attachment},
      );
    }
  }

  Future<TelegramOutboxSyncResult> sync(PoliceApi api) async {
    final syncEpoch = await _readEpoch();
    final entries = await list();
    var synced = 0;
    var failed = 0;
    var permanentFailures = 0;
    final permanentErrorMessages = <String>[];
    final remaining = <TelegramOutboxEntry>[];
    final finished = <TelegramOutboxEntry>[];
    for (final entry in entries) {
      try {
        await _sendEntry(api, entry);
        finished.add(entry);
        synced++;
      } on ApiException catch (exception) {
        // Validation and permission failures are permanent. Keeping them in
        // the outbox would retry invalid work forever and hide the real error.
        if (exception.statusCode >= 400 &&
            exception.statusCode < 500 &&
            exception.statusCode != 408 &&
            exception.statusCode != 429) {
          failed++;
          permanentFailures++;
          permanentErrorMessages.add(exception.message);
          finished.add(entry);
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
    // Logout advances the epoch and deletes the local queue. Do not let a
    // request that was already in flight recreate that queue afterwards.
    if (syncEpoch != await _readEpoch()) {
      return TelegramOutboxSyncResult(
        synced: synced,
        remaining: 0,
        failed: failed,
        permanentFailures: permanentFailures,
        permanentErrorMessages: List.unmodifiable(permanentErrorMessages),
      );
    }
    await _save(remaining);
    for (final entry in finished) {
      await _vault.delete(_attachmentVaultName(entry.id));
    }
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
    await _vault.delete(_attachmentVaultName(id));
  }

  Future<void> clear() async {
    await _advanceEpoch();
    final entries = await list();
    await _storage.delete(key: storageKey);
    for (final entry in entries) {
      await _vault.delete(_attachmentVaultName(entry.id));
    }
  }

  Future<String> _readEpoch() async =>
      await _storage.read(key: epochKey) ?? '0';

  Future<void> _advanceEpoch() => _storage.write(
    key: epochKey,
    value: DateTime.now().microsecondsSinceEpoch.toString(),
  );

  Future<void> _save(List<TelegramOutboxEntry> entries) async {
    if (entries.isEmpty) {
      await _storage.delete(key: storageKey);
      return;
    }
    await _storage.write(
      key: storageKey,
      value: jsonEncode(entries.map((entry) => entry.toJson()).toList()),
    );
  }
}
