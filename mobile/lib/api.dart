import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import 'offline_vault.dart';

class NetworkException implements Exception {
  const NetworkException([this.message = 'تعذر الاتصال بالخادم']);

  final String message;

  @override
  String toString() => message;
}

class ApiException implements Exception {
  const ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}

class ApiMutationEvent {
  const ApiMutationEvent({
    required this.procedure,
    required this.input,
    required this.result,
  });

  final String procedure;
  final Map<String, dynamic>? input;
  final dynamic result;

  bool get isTelegramMutation => procedure.startsWith('telegrams.');

  int? get telegramId {
    final values = <dynamic>[
      input?['id'],
      input?['telegramId'],
      result is Map ? result['id'] : null,
      result is Map ? result['telegramId'] : null,
    ];
    for (final value in values) {
      final parsed = int.tryParse('$value');
      if (parsed != null && parsed > 0) return parsed;
    }
    return null;
  }

  bool affectsTelegram(int id) => telegramId == id;
}

class _OrganizationLogoCacheEntry {
  const _OrganizationLogoCacheEntry(this.bytes, this.cachedAt);

  final Uint8List bytes;
  final DateTime cachedAt;
}

class PoliceApi {
  static const _offlineCacheKeyRegistry = 'offline_cache_key_registry_v1';
  static const _maxOfflineCacheKeys = 128;
  static const _telegramOutboxKey = 'telegram_outbox_v1';
  static const _telegramOutboxEpochKey = 'telegram_outbox_epoch_v1';

  /// Last time the server confirmed this session (login or `auth.me`).
  static const _sessionVerifiedAtKey = 'session_verified_at_v1';

  /// How long a saved session may be opened without reaching the server.
  /// The PIN/biometric app lock still guards every offline launch; after this
  /// window the device must reconnect once so revoked accounts lose access.
  static const offlineSessionMaxAge = Duration(days: 7);
  static const _vaultResponseMarker = '{"__offline_vault__":1}';
  static const _maxSecureStorageResponseBytes = 512 * 1024;
  static const _maxVaultResponseBytes = 8 * 1024 * 1024;
  static const maxCachedAttachmentBytes = 10 * 1024 * 1024;

  PoliceApi({
    String? baseUrl,
    http.Client? httpClient,
    this.imageCacheDirectory,
    OfflineVault? vault,
  }) : baseUrl =
           baseUrl ??
           const String.fromEnvironment(
             'API_BASE_URL',
             defaultValue: 'https://police-telegrams-platform.vercel.app',
           ),
       _httpClient = httpClient ?? _sharedHttpClient,
       _vault = vault ?? OfflineVault();

  final OfflineVault _vault;

  static final http.Client _sharedHttpClient = http.Client();
  static const _maximumCachedOrganizationLogoBytes = 5 * 1024 * 1024;
  static const _organizationLogoMemoryTtl = Duration(minutes: 10);

  final String baseUrl;
  final http.Client _httpClient;
  final Directory? imageCacheDirectory;
  final _storage = const FlutterSecureStorage();
  final StreamController<ApiMutationEvent> _mutationEvents =
      StreamController<ApiMutationEvent>.broadcast(sync: true);
  final Map<String, Future<Uint8List?>> _organizationLogoRequests = {};
  final Map<String, Future<void>> _organizationLogoRefreshes = {};
  final Map<String, _OrganizationLogoCacheEntry> _organizationLogoMemory = {};
  Future<Directory>? _logoCacheDirectoryFuture;
  int _logoCacheGeneration = 0;

  Stream<ApiMutationEvent> get mutationEvents => _mutationEvents.stream;

  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
    bool allowOfflineCache = true,
  }) async {
    final cookie = await _storage.read(key: 'session_cookie');
    final uri = mutation
        ? Uri.parse('$baseUrl/api/trpc/$procedure')
        : Uri.parse(
            '$baseUrl/api/trpc/$procedure?input=${Uri.encodeComponent(jsonEncode({'json': input}))}',
          );
    final headers = <String, String>{
      'content-type': 'application/json',
      'accept': 'application/json',
    };
    if (cookie != null) headers['cookie'] = cookie;
    late final http.Response response;
    try {
      response =
          await (mutation
                  ? _httpClient.post(
                      uri,
                      headers: headers,
                      body: jsonEncode({'json': input}),
                    )
                  : _httpClient.get(uri, headers: headers))
              .timeout(
                Duration(
                  seconds: procedure == 'telegrams.importWorkbookPreview'
                      ? 90
                      : 8,
                ),
              );
    } catch (error) {
      // Only transport failures should trigger offline fallback. Unexpected
      // programming errors must remain visible instead of masquerading as
      // connectivity problems.
      if (error is! IOException &&
          error is! http.ClientException &&
          error is! TimeoutException) {
        rethrow;
      }
      if (!mutation && allowOfflineCache) {
        final cached = await _readOfflineResponse(procedure, input);
        if (cached != null) return cached;
      }
      throw const NetworkException();
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final isTransientFailure =
          response.statusCode == 408 ||
          response.statusCode == 429 ||
          response.statusCode >= 500;
      if (!mutation && allowOfflineCache && isTransientFailure) {
        final cached = await _readOfflineResponse(procedure, input);
        if (cached != null) return cached;
      }
      throw ApiException(response.statusCode, _message(response.body));
    }
    final decoded = jsonDecode(response.body);
    final result = decoded is Map ? decoded['result'] : null;
    final data = result is Map ? result['data'] : null;
    final value = data is Map && data.containsKey('json') ? data['json'] : data;
    if (!mutation) {
      await _writeOfflineResponse(procedure, input, value);
    } else {
      await _syncOfflineCacheAfterMutation(procedure, input, value);
      _mutationEvents.add(
        ApiMutationEvent(procedure: procedure, input: input, result: value),
      );
    }
    return value;
  }

  /// Renders an official telegram through the authenticated server-side
  /// Chromium pipeline shared with the web client.
  ///
  /// The logo is represented in HTML only by the fixed server-side marker;
  /// the actual storage source and organization scope travel as separate
  /// request fields and are revalidated by the server.
  Future<Uint8List> renderTelegramDocument({
    required String html,
    required String format,
    String? organizationId,
    String? logoSource,
  }) async {
    if (html.trim().isEmpty || !{'pdf', 'png'}.contains(format)) {
      throw const FormatException('بيانات تصدير الوثيقة غير صالحة.');
    }
    if (utf8.encode(html).length > 3900000) {
      throw const FormatException(
        'حجم قالب الوثيقة يتجاوز الحد الآمن للتصدير.',
      );
    }

    final requiresOfficialLogo = html.contains('telegram-logo://official');
    final normalizedOrganizationId = organizationId?.trim() ?? '';
    final normalizedLogoSource = logoSource?.trim() ?? '';
    if (requiresOfficialLogo &&
        (normalizedOrganizationId.isEmpty || normalizedLogoSource.isEmpty)) {
      throw const FormatException(
        'بيانات شعار الجهة غير مكتملة لتصدير الوثيقة.',
      );
    }

    final cookie = await _storage.read(key: 'session_cookie');
    final uri = Uri.parse('$baseUrl/api/telegram-render');
    final headers = <String, String>{
      'content-type': 'application/json',
      'accept': 'application/pdf, image/png',
    };
    if (cookie != null && cookie.isNotEmpty) {
      headers['cookie'] = cookie;
    }

    final body = <String, Object>{
      'format': format,
      'html': html,
      if (requiresOfficialLogo) ...{
        'organizationId': normalizedOrganizationId,
        'logoSource': normalizedLogoSource,
      },
    };

    late final http.Response response;
    try {
      response = await _httpClient
          .post(uri, headers: headers, body: jsonEncode(body))
          .timeout(const Duration(seconds: 60));
    } on TimeoutException {
      throw const NetworkException('انتهت مهلة إنشاء الوثيقة. أعد المحاولة.');
    } on IOException {
      throw const NetworkException();
    } on http.ClientException {
      throw const NetworkException();
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(response.statusCode, _message(response.body));
    }

    final contentType = (response.headers['content-type'] ?? '')
        .split(';')
        .first
        .trim()
        .toLowerCase();
    final bytes = response.bodyBytes;
    final isPdf = contentType == 'application/pdf' &&
        bytes.length >= 5 &&
        String.fromCharCodes(bytes.take(5)) == '%PDF-';
    final isPng = contentType == 'image/png' &&
        bytes.length >= 8 &&
        const [137, 80, 78, 71, 13, 10, 26, 10]
            .asMap()
            .entries
            .every((entry) => bytes[entry.key] == entry.value);
    final validContent = format == 'pdf'
        ? isPdf
        : isPdf || isPng;
    if (!validContent) {
      throw const ApiException(
        502,
        'أعاد الخادم ملف وثيقة بصيغة غير متوقعة.',
      );
    }
    return Uint8List.fromList(bytes);
  }

  Future<Map<String, dynamic>> uploadTelegramAttachment({
    required int telegramId,
    required String fileName,
    required String contentType,
    required Uint8List bytes,
  }) async {
    if (telegramId < 1 || bytes.isEmpty || bytes.length > 10 * 1024 * 1024) {
      throw const FormatException('بيانات المرفق أو حجمه غير صالح');
    }

    final cookie = await _storage.read(key: 'session_cookie');
    final requestHeaders = <String, String>{
      'content-type': 'application/json',
      'accept': 'application/json',
    };
    if (cookie != null) requestHeaders['cookie'] = cookie;

    Future<http.Response> send(
      Future<http.Response> Function() request, {
      Duration timeout = const Duration(seconds: 20),
    }) async {
      try {
        return await request().timeout(timeout);
      } on TimeoutException {
        throw const NetworkException();
      } on IOException {
        throw const NetworkException();
      } on http.ClientException {
        throw const NetworkException();
      }
    }

    final prepareUri = Uri.parse(
      '$baseUrl/api/telegrams/$telegramId/attachments/upload-url',
    );
    final prepareResponse = await send(
      () => _httpClient.post(
        prepareUri,
        headers: requestHeaders,
        body: jsonEncode({
          'fileName': fileName,
          'contentType': contentType,
          'sizeBytes': bytes.length,
        }),
      ),
    );
    if (prepareResponse.statusCode < 200 || prepareResponse.statusCode >= 300) {
      throw ApiException(
        prepareResponse.statusCode,
        _message(prepareResponse.body),
      );
    }

    final preparedValue = jsonDecode(prepareResponse.body);
    if (preparedValue is! Map ||
        preparedValue['key'] is! String ||
        preparedValue['uploadUrl'] is! String) {
      throw const FormatException('لم يُرجع الخادم رابط رفع صالحًا');
    }
    final key = preparedValue['key'] as String;
    final uploadUri = Uri.tryParse(preparedValue['uploadUrl'] as String);
    if (uploadUri == null ||
        !{'https', 'http'}.contains(uploadUri.scheme) ||
        uploadUri.host.isEmpty) {
      throw const FormatException('رابط التخزين المؤقت غير صالح');
    }

    final storageResponse = await send(
      () => _httpClient.put(
        uploadUri,
        headers: {'content-type': contentType},
        body: bytes,
      ),
      timeout: const Duration(seconds: 60),
    );
    if (storageResponse.statusCode < 200 || storageResponse.statusCode >= 300) {
      throw ApiException(
        storageResponse.statusCode,
        _message(storageResponse.body),
      );
    }

    final finalizeUri = Uri.parse(
      '$baseUrl/api/telegrams/$telegramId/attachments/finalize',
    );
    final finalizeResponse = await send(
      () => _httpClient.post(
        finalizeUri,
        headers: requestHeaders,
        body: jsonEncode({
          'key': key,
          'fileName': fileName,
          'contentType': contentType,
          'sizeBytes': bytes.length,
        }),
      ),
    );
    if (finalizeResponse.statusCode < 200 ||
        finalizeResponse.statusCode >= 300) {
      throw ApiException(
        finalizeResponse.statusCode,
        _message(finalizeResponse.body),
      );
    }

    final finalizedValue = jsonDecode(finalizeResponse.body);
    if (finalizedValue is! Map) {
      throw const FormatException('استجابة اعتماد المرفق غير صالحة');
    }
    final result = Map<String, dynamic>.from(finalizedValue);
    _mutationEvents.add(
      ApiMutationEvent(
        procedure: 'telegrams.uploadAttachment',
        input: {'telegramId': telegramId},
        result: result,
      ),
    );
    return result;
  }

  Future<void> _syncOfflineCacheAfterMutation(
    String procedure,
    Map<String, dynamic>? input,
    dynamic value,
  ) async {
    if (procedure == 'platformDocumentSettings.update') {
      await _writeOfflineResponse('platformDocumentSettings.get', null, value);
      return;
    }
    if (procedure == 'settings.update') {
      await _writeOfflineResponse('settings.get', null, value);
    }
    if (!procedure.startsWith('telegrams.')) return;

    final event = ApiMutationEvent(
      procedure: procedure,
      input: input,
      result: value,
    );
    final id = event.telegramId;
    final keys = await _readKnownOfflineCacheKeys();
    final invalidated = keys.where((key) {
      if (key == 'cached_dashboard' || key == 'offline_dashboard_stats') {
        return true;
      }
      if (key == 'offline_notifications_inbox') return true;
      if (key.startsWith('offline_telegrams_list_') ||
          key.startsWith('offline_telegram_report_')) {
        return true;
      }
      if (id == null) return false;
      if (key == 'offline_telegram_$id') return true;
      return key.startsWith('offline_telegram_versions_') ||
          key.startsWith('offline_telegram_routes_') ||
          key.startsWith('offline_telegram_attachments_') ||
          key.startsWith('offline_telegram_actions_');
    });
    for (final key in invalidated) {
      try {
        await _storage.delete(key: key);
      } catch (_) {
        // Cache invalidation is best-effort and must never fail a saved change.
      }
    }

    // Update/detail screens can reopen immediately with the canonical server
    // response for mutations that return a full telegram object.
    if (id != null &&
        value is Map &&
        (procedure == 'telegrams.create' ||
            procedure == 'telegrams.update' ||
            procedure == 'telegrams.transition')) {
      await _writeOfflineResponse('telegrams.get', {'id': id}, value);
    }
  }

  Future<Set<String>> _readKnownOfflineCacheKeys() async {
    try {
      final values = await _storage.readAll();
      return values.keys
          .where(
            (key) => key.startsWith('offline_') || key == 'cached_dashboard',
          )
          .toSet();
    } catch (_) {
      final keys = await _readOfflineCacheKeyRegistry();
      keys.addAll(const [
        'offline_settings',
        'offline_platform_document_settings',
        'offline_routing_directory',
        'offline_organization_descendants',
        'offline_organizations_all',
        'offline_organization_context',
        'offline_dashboard_stats',
        'offline_notifications_inbox',
        'offline_profile',
        'cached_dashboard',
      ]);
      return keys.toSet();
    }
  }

  // Cache only read-only data needed to reopen previously viewed screens.
  // Mutations always require the server and never use a cached response.
  String? _offlineResponseKey(String procedure, Map<String, dynamic>? input) {
    switch (procedure) {
      case 'telegrams.get':
        final id = input?['id'];
        if (id == null || '$id'.trim().isEmpty) return null;
        return 'offline_telegram_$id';
      case 'telegrams.list':
        return _offlineInputResponseKey('offline_telegrams_list', input);
      case 'telegrams.versions':
        return _offlineInputResponseKey('offline_telegram_versions', input);
      case 'telegrams.incomingRoutes':
        return _offlineInputResponseKey('offline_telegram_routes', input);
      case 'telegrams.attachments':
        return _offlineInputResponseKey('offline_telegram_attachments', input);
      case 'telegrams.actions':
        return _offlineInputResponseKey('offline_telegram_actions', input);
      case 'reports.telegrams':
        return _offlineInputResponseKey('offline_telegram_report', input);
      case 'notifications.inbox':
        return 'offline_notifications_inbox';
      case 'profile.get':
        return 'offline_profile';
      case 'settings.get':
        return 'offline_settings';
      case 'platformDocumentSettings.get':
        return 'offline_platform_document_settings';
      case 'organizations.routingDirectory':
        return 'offline_routing_directory';
      case 'organizations.descendants':
        return 'offline_organization_descendants';
      case 'organizations.all':
        return 'offline_organizations_all';
      case 'organizations.context':
        return 'offline_organization_context';
      case 'dashboard.stats':
        return 'offline_dashboard_stats';
      default:
        return null;
    }
  }

  String? _offlineInputResponseKey(String prefix, Map<String, dynamic>? input) {
    // Keep cache keys bounded. The same query input maps to the same key,
    // while different filters/searches can never reuse each other's results.
    final encoded = base64Url
        .encode(utf8.encode(jsonEncode(input ?? <String, dynamic>{})))
        .replaceAll('=', '');
    if (encoded.length > 180) return null;
    return '${prefix}_$encoded';
  }

  Future<dynamic> _readOfflineResponse(
    String procedure,
    Map<String, dynamic>? input,
  ) async {
    final key = _offlineResponseKey(procedure, input);
    if (key == null) return null;
    try {
      final raw = await _storage.read(key: key);
      if (raw == null || raw.isEmpty) return null;
      if (raw == _vaultResponseMarker) return await _vault.readJson(key);
      return jsonDecode(raw);
    } catch (_) {
      // A corrupt or inaccessible cache must not prevent normal app startup.
      return null;
    }
  }

  /// Reads a previously successful read-only response without treating it as
  /// the authoritative result. Callers can render it immediately and then
  /// invoke [call] to revalidate it with the server.
  Future<dynamic> readCachedResponse(
    String procedure, {
    Map<String, dynamic>? input,
  }) => _readOfflineResponse(procedure, input);

  Future<void> _writeOfflineResponse(
    String procedure,
    Map<String, dynamic>? input,
    dynamic value,
  ) async {
    final key = _offlineResponseKey(procedure, input);
    if (key == null || value == null) return;
    try {
      final encoded = jsonEncode(value);
      final bytes = utf8.encode(encoded);
      if (bytes.length > _maxVaultResponseBytes) return;
      await _registerOfflineCacheKey(key);
      if (bytes.length > _maxSecureStorageResponseBytes) {
        // Large lists/reports go to the AES-256-GCM vault instead of being
        // dropped, so they stay readable offline without bloating the
        // platform keystore.
        await _vault.write(key, bytes);
        await _storage.write(key: key, value: _vaultResponseMarker);
      } else {
        await _storage.write(key: key, value: encoded);
        await _vault.delete(key);
      }
    } catch (_) {
      // Caching is best-effort; a storage failure must not break online use.
    }
  }

  Future<Map<String, dynamic>> login(String username, String password) async {
    final uri = Uri.parse('$baseUrl/api/trpc/auth.login');
    late final http.Response response;
    try {
      response = await http
          .post(
            uri,
            headers: {
              'content-type': 'application/json',
              'accept': 'application/json',
            },
            body: jsonEncode({
              'json': {'username': username, 'password': password},
            }),
          )
          .timeout(const Duration(seconds: 20));
    } on TimeoutException {
      throw const NetworkException(
        'استغرق الاتصال بالخادم وقتًا أطول من المتوقع',
      );
    } catch (_) {
      throw const NetworkException();
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(response.statusCode, _message(response.body));
    }
    // Do not let a newly authenticated account inherit the previous
    // account's offline responses on a shared device.
    await _clearOfflineCache();
    await clearOrganizationLogoCache();
    final cookie = response.headers['set-cookie'];
    if (cookie != null) {
      await _storage.write(
        key: 'session_cookie',
        value: cookie.split(';').first,
      );
    }
    final decoded = jsonDecode(response.body);
    final data = decoded['result']['data'];
    final account = Map<String, dynamic>.from(data['json'] ?? data);
    await _storage.write(key: 'cached_account', value: jsonEncode(account));
    await _markSessionVerified();
    return account;
  }

  Future<void> _markSessionVerified() => _storage.write(
    key: _sessionVerifiedAtKey,
    value: DateTime.now().toUtc().toIso8601String(),
  );

  /// Opens a saved session without the server. A recently verified session
  /// may open offline; the mandatory app lock (PIN/biometrics) still guards
  /// it. Older sessions must reconnect once so revoked accounts lose access.
  Future<Map<String, dynamic>> _openOfflineSession(
    Map<String, dynamic>? cached,
  ) async {
    if (cached == null) throw const NetworkException();
    if (await _storage.read(key: _sessionVerifiedAtKey) == null) {
      // Sessions created before this check existed get one grace window that
      // starts now instead of being locked out on the first offline launch.
      await _markSessionVerified();
    }
    if (await _offlineSessionStillValid()) return cached;
    throw const NetworkException(
      'انتهت مهلة العمل دون اتصال (7 أيام). اتصل بالإنترنت مرة واحدة للتحقق من الجلسة.',
    );
  }

  /// Whether a saved session is still inside the offline grace window.
  Future<bool> _offlineSessionStillValid() async {
    final raw = await _storage.read(key: _sessionVerifiedAtKey);
    final verifiedAt = raw == null ? null : DateTime.tryParse(raw);
    if (verifiedAt == null) return false;
    final age = DateTime.now().toUtc().difference(verifiedAt.toUtc());
    // A clock moved backwards is not trusted either.
    return !age.isNegative && age <= offlineSessionMaxAge;
  }

  /// Caches downloaded attachment bytes (encrypted) for offline preview.
  Future<void> cacheAttachmentBytes(int attachmentId, List<int> bytes) async {
    if (bytes.isEmpty || bytes.length > maxCachedAttachmentBytes) return;
    try {
      await _vault.write('attachment_$attachmentId', bytes);
    } catch (_) {
      // Offline caching is best-effort.
    }
  }

  Future<Uint8List?> readCachedAttachmentBytes(int attachmentId) =>
      _vault.read('attachment_$attachmentId');

  /// Applies a queued offline edit to the cached telegram detail, lists and
  /// dashboard so the change is visible immediately while offline.
  Future<void> applyLocalTelegramEdit(
    int telegramId,
    Map<String, dynamic> changes,
  ) async {
    final patch = Map<String, dynamic>.from(changes)..remove('id');
    Map<String, dynamic> merge(Map row) => {
      ...Map<String, dynamic>.from(row),
      ...patch,
      'pendingOfflineSync': true,
    };
    bool matches(dynamic row) =>
        row is Map && int.tryParse('${row['id']}') == telegramId;
    dynamic patchValue(dynamic value) {
      if (value is List) {
        return value
            .map((row) => matches(row) ? merge(row as Map) : row)
            .toList();
      }
      if (value is Map) {
        if (matches(value)) return merge(value);
        return value.map(
          (key, inner) =>
              MapEntry(key, inner is List ? patchValue(inner) : inner),
        );
      }
      return value;
    }

    final detail = await _readOfflineResponse('telegrams.get', {
      'id': telegramId,
    });
    if (detail is Map) {
      await _writeOfflineResponse('telegrams.get', {
        'id': telegramId,
      }, merge(detail));
    }
    final keys = await _readKnownOfflineCacheKeys();
    for (final key in keys.where(
      (key) => key.startsWith('offline_telegrams_list_'),
    )) {
      try {
        final raw = await _storage.read(key: key);
        if (raw == null || raw.isEmpty) continue;
        final isVault = raw == _vaultResponseMarker;
        final value = isVault ? await _vault.readJson(key) : jsonDecode(raw);
        if (value == null) continue;
        final patched = patchValue(value);
        if (isVault) {
          await _vault.writeJson(key, patched);
        } else {
          await _storage.write(key: key, value: jsonEncode(patched));
        }
      } catch (_) {
        // A stale list entry is acceptable; the detail view is authoritative.
      }
    }
    final dashboard = await readCachedDashboard();
    if (dashboard != null) {
      await cacheDashboard(
        stats: Map<String, dynamic>.from(
          dashboard['stats'] as Map? ?? const {},
        ),
        telegrams: patchValue(dashboard['telegrams'] ?? const []) as List,
      );
    }
  }

  Future<Map<String, dynamic>?> restoreSession() async {
    final cookie = await _storage.read(key: 'session_cookie');
    if (cookie == null || cookie.trim().isEmpty) return null;

    final cached = await _readCachedAccount();

    try {
      final user = await call('auth.me', allowOfflineCache: false);
      if (user is Map) {
        await _markSessionVerified();
        return Map<String, dynamic>.from(user);
      }
      await _storage.delete(key: 'session_cookie');
      await _storage.delete(key: 'cached_account');
      await clearOrganizationLogoCache();
      return null;
    } on NetworkException {
      return _openOfflineSession(cached);
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await _storage.delete(key: 'session_cookie');
        await _storage.delete(key: 'cached_account');
        await clearOrganizationLogoCache();
        return null;
      }
      // A server outage is not proof that the session expired; treat it like
      // being offline so the field user can keep working from the local copy.
      if (error.statusCode == 408 ||
          error.statusCode == 429 ||
          error.statusCode >= 500) {
        return _openOfflineSession(cached);
      }
      rethrow;
    } catch (_) {
      // A network failure is not proof that the session expired.
      rethrow;
    }
  }

  Future<void> logout() async {
    try {
      await call('auth.logout', mutation: true);
    } finally {
      await _clearOfflineCache();
      await _storage.delete(key: 'session_cookie');
      await _storage.delete(key: 'cached_account');
      await _storage.delete(key: _sessionVerifiedAtKey);
      await clearOrganizationLogoCache();
    }
  }

  Future<void> _clearOfflineCache() async {
    // Invalidate any in-flight outbox sync before deleting its local data.
    // The sync worker checks this epoch before persisting a retry snapshot.
    await _storage.write(
      key: _telegramOutboxEpochKey,
      value: DateTime.now().microsecondsSinceEpoch.toString(),
    );
    await _storage.delete(key: _telegramOutboxKey);
    // Crypto-shred every encrypted offline blob (responses, attachments and
    // queued uploads) by destroying the vault key and its files.
    await _vault.wipe();
    List<String> keysToDelete;
    try {
      final storedValues = await _storage.readAll();
      keysToDelete = storedValues.keys
          .where(
            (key) => key.startsWith('offline_') || key == 'cached_dashboard',
          )
          .toList(growable: false);
    } catch (_) {
      // The registry includes parameterized keys such as list and report
      // responses, which cannot be enumerated when readAll is unavailable.
      keysToDelete = await _readOfflineCacheKeyRegistry();
      keysToDelete.addAll(const [
        'offline_settings',
        'offline_platform_document_settings',
        'offline_routing_directory',
        'offline_organization_descendants',
        'offline_organizations_all',
        'offline_organization_context',
        'offline_dashboard_stats',
        'offline_notifications_inbox',
        'offline_profile',
        'cached_dashboard',
      ]);
    }
    for (final key in keysToDelete.toSet()) {
      try {
        await _storage.delete(key: key);
      } catch (_) {
        // Best-effort cleanup; authentication state is cleared separately.
      }
    }
    try {
      await _storage.delete(key: _offlineCacheKeyRegistry);
    } catch (_) {
      // A stale registry is harmless and will be replaced on the next write.
    }
  }

  Future<void> _registerOfflineCacheKey(String key) async {
    final keys = await _readOfflineCacheKeyRegistry();
    keys.remove(key);
    keys.add(key);
    final excess = keys.length - _maxOfflineCacheKeys;
    final evicted = excess > 0 ? keys.take(excess).toList() : const <String>[];
    final retained = keys.skip(excess > 0 ? excess : 0).toList();
    await _storage.write(
      key: _offlineCacheKeyRegistry,
      value: jsonEncode(retained),
    );
    for (final evictedKey in evicted) {
      await _storage.delete(key: evictedKey);
    }
  }

  Future<List<String>> _readOfflineCacheKeyRegistry() async {
    try {
      final raw = await _storage.read(key: _offlineCacheKeyRegistry);
      if (raw == null || raw.isEmpty) return <String>[];
      final decoded = jsonDecode(raw);
      if (decoded is! List) return <String>[];
      return decoded
          .whereType<String>()
          .where((key) => key.startsWith('offline_'))
          .toSet()
          .toList();
    } catch (_) {
      return <String>[];
    }
  }

  Future<Map<String, dynamic>?> _readCachedAccount() async {
    final raw = await _storage.read(key: 'cached_account');
    if (raw == null || raw.trim().isEmpty) return null;
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null;
    }
  }

  Future<Uint8List?> fetchImageAsset(String source) async {
    final value = source.trim();
    if (value.isEmpty) return null;
    final baseUri = Uri.parse(baseUrl);
    final parsed = Uri.tryParse(value);
    final uri = parsed != null && parsed.hasScheme
        ? parsed
        : baseUri.resolve(value);
    if (!uri.isScheme('http') && !uri.isScheme('https')) return null;

    final headers = <String, String>{'accept': 'image/*'};
    final cookie = await _storage.read(key: 'session_cookie');
    if (cookie != null && cookie.isNotEmpty && uri.origin == baseUri.origin) {
      headers['cookie'] = cookie;
    }

    const retryableStatusCodes = {408, 425, 429, 500, 502, 503, 504};
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        final response = await _httpClient
            .get(uri, headers: headers)
            .timeout(const Duration(seconds: 12));
        if (response.statusCode >= 200 && response.statusCode < 300) {
          final contentType =
              response.headers['content-type']
                  ?.split(';')
                  .first
                  .trim()
                  .toLowerCase() ??
              '';
          final bytes = response.bodyBytes;
          if (!_isSupportedImagePayload(contentType, bytes)) return null;
          return bytes;
        }
        if (!retryableStatusCodes.contains(response.statusCode) ||
            attempt == 2) {
          return null;
        }
      } catch (_) {
        if (attempt == 2) return null;
      }

      // Wi-Fi networks can briefly lose the route to the API while mobile
      // data remains available. Retry transient transport failures without
      // changing hosts or bypassing the authenticated same-origin endpoint.
      await Future<void>.delayed(Duration(milliseconds: 300 * (attempt + 1)));
    }
    return null;
  }

  String organizationLogoCacheIdentity(String source) {
    final value = source.trim();
    if (value.isEmpty) return '';
    final parsed = Uri.tryParse(value);
    final baseUri = Uri.parse(baseUrl);
    final uri = parsed != null && parsed.hasScheme
        ? parsed
        : baseUri.resolve(value);
    if (!uri.isScheme('http') && !uri.isScheme('https')) return '';
    final path = uri.path;
    final port = uri.hasPort ? ':${uri.port}' : '';
    // Query strings can contain expiring storage tokens. The object path is
    // sufficient for cache identity and avoids persisting credentials.
    return '${uri.scheme.toLowerCase()}://${uri.host.toLowerCase()}$port$path';
  }

  String _organizationLogoFileStem(String organizationId) =>
      organizationId.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');

  Future<Directory> _organizationLogoCacheDirectory() =>
      _logoCacheDirectoryFuture ??= _resolveOrganizationLogoCacheDirectory();

  Future<Directory> _resolveOrganizationLogoCacheDirectory() async {
    Directory root;
    try {
      root = imageCacheDirectory ?? await getApplicationSupportDirectory();
    } catch (_) {
      // Preserve best-effort rendering if path_provider is unavailable.
      root = Directory.systemTemp;
    }
    return Directory(
      '${root.path}${Platform.pathSeparator}'
      'police-telegrams-organization-logos',
    );
  }

  Future<void> clearOrganizationLogoCache() async {
    _logoCacheGeneration++;
    _organizationLogoRequests.clear();
    _organizationLogoRefreshes.clear();
    _organizationLogoMemory.clear();
    try {
      final directory = await _organizationLogoCacheDirectory();
      if (await directory.exists()) await directory.delete(recursive: true);
    } catch (_) {
      // Cache cleanup must never block login, logout, or session recovery.
    }
  }

  Future<Uint8List?> fetchOrganizationLogo({
    required String organizationId,
    required String source,
  }) {
    final normalizedOrganizationId = organizationId.trim();
    final identity = organizationLogoCacheIdentity(source);
    if (normalizedOrganizationId.isEmpty) {
      return Future.value(null);
    }
    // The authenticated export endpoint is the authoritative fallback. Some
    // deployments omit logoUrl from organization settings, so an empty source
    // must not prevent that fallback from being attempted.
    final cacheIdentity = identity.isEmpty ? 'api-export' : identity;
    final requestKey = '$normalizedOrganizationId\n$cacheIdentity';
    final memoryEntry = _organizationLogoMemory[requestKey];
    if (memoryEntry != null) {
      if (DateTime.now().difference(memoryEntry.cachedAt) <
          _organizationLogoMemoryTtl) {
        return Future.value(memoryEntry.bytes);
      }
      _scheduleOrganizationLogoRefresh(
        requestKey: requestKey,
        organizationId: normalizedOrganizationId,
        source: source,
        identity: cacheIdentity,
        generation: _logoCacheGeneration,
      );
      return Future.value(memoryEntry.bytes);
    }
    final existing = _organizationLogoRequests[requestKey];
    if (existing != null) return existing;
    final request = _fetchOrganizationLogo(
      requestKey: requestKey,
      organizationId: normalizedOrganizationId,
      source: source,
      identity: cacheIdentity,
      generation: _logoCacheGeneration,
    );
    _organizationLogoRequests[requestKey] = request;
    return request.whenComplete(() {
      _organizationLogoRequests.remove(requestKey);
    });
  }

  /// Persists bytes that were just uploaded and accepted by settings.update.
  ///
  /// This makes the confirmed logo available after the settings screen closes,
  /// even when the current network cannot immediately reload the protected
  /// storage URL. The cache is scoped to both organization and storage path.
  Future<void> cacheOrganizationLogo({
    required String organizationId,
    required String source,
    required Uint8List bytes,
  }) async {
    final normalizedOrganizationId = organizationId.trim();
    if (normalizedOrganizationId.isEmpty ||
        bytes.isEmpty ||
        bytes.length > _maximumCachedOrganizationLogoBytes ||
        !_isSupportedImagePayload('', bytes)) {
      throw ArgumentError('Invalid organization logo cache payload');
    }

    final sourceIdentity = organizationLogoCacheIdentity(source);
    final identity = sourceIdentity.isEmpty ? 'api-export' : sourceIdentity;
    final requestKey = '$normalizedOrganizationId\n$identity';
    final generation = _logoCacheGeneration;
    final copiedBytes = Uint8List.fromList(bytes);

    try {
      final cacheDirectory = await _organizationLogoCacheDirectory();
      await cacheDirectory.create(recursive: true);
      final fileStem = _organizationLogoFileStem(normalizedOrganizationId);
      final imageFile = File(
        '${cacheDirectory.path}${Platform.pathSeparator}$fileStem.bin',
      );
      final metadataFile = File(
        '${cacheDirectory.path}${Platform.pathSeparator}$fileStem.json',
      );
      final temporaryImage = File('${imageFile.path}.tmp');
      final temporaryMetadata = File('${metadataFile.path}.tmp');

      await temporaryImage.writeAsBytes(copiedBytes, flush: true);
      await temporaryMetadata.writeAsString(
        jsonEncode({
          'identity': identity,
          'cachedAt': DateTime.now().toIso8601String(),
        }),
        flush: true,
      );
      if (generation != _logoCacheGeneration) {
        try {
          await temporaryImage.delete();
        } catch (_) {}
        try {
          await temporaryMetadata.delete();
        } catch (_) {}
        return;
      }

      await temporaryImage.rename(imageFile.path);
      await temporaryMetadata.rename(metadataFile.path);
    } catch (_) {
      // Local persistence is best-effort. A valid, server-confirmed upload
      // must remain visible in this session even if device storage is busy.
    }

    if (generation != _logoCacheGeneration) return;
    _organizationLogoMemory[requestKey] = _OrganizationLogoCacheEntry(
      copiedBytes,
      DateTime.now(),
    );
  }

  Future<Uint8List?> _fetchOrganizationLogo({
    required String requestKey,
    required String organizationId,
    required String source,
    required String identity,
    required int generation,
  }) async {
    final fileStem = _organizationLogoFileStem(organizationId);
    final cacheDirectory = await _organizationLogoCacheDirectory();
    final imageFile = File(
      '${cacheDirectory.path}${Platform.pathSeparator}$fileStem.bin',
    );
    final metadataFile = File(
      '${cacheDirectory.path}${Platform.pathSeparator}$fileStem.json',
    );
    Uint8List? staleBytes;

    try {
      final metadata = jsonDecode(await metadataFile.readAsString());
      if (metadata is Map && metadata['identity'] == identity) {
        final bytes = await imageFile.readAsBytes();
        if (bytes.isNotEmpty &&
            bytes.length <= _maximumCachedOrganizationLogoBytes &&
            _isSupportedImagePayload('', Uint8List.fromList(bytes))) {
          staleBytes = Uint8List.fromList(bytes);
        }
      }
    } catch (_) {
      // A missing, incomplete, or expired cache is fetched below.
    }

    if (generation != _logoCacheGeneration) return null;
    if (staleBytes != null) {
      _organizationLogoMemory[requestKey] = _OrganizationLogoCacheEntry(
        staleBytes,
        DateTime.now().subtract(_organizationLogoMemoryTtl),
      );
      // Stale-while-revalidate: render the verified, organization-scoped
      // local logo now; refresh storage and memory without blocking the UI.
      _scheduleOrganizationLogoRefresh(
        requestKey: requestKey,
        organizationId: organizationId,
        source: source,
        identity: identity,
        generation: generation,
      );
      return staleBytes;
    }

    return _refreshOrganizationLogo(
      requestKey: requestKey,
      organizationId: organizationId,
      source: source,
      identity: identity,
      generation: generation,
      imageFile: imageFile,
      metadataFile: metadataFile,
    );
  }

  void _scheduleOrganizationLogoRefresh({
    required String requestKey,
    required String organizationId,
    required String source,
    required String identity,
    required int generation,
  }) {
    if (_organizationLogoRefreshes.containsKey(requestKey)) return;
    final refresh = () async {
      final cacheDirectory = await _organizationLogoCacheDirectory();
      final fileStem = _organizationLogoFileStem(organizationId);
      await _refreshOrganizationLogo(
        requestKey: requestKey,
        organizationId: organizationId,
        source: source,
        identity: identity,
        generation: generation,
        imageFile: File(
          '${cacheDirectory.path}${Platform.pathSeparator}$fileStem.bin',
        ),
        metadataFile: File(
          '${cacheDirectory.path}${Platform.pathSeparator}$fileStem.json',
        ),
      );
    }();
    _organizationLogoRefreshes[requestKey] = refresh;
    unawaited(
      refresh.whenComplete(() {
        _organizationLogoRefreshes.remove(requestKey);
      }),
    );
  }

  Future<Uint8List?> _refreshOrganizationLogo({
    required String requestKey,
    required String organizationId,
    required String source,
    required String identity,
    required int generation,
    required File imageFile,
    required File metadataFile,
  }) async {
    // Prefer the authenticated organization-scoped export endpoint. It reads
    // the logo from the signed-in organization's storage and avoids stale or
    // inaccessible CDN/storage URLs on mobile clients.
    Uint8List? bytes = await _fetchOrganizationLogoFromApi(organizationId);
    if (bytes == null || bytes.isEmpty) {
      // Keep a same-origin/storage URL fallback for older servers that do not
      // yet return inline logo bytes from the authenticated export endpoint.
      bytes = await fetchImageAsset(source);
    }
    if (generation != _logoCacheGeneration) return null;
    if (bytes == null ||
        bytes.isEmpty ||
        bytes.length > _maximumCachedOrganizationLogoBytes) {
      return _organizationLogoMemory[requestKey]?.bytes;
    }

    if (bytes.length <= _maximumCachedOrganizationLogoBytes) {
      try {
        if (generation != _logoCacheGeneration) return null;
        final cacheDirectory = await _organizationLogoCacheDirectory();
        await cacheDirectory.create(recursive: true);
        final temporaryImage = File('${imageFile.path}.tmp');
        final temporaryMetadata = File('${metadataFile.path}.tmp');
        await temporaryImage.writeAsBytes(bytes, flush: true);
        await temporaryMetadata.writeAsString(
          jsonEncode({
            'identity': identity,
            'cachedAt': DateTime.now().toIso8601String(),
          }),
          flush: true,
        );
        if (generation != _logoCacheGeneration) return null;
        await temporaryImage.rename(imageFile.path);
        await temporaryMetadata.rename(metadataFile.path);
      } catch (_) {
        // A writable cache must not be required for a valid remote logo.
      }
    }
    if (generation != _logoCacheGeneration) return null;
    final copiedBytes = Uint8List.fromList(bytes);
    _organizationLogoMemory[requestKey] = _OrganizationLogoCacheEntry(
      copiedBytes,
      DateTime.now(),
    );
    return copiedBytes;
  }

  Future<Uint8List?> _fetchOrganizationLogoFromApi(
    String organizationId,
  ) async {
    try {
      final result = await call(
        'organizations.logoForExport',
        input: {'organizationId': organizationId},
        allowOfflineCache: false,
      );
      if (result is! Map ||
          result['organizationId']?.toString() != organizationId) {
        return null;
      }
      // New server responses expose only a protected binary URL. Fetch its
      // bytes with the authenticated session instead of transporting Base64
      // inside the tRPC JSON response.
      final logoUrl = result['logoUrl']?.toString().trim() ?? '';
      if (logoUrl.isNotEmpty) {
        final binaryBytes = await fetchImageAsset(logoUrl);
        if (binaryBytes != null &&
            binaryBytes.isNotEmpty &&
            binaryBytes.length <= _maximumCachedOrganizationLogoBytes &&
            _isSupportedImagePayload('', binaryBytes)) {
          return binaryBytes;
        }
      }

      // Current servers expose the authenticated binary image endpoint.
      // Reject legacy JSON data URLs instead of reintroducing Base64 image
      // transport into the mobile logo pipeline.
      return null;
    } catch (_) {
      // The same-origin byte route remains the primary path; this fallback is
      // best-effort and must not prevent settings or telegram screens opening.
      return null;
    }
  }

  bool _isSupportedImagePayload(String contentType, Uint8List bytes) {
    // Some object-storage/CDN responses use application/octet-stream even
    // when the stored object is a valid image. Verify its file signature
    // before accepting that generic content type; never treat HTML/error
    // responses as images.
    bool startsWith(List<int> signature) {
      if (bytes.length < signature.length) return false;
      for (var index = 0; index < signature.length; index++) {
        if (bytes[index] != signature[index]) return false;
      }
      return true;
    }

    final isPng = startsWith(const [
      0x89,
      0x50,
      0x4E,
      0x47,
      0x0D,
      0x0A,
      0x1A,
      0x0A,
    ]);
    final isJpeg = startsWith(const [0xFF, 0xD8, 0xFF]);
    final isGif =
        startsWith(const [0x47, 0x49, 0x46, 0x38]) &&
        bytes.length >= 6 &&
        (bytes[4] == 0x37 || bytes[4] == 0x39) &&
        bytes[5] == 0x61;
    final isWebp =
        bytes.length >= 12 &&
        startsWith(const [0x52, 0x49, 0x46, 0x46]) &&
        bytes[8] == 0x57 &&
        bytes[9] == 0x45 &&
        bytes[10] == 0x42 &&
        bytes[11] == 0x50;

    switch (contentType) {
      case 'image/png':
        return isPng;
      case 'image/jpeg':
      case 'image/jpg':
        return isJpeg;
      case 'image/gif':
        return isGif;
      case 'image/webp':
        return isWebp;
      case '':
      case 'application/octet-stream':
      case 'binary/octet-stream':
        return isPng || isJpeg || isGif || isWebp;
      default:
        return false;
    }
  }

  Future<void> cacheDashboard({
    required Map<String, dynamic> stats,
    required List<dynamic> telegrams,
  }) async {
    await _storage.write(
      key: 'cached_dashboard',
      value: jsonEncode({'stats': stats, 'telegrams': telegrams}),
    );
  }

  Future<Map<String, dynamic>?> readCachedDashboard() async {
    final raw = await _storage.read(key: 'cached_dashboard');
    if (raw == null || raw.trim().isEmpty) return null;
    try {
      final value = jsonDecode(raw);
      return value is Map ? Map<String, dynamic>.from(value) : null;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>> uploadOrganizationLogo({
    required String organizationId,
    required String fileName,
    required String contentType,
    required Uint8List bytes,
  }) async {
    if (contentType != 'image/png' && contentType != 'image/jpeg') {
      throw const ApiException(415, 'صيغة الشعار يجب أن تكون PNG أو JPG');
    }
    if (bytes.isEmpty || bytes.length > 2621440) {
      throw const ApiException(
        413,
        'حجم الشعار بعد التجهيز يجب ألا يتجاوز 2.5 ميغابايت',
      );
    }

    final cookie = await _storage.read(key: 'session_cookie');
    final uri = Uri.parse('$baseUrl/api/storage/department-logo');
    final headers = <String, String>{
      'content-type': contentType,
      'accept': 'application/json',
      'x-organization-id': organizationId,
      'x-file-name': Uri.encodeComponent(fileName),
    };
    if (cookie != null) headers['cookie'] = cookie;

    late final http.Response response;
    try {
      response = await _httpClient
          .put(uri, headers: headers, body: bytes)
          .timeout(const Duration(seconds: 30));
    } catch (error) {
      if (error is IOException ||
          error is http.ClientException ||
          error is TimeoutException) {
        throw const NetworkException();
      }
      rethrow;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(response.statusCode, _message(response.body));
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map ||
        decoded['key'] is! String ||
        decoded['url'] is! String) {
      throw const ApiException(502, 'استجابة الخادم لرفع الشعار غير صالحة');
    }
    return Map<String, dynamic>.from(decoded);
  }

  String _message(String body) {
    try {
      final data = jsonDecode(body);
      if (data is Map) {
        final error = data['error'];
        if (error is String && error.trim().isNotEmpty) return error;
        if (error is Map) {
          return error['json']?['message']?.toString() ??
              error['message']?.toString() ??
              'تعذر الاتصال بالخادم';
        }
      }
      return 'تعذر الاتصال بالخادم';
    } catch (_) {
      return 'تعذر الاتصال بالخادم';
    }
  }
}
