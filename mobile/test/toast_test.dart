import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/toast.dart';

void main() {
  testWidgets('shows semantic toast at top and replaces previous message', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => ToastOverlayHost(
          key: Toast.hostKey,
          child: child ?? const SizedBox.shrink(),
        ),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => Toast.success(context, 'تم الحفظ'),
                child: const Text('عرض'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('عرض'));
    await tester.pumpAndSettle();
    expect(find.text('تم الحفظ'), findsOneWidget);
    expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);
    final top = tester.getTopLeft(find.text('تم الحفظ')).dy;
    expect(top, lessThan(100));
    Toast.error(tester.element(find.text('عرض')), 'حدث خطأ');
    await tester.pumpAndSettle();
    expect(find.text('تم الحفظ'), findsNothing);
    expect(find.text('حدث خطأ'), findsOneWidget);
    expect(find.byIcon(Icons.error_outline), findsOneWidget);
  });

  testWidgets('auto dismisses after default four seconds', (tester) async {
    late BuildContext context;
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => ToastOverlayHost(
          key: Toast.hostKey,
          child: child ?? const SizedBox.shrink(),
        ),
        home: Builder(
          builder: (value) {
            context = value;
            return const Scaffold(body: SizedBox());
          },
        ),
      ),
    );
    Toast.info(context, 'معلومة');
    await tester.pump();
    expect(find.text('معلومة'), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('معلومة'), findsNothing);
  });

  testWidgets('loading toast persists until dismissed', (tester) async {
    late BuildContext context;
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => ToastOverlayHost(
          key: Toast.hostKey,
          child: child ?? const SizedBox.shrink(),
        ),
        home: Builder(
          builder: (value) {
            context = value;
            return const Scaffold(body: SizedBox());
          },
        ),
      ),
    );
    Toast.loading(context, 'جارٍ التحميل');
    await tester.pump();
    await tester.pump(const Duration(seconds: 10));
    expect(find.text('جارٍ التحميل'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('إغلاق الإشعار'));
    await tester.pumpAndSettle();
    expect(find.text('جارٍ التحميل'), findsNothing);
  });
}
