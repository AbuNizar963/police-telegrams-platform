import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/main.dart';

void main() {
  testWidgets('shows police telegram login screen', (tester) async {
    await tester.pumpWidget(const PoliceTelegramsApp());
    expect(find.text('برقيات الشرطة'), findsOneWidget);
    expect(find.text('تسجيل الدخول'), findsOneWidget);
    expect(find.text('اسم المستخدم'), findsOneWidget);
  });
}
