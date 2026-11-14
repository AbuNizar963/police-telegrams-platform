import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/api.dart';
import 'package:police_telegrams/telegram_actions.dart';

class _WorkflowApi extends PoliceApi {
  _WorkflowApi() : super(baseUrl: 'https://example.test');

  @override
  Future<dynamic> call(
    String procedure, {
    Map<String, dynamic>? input,
    bool mutation = false,
    bool allowOfflineCache = true,
  }) async => <dynamic>[];
}

Widget _panel({
  required String status,
  bool canOperate = true,
  bool isAdmin = false,
}) {
  return MaterialApp(
    home: Scaffold(
      body: TelegramActionsPanel(
        api: _WorkflowApi(),
        telegramId: 17,
        telegramStatus: status,
        canOperate: canOperate,
        isAdmin: isAdmin,
        onChanged: () {},
      ),
    ),
  );
}

void main() {
  testWidgets('operational roles can start a pending telegram', (tester) async {
    await tester.pumpWidget(_panel(status: 'pending'));
    await tester.pumpAndSettle();

    expect(find.text('بدء الإجراء'), findsOneWidget);
  });

  testWidgets('operational roles can archive a completed telegram', (
    tester,
  ) async {
    await tester.pumpWidget(_panel(status: 'completed'));
    await tester.pumpAndSettle();

    expect(find.text('أرشفة'), findsOneWidget);
  });

  testWidgets('view-only users do not receive workflow transition controls', (
    tester,
  ) async {
    await tester.pumpWidget(
      _panel(status: 'pending', canOperate: false, isAdmin: false),
    );
    await tester.pumpAndSettle();

    expect(find.text('بدء الإجراء'), findsNothing);
  });
}
