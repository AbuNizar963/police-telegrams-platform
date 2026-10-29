import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:police_telegrams/api.dart';

final _secureStorageForTest = <String, String>{};
var _failSecureStorageReadAll = false;

Future<T> _withOfflineCacheContext<T>(
  String operation,
  Future<T> Function() action,
) async {
  try {
    return await action();
  } on NetworkException catch (error) {
    final cacheKeys =
        _secureStorageForTest.keys
            .where((key) => key.startsWith('offline_'))
            .toList(growable: false)
          ..sort();
    throw StateError(
      '$operation could not read its cached response: $error. '
      'Available offline cache keys: ${cacheKeys.join(', ')}',
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    _secureStorageForTest.clear();
    _failSecureStorageReadAll = false;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
          (call) async {
            final arguments = call.arguments;
            final key = arguments is Map ? arguments['key'] as String? : null;
            switch (call.method) {
              case 'read':
                return key == null ? null : _secureStorageForTest[key];
              case 'write':
                if (key != null && arguments is Map) {
                  _secureStorageForTest[key] = arguments['value'] as String;
                }
                return null;
              case 'delete':
                if (key != null) _secureStorageForTest.remove(key);
                return null;
              case 'deleteAll':
                _secureStorageForTest.clear();
                return null;
              case 'readAll':
                if (_failSecureStorageReadAll) {
                  throw PlatformException(code: 'read_all_unavailable');
                }
                return Map<String, String>.from(_secureStorageForTest);
              default:
                return null;
            }
          },
        );
  });

  test(
    'critical platform document reads ignore stale cached settings',
    () async {
      var offline = false;
      final client = MockClient((request) async {
        if (offline) throw const SocketException('offline');
        return http.Response(
          jsonEncode({
            'result': {
              'data': {
                'json': {
                  'showMinistryWatermarkText': false,
                  'watermarkOpacityPercent': 35,
                  'headerDividerColor': '#2457A6',
                  'showVerificationQr': false,
                },
              },
            },
          }),
          200,
        );
      });
      addTearDown(client.close);
      final api = PoliceApi(
        baseUrl: 'https://police.example.test',
        httpClient: client,
      );
      await api.call('platformDocumentSettings.get');

      offline = true;
      expect(await api.call('platformDocumentSettings.get'), isA<Map>());
      await expectLater(
        api.call('platformDocumentSettings.get', allowOfflineCache: false),
        throwsA(isA<NetworkException>()),
      );
    },
  );

  test(
    'read-only lists, reports, notifications, and profile work offline',
    () async {
      var offline = false;
      final client = MockClient((request) async {
        if (offline) throw const SocketException('offline');
        final path = request.url.path;
        final value = path.endsWith('/notifications.inbox')
            ? <dynamic>[
                {'id': 3, 'title': 'إشعار محفوظ'},
              ]
            : path.endsWith('/profile.get')
            ? <String, dynamic>{'name': 'مشغل محفوظ'}
            : path.endsWith('/reports.telegrams')
            ? <String, dynamic>{'total': 4, 'items': <dynamic>[]}
            : <String, dynamic>{
                'items': [
                  {'id': 7, 'subject': 'برقية محفوظة'},
                ],
              };
        return http.Response.bytes(
          utf8.encode(
            jsonEncode({
              'result': {
                'data': {'json': value},
              },
            }),
          ),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
      addTearDown(client.close);
      final api = PoliceApi(
        baseUrl: 'https://police.example.test',
        httpClient: client,
      );
      final listInput = {'status': 'all', 'page': 1};
      final reportInput = {'from': '2026-10-01', 'to': '2026-10-23'};
      await _withOfflineCacheContext(
        'telegrams.list online seed',
        () => api.call('telegrams.list', input: listInput),
      );
      expect(
        _secureStorageForTest.keys.any(
          (key) => key.startsWith('offline_telegrams_list_'),
        ),
        isTrue,
        reason: 'The successful telegram list response should be cached.',
      );
      await _withOfflineCacheContext(
        'reports.telegrams online seed',
        () => api.call('reports.telegrams', input: reportInput),
      );
      expect(
        _secureStorageForTest.keys.any(
          (key) => key.startsWith('offline_telegram_report_'),
        ),
        isTrue,
        reason: 'The successful report response should be cached.',
      );
      await _withOfflineCacheContext(
        'notifications.inbox online seed',
        () => api.call('notifications.inbox'),
      );
      expect(
        _secureStorageForTest.containsKey('offline_notifications_inbox'),
        isTrue,
      );
      await _withOfflineCacheContext(
        'profile.get online seed',
        () => api.call('profile.get'),
      );
      expect(_secureStorageForTest.containsKey('offline_profile'), isTrue);

      offline = true;
      expect(
        (await _withOfflineCacheContext(
          'telegrams.list offline read',
          () => api.call('telegrams.list', input: listInput),
        ))['items'],
        hasLength(1),
      );
      final reportResult = await _withOfflineCacheContext(
        'reports.telegrams offline read',
        () => api.call('reports.telegrams', input: reportInput),
      );
      expect(reportResult['total'], 4);
      expect(
        await _withOfflineCacheContext(
          'notifications.inbox offline read',
          () => api.call('notifications.inbox'),
        ),
        hasLength(1),
      );
      expect(
        (await _withOfflineCacheContext(
          'profile.get offline read',
          () => api.call('profile.get'),
        ))['name'],
        'مشغل محفوظ',
      );
      await expectLater(
        api.call('telegrams.list', input: {'status': 'urgent', 'page': 1}),
        throwsA(isA<NetworkException>()),
      );
    },
  );

  test(
    'transient server errors use cached reads but auth errors do not',
    () async {
      var statusCode = 200;
      final client = MockClient((request) async {
        if (statusCode != 200) {
          return http.Response(
            statusCode == 503 ? 'service unavailable' : 'unauthorized',
            statusCode,
          );
        }
        return http.Response.bytes(
          utf8.encode(
            jsonEncode({
              'result': {
                'data': {
                  'json': {'departmentName': 'قسم محفوظ'},
                },
              },
            }),
          ),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
      addTearDown(client.close);
      final api = PoliceApi(
        baseUrl: 'https://police.example.test',
        httpClient: client,
      );
      await _withOfflineCacheContext(
        'settings.get online seed',
        () => api.call('settings.get'),
      );

      statusCode = 503;
      expect(
        (await _withOfflineCacheContext(
          'settings.get fallback after HTTP 503',
          () => api.call('settings.get'),
        ))['departmentName'],
        'قسم محفوظ',
      );

      statusCode = 401;
      await expectLater(api.call('settings.get'), throwsA(isA<ApiException>()));
    },
  );

  test('logout clears the persistent organization logo cache', () async {
    final cacheRoot = await Directory.systemTemp.createTemp(
      'police-telegrams-logo-logout-test-',
    );
    addTearDown(() => cacheRoot.delete(recursive: true));
    final logoCacheDirectory = Directory(
      '${cacheRoot.path}${Platform.pathSeparator}'
      'police-telegrams-organization-logos',
    );
    await logoCacheDirectory.create(recursive: true);
    await File(
      '${logoCacheDirectory.path}${Platform.pathSeparator}cached-logo.bin',
    ).writeAsBytes([1, 2, 3]);

    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({
          'result': {
            'data': {'json': null},
          },
        }),
        200,
      );
    });
    addTearDown(client.close);
    final api = PoliceApi(
      baseUrl: 'https://police.example.test',
      httpClient: client,
      imageCacheDirectory: cacheRoot,
    );

    await api.logout();

    expect(await logoCacheDirectory.exists(), isFalse);
  });

  test('organization logo cache identities never persist URL query tokens', () {
    final api = PoliceApi(baseUrl: 'https://police.example.test');
    expect(
      api.organizationLogoCacheIdentity(
        'https://police.example.test/api/storage/department/logos/logo.png?token=secret',
      ),
      'https://police.example.test/api/storage/department/logos/logo.png',
    );
  });

  test('logout clears offline caches and preserves the outbox', () async {
    _secureStorageForTest['session_cookie'] = 'session=value';
    _secureStorageForTest['offline_settings'] = '{"departmentName":"old"}';
    _secureStorageForTest['offline_telegrams_list_e30'] = '{"items":[]}';
    _secureStorageForTest['cached_dashboard'] = '{"stats":{},"telegrams":[]}';
    _secureStorageForTest['telegram_outbox_v1'] = '[{"id":"queued"}]';

    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({
          'result': {
            'data': {'json': null},
          },
        }),
        200,
      );
    });
    addTearDown(client.close);
    final api = PoliceApi(
      baseUrl: 'https://police.example.test',
      httpClient: client,
    );

    await api.logout();

    expect(_secureStorageForTest.containsKey('session_cookie'), isFalse);
    expect(_secureStorageForTest.containsKey('offline_settings'), isFalse);
    expect(
      _secureStorageForTest.containsKey('offline_telegrams_list_e30'),
      isFalse,
    );
    expect(_secureStorageForTest.containsKey('cached_dashboard'), isFalse);
    expect(_secureStorageForTest.containsKey('telegram_outbox_v1'), isTrue);
  });

  test('logout clears dynamic offline caches when readAll fails', () async {
    const dynamicCacheKey = 'offline_telegrams_list_eyJwYWdlIjoxfQ';
    _secureStorageForTest['session_cookie'] = 'session=value';
    _secureStorageForTest[dynamicCacheKey] = '{"items":[]}';
    _secureStorageForTest['offline_cache_key_registry_v1'] = jsonEncode([
      dynamicCacheKey,
    ]);
    _failSecureStorageReadAll = true;

    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({
          'result': {
            'data': {'json': null},
          },
        }),
        200,
      );
    });
    addTearDown(client.close);
    final api = PoliceApi(
      baseUrl: 'https://police.example.test',
      httpClient: client,
    );

    await api.logout();

    expect(_secureStorageForTest.containsKey(dynamicCacheKey), isFalse);
    expect(
      _secureStorageForTest.containsKey('offline_cache_key_registry_v1'),
      isFalse,
    );
    expect(_secureStorageForTest.containsKey('session_cookie'), isFalse);
  });

  test('organization logo is reused when a signed URL token rotates', () async {
    final cacheDirectory = await Directory.systemTemp.createTemp(
      'police-telegrams-logo-test-',
    );
    addTearDown(() => cacheDirectory.delete(recursive: true));
    final imageBytes = Uint8List.fromList(
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
      ),
    );
    var networkRequests = 0;
    final firstClient = MockClient((request) async {
      networkRequests++;
      return http.Response.bytes(
        imageBytes,
        200,
        headers: {'content-type': 'image/png'},
      );
    });
    addTearDown(firstClient.close);

    final firstApi = PoliceApi(
      httpClient: firstClient,
      imageCacheDirectory: cacheDirectory,
    );
    const organizationId = '550e8400-e29b-41d4-a716-446655440000';
    const firstUrl =
        'https://storage.example.test/storage/v1/object/sign/logos/department.png?token=first';
    const renewedUrl =
        'https://storage.example.test/storage/v1/object/sign/logos/department.png?token=renewed';

    expect(
      await firstApi.fetchOrganizationLogo(
        organizationId: organizationId,
        source: firstUrl,
      ),
      imageBytes,
    );
    expect(
      await firstApi.fetchOrganizationLogo(
        organizationId: organizationId,
        source: renewedUrl,
      ),
      imageBytes,
    );
    // Revalidate even when a renewed signed URL points to the same object path.
    expect(networkRequests, 2);

    var secondClientRequests = 0;
    final secondClient = MockClient((request) async {
      secondClientRequests++;
      return http.Response('unexpected cache miss', 500);
    });
    addTearDown(secondClient.close);
    final nextLaunchApi = PoliceApi(
      httpClient: secondClient,
      imageCacheDirectory: cacheDirectory,
    );
    expect(
      await nextLaunchApi.fetchOrganizationLogo(
        organizationId: organizationId,
        source: renewedUrl,
      ),
      imageBytes,
    );
    // A failed refresh must still return the previously cached valid image.
    expect(secondClientRequests, 1);
  });

  test(
    'relative organization logo paths resolve against the API host',
    () async {
      final cacheDirectory = await Directory.systemTemp.createTemp(
        'police-telegrams-relative-logo-test-',
      );
      addTearDown(() => cacheDirectory.delete(recursive: true));
      final imageBytes = Uint8List.fromList(
        base64Decode(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
        ),
      );
      Uri? requestedUri;
      final client = MockClient((request) async {
        requestedUri = request.url;
        return http.Response.bytes(
          imageBytes,
          200,
          headers: {'content-type': 'image/png'},
        );
      });
      addTearDown(client.close);
      final api = PoliceApi(
        baseUrl: 'https://police.example.test',
        httpClient: client,
        imageCacheDirectory: cacheDirectory,
      );

      final bytes = await api.fetchOrganizationLogo(
        organizationId: '550e8400-e29b-41d4-a716-446655440000',
        source: '/api/storage/department/logos/550e8400-e29b-41d4-a716-446655440000-badge.png',
      );

      expect(requestedUri?.origin, 'https://police.example.test');
      expect(requestedUri?.path, startsWith('/api/storage/department/logos/'));
      expect(bytes, imageBytes);
    },
  );

  test(
    'organization logo falls back to the authenticated tRPC payload when image GET fails',
    () async {
      final cacheDirectory = await Directory.systemTemp.createTemp(
        'police-telegrams-inline-logo-test-',
      );
      addTearDown(() => cacheDirectory.delete(recursive: true));
      const organizationId = '550e8400-e29b-41d4-a716-446655440000';
      const sessionCookie = 'sid=authenticated-session';
      final imageBytes = Uint8List.fromList(
        base64Decode(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
        ),
      );
      _secureStorageForTest['session_cookie'] = sessionCookie;
      var imageRequestCount = 0;
      var logoApiRequestCount = 0;
      final client = MockClient((request) async {
        expect(request.headers['cookie'], sessionCookie);
        if (request.url.path.startsWith('/api/storage/')) {
          imageRequestCount++;
          return http.Response('image route unavailable', 503);
        }
        if (request.url.path.endsWith('/organizations.logoForExport')) {
          logoApiRequestCount++;
          return http.Response(
            jsonEncode({
              'result': {
                'data': {
                  'json': {
                    'organizationId': organizationId,
                    'logoDataUrl':
                        'data:image/png;base64,${base64Encode(imageBytes)}',
                  },
                },
              },
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('unexpected request', 404);
      });
      addTearDown(client.close);
      final api = PoliceApi(
        baseUrl: 'https://police.example.test',
        httpClient: client,
        imageCacheDirectory: cacheDirectory,
      );

      final bytes = await api.fetchOrganizationLogo(
        organizationId: organizationId,
        source: '/api/storage/department/logos/$organizationId/logo.png',
      );

      expect(bytes, imageBytes);
      expect(imageRequestCount, 1);
      expect(logoApiRequestCount, 1);
    },
  );
}
