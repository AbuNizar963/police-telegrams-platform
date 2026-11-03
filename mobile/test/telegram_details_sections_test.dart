import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/main.dart';

class _DetailsApi extends PoliceApi {
  _DetailsApi({this.failVersions = false}) : super(baseUrl: 'https://example.test');

  final bool failVersions;
  final calls = <String>[];

  @override
  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
    bool allowOfflineCache = true,
  }) async {
    calls.add(procedure);
    switch (procedure) {
      case 'telegrams.get':
        return {
          'id': 17,
          'serialCode': 'TEST-17',
          'subject': 'موضوع التفاصيل',
          'body': 'نص البرقية التجريبي',
          'status': 'in_review',
          'priority': 'normal',
          'classification': 'normal',
          'category': 'administrative',
          'createdAt': '2026-11-01T10:00:00Z',
        };
      case 'telegrams.versions':
        if (failVersions) throw const NetworkException('تعذر الاتصال بالخادم');
        return [
          {
            'id': 3,
            'versionNumber': 2,
            'changeReason': 'تصحيح الموضوع',
            'createdAt': '2026-11-02T10:00:00Z',
            'snapshot': {'subject': 'موضوع الإصدار السابق'},
          },
        ];
      case 'telegrams.actions':
        return [
          {
            'id': 1,
            'action': 'status.transition',
            'actorUserId': 8,
            'fromStatus': 'submitted',
            'toStatus': 'in_review',
            'createdAt': '2026-11-02T10:00:00Z',
          },
        ];
      case 'telegrams.attachments':
        return [
          {
            'id': 6,
            'originalName': 'محضر.pdf',
            'mimeType': 'application/pdf',
            'sizeBytes': 2048,
            'sha256': 'abcdef0123456789',
          },
        ];
      case 'telegrams.incomingRoutes':
        return [
          {
            'id': 9,
            'status': 'received',
            'receivedAt': '2026-11-02T12:30:00Z',
            'routeSerialCode': 'OUT-9',
            'incomingSerialCode': 'IN-12',
          },
        ];
      case 'organizations.routingDirectory':
        return <dynamic>[];
      default:
        return <dynamic>[];
    }
  }

  @override
  Future<dynamic> readCachedResponse(
    String procedure, {
    Map<String, dynamic>? input,
  }) async => null;
}

void main() {
  testWidgets('detail shows version history, action log, attachments and receipt routes', (tester) async {
    final api = _DetailsApi();
    await tester.pumpWidget(MaterialApp(
      home: TelegramDetailsPage(
        api: api,
        telegramId: 17,
        initialTelegram: {
          'id': 17,
          'serialCode': 'TEST-17',
          'subject': 'موضوع التفاصيل',
          'body': 'نص البرقية التجريبي',
          'status': 'in_review',
          'createdAt': '2026-11-01T10:00:00Z',
        },
        account: {'id': 8, 'role': 'user'},
        organizationRole: 'reviewer',
        organizationIsOwner: true,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('إصدارات الوثيقة (1)'), findsOneWidget);
    expect(find.textContaining('تصحيح الموضوع'), findsOneWidget);
    expect(find.text('سجل التدقيق والإجراءات (1)'), findsOneWidget);
    expect(find.text('المرفقات'), findsOneWidget);
    expect(find.text('محضر.pdf'), findsOneWidget);
    expect(find.text('مسار الاستلام والإحالات'), findsOneWidget);
    expect(find.textContaining('تم تأكيد استلام الإحالة'), findsOneWidget);
    expect(api.calls, contains('telegrams.versions'));
  });

  testWidgets('version history failure is visible and can be retried', (tester) async {
    final api = _DetailsApi(failVersions: true);
    await tester.pumpWidget(MaterialApp(
      home: TelegramDetailsPage(
        api: api,
        telegramId: 17,
        initialTelegram: {
          'id': 17,
          'serialCode': 'TEST-17',
          'subject': 'موضوع التفاصيل',
          'body': 'نص البرقية التجريبي',
          'status': 'draft',
          'createdAt': '2026-11-01T10:00:00Z',
        },
        account: {'id': 8, 'role': 'user'},
        organizationRole: null,
        organizationIsOwner: false,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('تعذر تحميل سجل الإصدارات'), findsOneWidget);
    expect(find.text('إعادة المحاولة'), findsOneWidget);
    expect(find.text('موضوع التفاصيل'), findsOneWidget);
  });
}
