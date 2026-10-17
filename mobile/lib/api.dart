import 'dart:convert';
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
  PoliceApi({String? baseUrl})
    : baseUrl =
          baseUrl ??
          const String.fromEnvironment(
            'API_BASE_URL',
            defaultValue: 'https://police-telegrams-platform.vercel.app',
          );
  final String baseUrl;
  final _storage = const FlutterSecureStorage();

  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
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
      response = await (mutation
              ? http.post(
                  uri,
                  headers: headers,
                  body: jsonEncode({'json': input}),
                )
              : http.get(uri, headers: headers))
          .timeout(const Duration(seconds: 8));
    } catch (_) {
      throw const NetworkException();
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(response.statusCode, _message(response.body));
    }
    final decoded = jsonDecode(response.body);
    final result = decoded is Map ? decoded['result'] : null;
    final data = result is Map ? result['data'] : null;
    return data is Map && data.containsKey('json') ? data['json'] : data;
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
    final response = await http.get(uri, headers: headers);
    if (response.statusCode < 200 || response.statusCode >= 300) return null;
    final contentType =
        response.headers['content-type']
            ?.split(';')
            .first
            .trim()
            .toLowerCase() ??
        '';
    if (!const {
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
    }.contains(contentType)) {
      return null;
    }
    return response.bodyBytes;
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
