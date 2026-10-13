import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/main.dart';
import 'package:police_telegrams/push_notifications.dart';

void main() {
  test('push service construction does not require Firebase configuration', () {
    expect(PushNotificationService.new, returnsNormally);
  });

  testWidgets('shows police telegram login screen', (tester) async {
    await tester.pumpWidget(const PoliceTelegramsApp());
    expect(find.text('برقيات الشرطة'), findsOneWidget);
    expect(find.text('تسجيل الدخول'), findsOneWidget);
    expect(find.text('اسم المستخدم'), findsOneWidget);
  });
}
