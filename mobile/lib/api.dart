import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

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

class _OrganizationLogoCacheEntry {
  const _OrganizationLogoCacheEntry(this.bytes, this.cachedAt);

  final Uint8List bytes;
  final DateTime cachedAt;
}

class PoliceApi {
  static const _offlineCacheKeyRegistry = 'offline_cache_key_registry_v1';
  static const _maxOfflineCacheKeys = 128;

  PoliceApi({
    String? baseUrl,
    http.Client? httpClient,
    this.imageCacheDirectory,
  }) : baseUrl =
           baseUrl ??
           const String.fromEnvironment(
             'API_BASE_URL',
             defaultValue: 'https://police-telegrams-platform.vercel.app',
           ),
       _httpClient = httpClient ?? _sharedHttpClient;

  static final http.Client _sharedHttpClient = http.Client();
  static const _maximumCachedOrganizationLogoBytes = 5 * 1024 * 1024;

  final String baseUrl;
  final http.Client _httpClient;
  final Directory? imageCacheDirectory;
  final _storage = const FlutterSecureStorage();
  final Map<String, Future<Uint8List?>> _organizationLogoRequests = {};
  final Map<String, Future<void>> _organizationLogoRefreshes = {};
  final Map<String, _OrganizationLogoCacheEntry> _organizationLogoMemory = {};
  Future<Directory>? _logoCacheDirectoryFuture;
  int _logoCacheGeneration = 0;

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
    } else if (procedure == 'platformDocumentSettings.update') {
      await _writeOfflineResponse('platformDocumentSettings.get', null, value);
    }
    return value;
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
      // Avoid filling secure storage with unusually large server responses.
      if (utf8.encode(encoded).length > 512 * 1024) return;
      await _registerOfflineCacheKey(key);
      await _storage.write(key: key, value: encoded);
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
    return account;
  }

  Future<Map<String, dynamic>?> restoreSession() async {
    final cookie = await _storage.read(key: 'session_cookie');
    if (cookie == null || cookie.trim().isEmpty) return null;

    final cached = await _readCachedAccount();

    try {
      final user = await call('auth.me');
      if (user is Map) return Map<String, dynamic>.from(user);
      await _storage.delete(key: 'session_cookie');
      await _storage.delete(key: 'cached_account');
      await clearOrganizationLogoCache();
      return null;
    } on NetworkException {
      // A cached authenticated session is sufficient to open the app offline.
      if (cached != null) return cached;
      rethrow;
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await _storage.delete(key: 'session_cookie');
        await _storage.delete(key: 'cached_account');
        await clearOrganizationLogoCache();
        return null;
      }
      // A server or network failure is not proof that the session expired.
      // Keep the cookie so the next launch can retry without forcing login.
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
      await clearOrganizationLogoCache();
    }
  }

  Future<void> _clearOfflineCache() async {
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
    final headers = <String, String>{};
    final cookie = await _storage.read(key: 'session_cookie');
    if (cookie != null && cookie.isNotEmpty && uri.origin == baseUri.origin) {
      headers['cookie'] = cookie;
    }
    late final http.Response response;
    try {
      response = await _httpClient
          .get(uri, headers: headers)
          .timeout(const Duration(seconds: 8));
    } catch (_) {
      return null;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) return null;
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
    if (normalizedOrganizationId.isEmpty || identity.isEmpty) {
      return Future.value(null);
    }
    final requestKey = '$normalizedOrganizationId\n$identity';
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
        identity: identity,
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
      identity: identity,
      generation: _logoCacheGeneration,
    );
    _organizationLogoRequests[requestKey] = request;
    return request.whenComplete(() {
      _organizationLogoRequests.remove(requestKey);
    });
  }

  Future<Uint8List?> _fetchOrganizationLogo({
    required String requestKey,
    required String organizationId,
    required String source,
    required String identity,
    required int generation,
  }) async {
    final fileStem = base64Url
        .encode(utf8.encode(organizationId))
        .replaceAll('=', '');
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
      final fileStem = base64Url
          .encode(utf8.encode(organizationId))
          .replaceAll('=', '');
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
    Uint8List? bytes = await fetchImageAsset(source);
    if (bytes == null || bytes.isEmpty) {
      // Authenticated API fallback for storage routes unavailable to the
      // device's image client.
      bytes = await _fetchOrganizationLogoFromApi(organizationId);
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
      final dataUrl = result['logoDataUrl']?.toString().trim() ?? '';
      final match = RegExp(
        r'^data:(image/(?:png|jpeg|webp));base64,',
        caseSensitive: false,
      ).firstMatch(dataUrl);
      final contentType = match?.group(1);
      if (match == null || contentType == null) return null;

      final bytes = Uint8List.fromList(
        base64Decode(dataUrl.substring(match.end)),
      );
      if (bytes.isEmpty ||
          bytes.length > _maximumCachedOrganizationLogoBytes ||
          !_isSupportedImagePayload(contentType, bytes)) {
        return null;
      }
      return bytes;
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
