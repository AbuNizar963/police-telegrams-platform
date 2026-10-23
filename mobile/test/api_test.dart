import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:police_telegrams/api.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
          (call) async => null,
        );
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
