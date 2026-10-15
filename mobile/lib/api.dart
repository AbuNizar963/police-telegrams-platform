import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

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
    final response = mutation
        ? await http.post(
            uri,
            headers: headers,
            body: jsonEncode({'json': input}),
          )
        : await http.get(uri, headers: headers);
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
    final response = await http.post(
      uri,
      headers: {'content-type': 'application/json'},
      body: jsonEncode({
        'json': {'username': username, 'password': password},
      }),
    );
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
    return Map<String, dynamic>.from(data['json'] ?? data);
  }

  Future<Map<String, dynamic>?> restoreSession() async {
    final cookie = await _storage.read(key: 'session_cookie');
    if (cookie == null || cookie.trim().isEmpty) return null;

    try {
      final user = await call('auth.me');
      if (user is Map) return Map<String, dynamic>.from(user);
      await _storage.delete(key: 'session_cookie');
      return null;
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await _storage.delete(key: 'session_cookie');
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
    }
  }

  Future<Uint8List> renderTelegramDocument(
    String html, {
    required String format,
  }) async {
    if (format != 'pdf' && format != 'png') {
      throw ArgumentError.value(format, 'format', 'Expected pdf or png');
    }
    final cookie = await _storage.read(key: 'session_cookie');
    final headers = <String, String>{
      'content-type': 'application/json',
      'accept': format == 'pdf' ? 'application/pdf' : 'image/png',
    };
    if (cookie != null && cookie.isNotEmpty) headers['cookie'] = cookie;
    final response = await http.post(
      Uri.parse('$baseUrl/api/telegram-render'),
      headers: headers,
      body: jsonEncode({'format': format, 'html': html}),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        response.statusCode,
        _message(utf8.decode(response.bodyBytes, allowMalformed: true)),
      );
    }
    final contentType = response.headers['content-type']?.toLowerCase() ?? '';
    final expectedType = format == 'pdf' ? 'application/pdf' : 'image/png';
    if (!contentType.startsWith(expectedType)) {
      throw const ApiException(502, 'استجابة إنشاء الوثيقة غير صالحة');
    }
    return response.bodyBytes;
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
