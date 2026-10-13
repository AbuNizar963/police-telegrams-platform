import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

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
      throw Exception(_message(response.body));
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
      throw Exception(_message(response.body));
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

  Future<void> logout() async {
    try {
      await call('auth.logout', mutation: true);
    } finally {
      await _storage.delete(key: 'session_cookie');
    }
  }

  String _message(String body) {
    try {
      final data = jsonDecode(body);
      return data['error']?['json']?['message']?.toString() ??
          data['error']?['message']?.toString() ??
          'تعذر الاتصال بالخادم';
    } catch (_) {
      return 'تعذر الاتصال بالخادم';
    }
  }
}
