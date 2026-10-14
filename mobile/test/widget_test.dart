import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/main.dart';
import 'package:police_telegrams/push_notifications.dart';

class _TestPoliceApi extends PoliceApi {
  @override
  Future<Map<String, dynamic>?> restoreSession() async => null;
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
}
