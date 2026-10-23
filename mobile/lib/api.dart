import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

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

class PoliceApi {
  PoliceApi({
    String? baseUrl,
    http.Client? httpClient,
    Directory? imageCacheDirectory,
  }) : baseUrl =
           baseUrl ??
           const String.fromEnvironment(
             'API_BASE_URL',
             defaultValue: 'https://police-telegrams-platform.vercel.app',
           ),
       _httpClient = httpClient ?? _sharedHttpClient,
       _imageCacheDirectory = imageCacheDirectory ?? Directory.systemTemp;

  static final http.Client _sharedHttpClient = http.Client();
  static const _organizationLogoCacheLifetime = Duration(days: 7);
  static const _maximumCachedOrganizationLogoBytes = 5 * 1024 * 1024;

  final String baseUrl;
  final http.Client _httpClient;
  final Directory _imageCacheDirectory;
  final _storage = const FlutterSecureStorage();
  final Map<String, Future<Uint8List?>> _organizationLogoRequests = {};

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
                  ? http.post(
                      uri,
                      headers: headers,
                      body: jsonEncode({'json': input}),
                    )
                  : http.get(uri, headers: headers))
              .timeout(
                Duration(
                  seconds: procedure == 'telegrams.importWorkbookPreview'
                      ? 90
                      : 8,
                ),
              );
    } catch (_) {
      if (!mutation && allowOfflineCache) {
        final cached = await _readOfflineResponse(procedure, input);
        if (cached != null) return cached;
      }
      throw const NetworkException();
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
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
            headers: {'content-type': 'application/json'},
            body: jsonEncode({
              'json': {'username': username, 'password': password},
            }),
          )
          .timeout(const Duration(seconds: 8));
    } catch (_) {
      throw const NetworkException();
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(response.statusCode, _message(response.body));
    }
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
      return null;
    } on NetworkException {
      // A cached authenticated session is sufficient to open the app offline.
      if (cached != null) return cached;
      rethrow;
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await _storage.delete(key: 'session_cookie');
        await _storage.delete(key: 'cached_account');
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
      await _storage.delete(key: 'session_cookie');
      await _storage.delete(key: 'cached_account');
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
    final isSignedStorageUrl =
        path.contains('/storage/v1/object/sign/') ||
        path.startsWith('/api/storage/department/logos/');
    final query = isSignedStorageUrl ? '' : uri.query;
    final port = uri.hasPort ? ':${uri.port}' : '';
    return '${uri.scheme.toLowerCase()}://${uri.host.toLowerCase()}$port$path'
        '${query.isEmpty ? '' : '?$query'}';
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
    final existing = _organizationLogoRequests[requestKey];
    if (existing != null) return existing;

    final request = _fetchOrganizationLogo(
      organizationId: normalizedOrganizationId,
      source: source,
      identity: identity,
    );
    _organizationLogoRequests[requestKey] = request;
    return request.whenComplete(() {
      _organizationLogoRequests.remove(requestKey);
    });
  }

  Future<Uint8List?> _fetchOrganizationLogo({
    required String organizationId,
    required String source,
    required String identity,
  }) async {
    final fileStem = base64Url
        .encode(utf8.encode(organizationId))
        .replaceAll('=', '');
    final cacheDirectory = Directory(
      '${_imageCacheDirectory.path}${Platform.pathSeparator}'
      'police-telegrams-organization-logos',
    );
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
            bytes.length <= _maximumCachedOrganizationLogoBytes) {
          staleBytes = Uint8List.fromList(bytes);
          final cachedAt = DateTime.tryParse(
            metadata['cachedAt']?.toString() ?? '',
          );
          if (cachedAt != null &&
              DateTime.now().difference(cachedAt) <
                  _organizationLogoCacheLifetime) {
            return staleBytes;
          }
        }
      }
    } catch (_) {
      // A missing, incomplete, or expired cache is refreshed below.
    }

    final bytes = await fetchImageAsset(source);
    if (bytes == null || bytes.isEmpty) return staleBytes;
    if (bytes.length <= _maximumCachedOrganizationLogoBytes) {
      try {
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
        await temporaryImage.rename(imageFile.path);
        await temporaryMetadata.rename(metadataFile.path);
      } catch (_) {
        // Image caching is best-effort; a writable cache must not be required
        // for a valid organization logo to render.
      }
    }
    return bytes;
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
