import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/main.dart';
import 'package:police_telegrams/push_notifications.dart';

class _TestPoliceApi extends PoliceApi {
  _TestPoliceApi({this.signedIn = false});

  final bool signedIn;
  final calls = <String, Map<String, dynamic>?>{};

  @override
  Future<Map<String, dynamic>?> restoreSession() async =>
      signedIn ? {'id': 1, 'name': 'مشغل النظام', 'role': 'user'} : null;

  @override
  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
  }) async {
    calls[procedure] = input;
    return switch (procedure) {
      'dashboard.stats' => {
        'total': 6,
        'incoming': 2,
        'outgoing': 4,
        'urgent': 1,
        'pending': 2,
        'resolved': 3,
        'urgentAwaitingReceipt': 0,
      },
      'organizations.context' => {
        'organizationId': 'org-1',
        'organizationName': 'إدارة الاختبار',
      },
      'telegrams.list' => {'items': <dynamic>[]},
      'notifications.inbox' => <dynamic>[],
      _ => <String, dynamic>{},
    };
  }
}

void main() {
  test('push service construction does not require Firebase configuration', () {
    expect(PushNotificationService.new, returnsNormally);
  });

  testWidgets('shows police telegram login screen', (tester) async {
    await tester.pumpWidget(PoliceTelegramsApp(api: _TestPoliceApi()));
    await tester.pumpAndSettle();

    expect(find.text('برقيات الشرطة'), findsOneWidget);
    expect(find.text('تسجيل الدخول'), findsOneWidget);
    expect(find.text('اسم المستخدم'), findsOneWidget);
  });

  testWidgets('dashboard quick actions and stat cards are interactive', (
    tester,
  ) async {
    final api = _TestPoliceApi(signedIn: true);
    await tester.pumpWidget(PoliceTelegramsApp(api: api));
    await tester.pumpAndSettle();

    expect(find.text('إنشاء برقية'), findsOneWidget);
    expect(find.text('الإشعارات'), findsWidgets);
    expect(find.text('التقارير'), findsOneWidget);

    final incomingStat = find.text('البرقيات الواردة').first;
    await tester.tap(
      find.ancestor(of: incomingStat, matching: find.byType(InkWell)).first,
    );
    await tester.pumpAndSettle();

    expect(find.text('البرقيات الواردة'), findsOneWidget);
    expect(api.calls['telegrams.list']?['direction'], 'incoming');
  });
}
