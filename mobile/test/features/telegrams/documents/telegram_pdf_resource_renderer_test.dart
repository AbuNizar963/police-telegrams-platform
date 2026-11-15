import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/features/telegrams/documents/telegram_pdf_resource_renderer.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.police_telegrams/telegram_pdf_resources');

  test(
    'sends image bytes separately from HTML using typed resources',
    () async {
      final calls = <MethodCall>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            calls.add(call);
            return Uint8List.fromList([37, 80, 68, 70]);
          });

      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null),
      );

      final html = '''
        <html><body>
          <img src="telegram-resource://document/123e4567-e89b-42d3-a456-426614174000">
        </body></html>
      ''';
      final imageBytes = Uint8List.fromList([137, 80, 78, 71, 13, 10, 26, 10]);
      final pdf = await const TelegramPdfResourceRenderer().renderPdf(
        html: html,
        resources: {
          '123e4567-e89b-42d3-a456-426614174000': TelegramPdfImageResource(
            bytes: imageBytes,
            mimeType: 'image/png',
          ),
        },
      );

      expect(pdf, [37, 80, 68, 70]);
      expect(calls, hasLength(1));
      expect(calls.single.method, 'renderHtmlToPdf');
      final arguments = Map<String, dynamic>.from(
        calls.single.arguments as Map,
      );
      expect(arguments['html'], html);
      expect((arguments['html'] as String), isNot(contains('data:image/')));
      expect((arguments['html'] as String), isNot(contains('file://')));
      final resources = arguments['resources'] as List;
      expect(resources, hasLength(1));
      final resource = Map<String, dynamic>.from(resources.single as Map);
      expect(resource['id'], '123e4567-e89b-42d3-a456-426614174000');
      expect(resource['mimeType'], 'image/png');
      expect(List<int>.from(resource['bytes'] as Uint8List), imageBytes);
    },
  );
}
