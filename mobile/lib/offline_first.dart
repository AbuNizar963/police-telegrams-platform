import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

import 'api.dart';

const _maxOfflineAttachmentBytes = 2 * 1024 * 1024;
const _chunkSize = 48 * 1024;

class OfflineOutboxItem {
  OfflineOutboxItem({
    required this.id,
    required this.procedure,
    required this.input,
    required this.createdAt,
    this.attempts = 0,
    this.lastError,
    this.state = 'pending',
  });

  final String id;
  final String procedure;
  final Map<String, dynamic> input;
  final String createdAt;
  final int attempts;
  final String? lastError;
  final String state;

  Map<String, dynamic> toJson() => {
    'id': id,
    'procedure': procedure,
    'input': input,
    'createdAt': createdAt,
    'attempts': attempts,
    'lastError': lastError,
    'state': state,
  };

  factory OfflineOutboxItem.fromJson(Map<String, dynamic> json) =>
      OfflineOutboxItem(
        id: '${json['id']}',
        procedure: '${json['procedure']}',
        input: Map<String, dynamic>.from(json['input'] as Map),
        createdAt: '${json['createdAt']}',
        attempts: (json['attempts'] as num?)?.toInt() ?? 0,
        lastError: json['lastError'] as String?,
        state: json['state'] as String? ?? 'pending',
      );

  OfflineOutboxItem failed(String message) => OfflineOutboxItem(
    id: id,
    procedure: procedure,
    input: input,
    createdAt: createdAt,
    attempts: attempts + 1,
    lastError: message,
    state: 'retryable',
  );

  OfflineOutboxItem marked(String nextState, String message) =>
      OfflineOutboxItem(
        id: id,
        procedure: procedure,
        input: input,
        createdAt: createdAt,
        attempts: attempts + 1,
        lastError: message,
        state: nextState,
      );
}

class OfflineFirstService {
  OfflineFirstService({required this.api});

  final PoliceApi api;
  final _storage = const FlutterSecureStorage();
  final _uuid = const Uuid();
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  Timer? _syncTimer;
  String _scope = 'default';
  bool _syncing = false;

  String get _prefix => 'offline.$_scope';
  String get _outboxIndexKey => '$_prefix.outbox.index';
  String get _statsKey => '$_prefix.cache.stats';
  String get _telegramsKey => '$_prefix.cache.telegrams';

  Future<void> start({required String scope}) async {
    _scope = _safeScope(scope);
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((
      results,
    ) {
      if (results.any((result) => result != ConnectivityResult.none)) {
        unawaited(sync());
      }
    });
    _syncTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      unawaited(sync());
    });
    await sync();
  }

  Future<void> dispose() async {
    _syncTimer?.cancel();
    await _connectivitySubscription?.cancel();
  }

  Future<List<OfflineOutboxItem>> pending() async {
    final ids = await _readJsonList(_outboxIndexKey);
    final items = <OfflineOutboxItem>[];
    for (final id in ids.cast<String>()) {
      final raw = await _readChunked('$_prefix.outbox.$id');
      if (raw == null) continue;
      try {
        items.add(
          OfflineOutboxItem.fromJson(
            Map<String, dynamic>.from(jsonDecode(raw) as Map),
          ),
        );
      } catch (_) {
        // Corrupt entries are not allowed to break the rest of the outbox.
      }
    }
    return items;
  }

  Future<int> conflictCount() async =>
      (await pending()).where((item) => item.state == 'conflict').length;

  Future<Map<String, dynamic>?> cachedStats() async {
    final raw = await _storage.read(key: _statsKey);
    return raw == null
        ? null
        : Map<String, dynamic>.from(jsonDecode(raw) as Map);
  }

  Future<List<dynamic>?> cachedTelegrams() async {
    final raw = await _storage.read(key: _telegramsKey);
    return raw == null ? null : jsonDecode(raw) as List<dynamic>;
  }

  Future<void> cacheDashboard({
    required Map<String, dynamic> stats,
    required List<dynamic> telegrams,
  }) async {
    await _storage.write(key: _statsKey, value: jsonEncode(stats));
    await _storage.write(key: _telegramsKey, value: jsonEncode(telegrams));
  }

  Future<Map<String, dynamic>> createTelegram(
    Map<String, dynamic> input,
  ) async {
    final enriched = Map<String, dynamic>.from(input);
    enriched['idempotencyKey'] ??= _uuid.v4();
    try {
      final result = await api.call(
        'telegrams.create',
        mutation: true,
        input: enriched,
      );
      return Map<String, dynamic>.from(result as Map);
    } on NetworkException {
      final item = OfflineOutboxItem(
        id: _uuid.v4(),
        procedure: 'telegrams.create',
        input: enriched,
        createdAt: DateTime.now().toUtc().toIso8601String(),
      );
      await _append(item);
      final local = <String, dynamic>{
        ...enriched,
        'id': -item.id.hashCode.abs(),
        'status': 'pending_sync',
        'serialCode': 'محلي-${item.id.substring(0, 8)}',
        'createdAt': item.createdAt,
        'offlinePending': true,
      };
      final current = await cachedTelegrams() ?? <dynamic>[];
      await cacheDashboard(
        stats: await cachedStats() ?? {},
        telegrams: [local, ...current],
      );
      return local;
    }
  }

  Future<void> sync() async {
    if (_syncing) return;
    _syncing = true;
    try {
      final connectivity = await Connectivity().checkConnectivity();
      if (connectivity.every((result) => result == ConnectivityResult.none)) {
        return;
      }
      final items = await pending();
      for (final item in items) {
        if (item.state == 'conflict' || item.state == 'failed') break;
        try {
          await api.call(item.procedure, mutation: true, input: item.input);
          await _remove(item.id);
        } on ConflictException catch (error) {
          await _replace(item.marked('conflict', _message(error)));
          break;
        } catch (error) {
          await _replace(item.failed(_message(error)));
          break; // FIFO: never overtake a failed operation.
        }
      }
    } finally {
      _syncing = false;
    }
  }

  Future<bool> runMutation({
    required String procedure,
    required Map<String, dynamic> input,
  }) async {
    try {
      await api.call(procedure, mutation: true, input: input);
      return true;
    } on NetworkException {
      await _append(
        OfflineOutboxItem(
          id: _uuid.v4(),
          procedure: procedure,
          input: input,
          createdAt: DateTime.now().toUtc().toIso8601String(),
        ),
      );
      return false;
    }
  }

  Future<void> enqueueAttachment({
    required int telegramId,
    required String fileName,
    required String contentType,
    required List<int> bytes,
  }) async {
    if (bytes.length > _maxOfflineAttachmentBytes) {
      throw StateError(
        'لا يمكن حفظ مرفق بهذا الحجم دون اتصال. أعد المحاولة مع اتصال الإنترنت أو اختر مرفقًا أصغر من 2 ميغابايت',
      );
    }
    await _append(
      OfflineOutboxItem(
        id: _uuid.v4(),
        procedure: 'telegrams.uploadAttachment',
        input: {
          'telegramId': telegramId,
          'fileName': fileName,
          'contentType': contentType,
          'base64': base64Encode(bytes),
        },
        createdAt: DateTime.now().toUtc().toIso8601String(),
      ),
    );
  }

  Future<void> _append(OfflineOutboxItem item) async {
    final ids = await _readJsonList(_outboxIndexKey);
    ids.add(item.id);
    await _writeChunked(
      '$_prefix.outbox.${item.id}',
      jsonEncode(item.toJson()),
    );
    await _storage.write(key: _outboxIndexKey, value: jsonEncode(ids));
  }

  Future<void> _replace(OfflineOutboxItem item) =>
      _writeChunked('$_prefix.outbox.${item.id}', jsonEncode(item.toJson()));

  Future<void> _remove(String id) async {
    final ids = await _readJsonList(_outboxIndexKey);
    ids.remove(id);
    await _storage.write(key: _outboxIndexKey, value: jsonEncode(ids));
    final raw = await _storage.read(key: '$_prefix.outbox.$id.parts');
    final count = int.tryParse(raw ?? '') ?? 0;
    for (var index = 0; index < count; index++) {
      await _storage.delete(key: '$_prefix.outbox.$id.$index');
    }
    await _storage.delete(key: '$_prefix.outbox.$id.parts');
  }

  Future<List<dynamic>> _readJsonList(String key) async {
    final raw = await _storage.read(key: key);
    if (raw == null) return <dynamic>[];
    final value = jsonDecode(raw);
    return value is List ? List<dynamic>.from(value) : <dynamic>[];
  }

  Future<String?> _readChunked(String prefix) async {
    final count = int.tryParse(await _storage.read(key: '$prefix.parts') ?? '');
    if (count == null) return null;
    final buffer = StringBuffer();
    for (var index = 0; index < count; index++) {
      final chunk = await _storage.read(key: '$prefix.$index');
      if (chunk == null) return null;
      buffer.write(chunk);
    }
    return buffer.toString();
  }

  Future<void> _writeChunked(String prefix, String value) async {
    final oldCount =
        int.tryParse(await _storage.read(key: '$prefix.parts') ?? '') ?? 0;
    for (var index = 0; index < oldCount; index++) {
      await _storage.delete(key: '$prefix.$index');
    }
    final count = (value.length / _chunkSize).ceil();
    for (var index = 0; index < count; index++) {
      final start = index * _chunkSize;
      final end = (start + _chunkSize).clamp(0, value.length).toInt();
      await _storage.write(
        key: '$prefix.$index',
        value: value.substring(start, end),
      );
    }
    await _storage.write(key: '$prefix.parts', value: '$count');
  }

  String _safeScope(String value) =>
      value.replaceAll(RegExp(r'[^a-zA-Z0-9_.-]'), '_');
  String _message(Object error) =>
      error.toString().replaceFirst('Exception: ', '');
}

bool isOfflineAttachmentSizeAllowed(int bytes) =>
    bytes >= 0 && bytes <= _maxOfflineAttachmentBytes;
