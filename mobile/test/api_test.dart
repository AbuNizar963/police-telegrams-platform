import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:police_telegrams/api.dart';

final _secureStorageForTest = <String, String>{};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    _secureStorageForTest.clear();
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
              default:
                return null;
            }
          },
        );
  });

  test(
    'critical platform document reads ignore stale cached settings',
    () async {
      final onlineClient = MockClient((request) async {
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
      addTearDown(onlineClient.close);
      final onlineApi = PoliceApi(
        baseUrl: 'https://police.example.test',
        httpClient: onlineClient,
      );
      await onlineApi.call('platformDocumentSettings.get');

      final offlineClient = MockClient((request) async {
        throw const SocketException('offline');
      });
      addTearDown(offlineClient.close);
      final offlineApi = PoliceApi(
        baseUrl: 'https://police.example.test',
        httpClient: offlineClient,
      );

      expect(await offlineApi.call('platformDocumentSettings.get'), isA<Map>());
      await expectLater(
        offlineApi.call(
          'platformDocumentSettings.get',
          allowOfflineCache: false,
        ),
        throwsA(isA<NetworkException>()),
      );
    },
  );

  test(
    'read-only lists, reports, notifications, and profile work offline',
    () async {
      final onlineClient = MockClient((request) async {
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
        return http.Response(
          jsonEncode({
            'result': {
              'data': {'json': value},
            },
          }),
          200,
        );
      });
      addTearDown(onlineClient.close);
      final onlineApi = PoliceApi(
        baseUrl: 'https://police.example.test',
        httpClient: onlineClient,
      );
      final listInput = {'status': 'all', 'page': 1};
      final reportInput = {'from': '2026-10-01', 'to': '2026-10-23'};
      await onlineApi.call('telegrams.list', input: listInput);
      await onlineApi.call('reports.telegrams', input: reportInput);
      await onlineApi.call('notifications.inbox');
      await onlineApi.call('profile.get');
  
      final offlineClient = MockClient((request) async {
        throw const SocketException('offline');
      });
      addTearDown(offlineClient.close);
      final offlineApi = PoliceApi(
        baseUrl: 'https://police.example.test',
        httpClient: offlineClient,
      );
  
      expect(
        (await offlineApi.call('telegrams.list', input: listInput))['items'],
        hasLength(1),
      );
      expect(
        (await offlineApi.call('reports.telegrams', input: reportInput))['total'],
        4,
      );
      expect(
        await offlineApi.call('notifications.inbox'),
        hasLength(1),
      );
      expect(
        (await offlineApi.call('profile.get'))['name'],
        'مشغل محفوظ',
      );
      await expectLater(
        offlineApi.call('telegrams.list', input: {'status': 'urgent', 'page': 1}),
        throwsA(isA<NetworkException>()),
      );
    },
  );  test(
    'transient server errors use cached reads but auth errors do not',
    () async {
      final onlineClient = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'result': {
              'data': {
                'json': {'departmentName': 'قسم محفوظ'},
              },
            },
          }),
          200,
        );
      });
      addTearDown(onlineClient.close);
      final onlineApi = PoliceApi(
        baseUrl: 'https://police.example.test',
        httpClient: onlineClient,
      );
      await onlineApi.call('settings.get');
  
      final unavailableClient = MockClient((request) async {
        return http.Response('service unavailable', 503);
      });
      addTearDown(unavailableClient.close);
      final unavailableApi = PoliceApi(
        baseUrl: 'https://police.example.test',
        httpClient: unavailableClient,
      );
      expect(
        (await unavailableApi.call('settings.get'))['departmentName'],
        'قسم محفوظ',
      );
  
      final unauthorizedClient = MockClient((request) async {
        return http.Response('unauthorized', 401);
      });
      addTearDown(unauthorizedClient.close);
      final unauthorizedApi = PoliceApi(
        baseUrl: 'https://police.example.test',
        httpClient: unauthorizedClient,
      );
      await expectLater(
        unauthorizedApi.call('settings.get'),
        throwsA(isA<ApiException>()),
      );
    },
  );  test('organization logo is reused when a signed URL token rotates', () async {
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
    expect(networkRequests, 1);

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
    expect(secondClientRequests, 0);
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
}
