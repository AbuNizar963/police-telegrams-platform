import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/telegram_csv_codec.dart';

void main() {
  group('TelegramCsvCodec.encodeRows', () {
    test('writes UTF-8 BOM, CRLF records, and escaped quoted cells', () {
      final csv = TelegramCsvCodec.encodeRows([
        ['body', 'notes'],
        ['بلاغ، "عاجل"', 'سطر أول\nسطر ثان'],
      ]);

      expect(csv.startsWith('\uFEFF'), isTrue);
      expect(csv, contains('"بلاغ، ""عاجل"""'));
      expect(csv, contains('"سطر أول\nسطر ثان"'));
      expect(csv, contains('\r\n'));
    });
  });

  group('TelegramCsvCodec.parseImport', () {
    test('parses quoted commas, escaped quotes, and embedded newlines', () {
      final result = TelegramCsvCodec.parseImport(
        'body,sender,sheetName\r\n'
        '"نص, فيه ""اقتباس""\nوسطر ثانٍ",أحمد,وارد\r\n',
      );

      expect(result.rows, hasLength(1));
      expect(result.rows.single['body'], 'نص, فيه "اقتباس"\nوسطر ثانٍ');
      expect(result.rows.single['sender'], 'أحمد');
      expect(result.rows.single['sheetName'], 'وارد');
      expect(result.invalidRows, 0);
    });

    test('accepts Arabic headers and counts rows without a valid body', () {
      final result = TelegramCsvCodec.parseImport(
        '\uFEFFالمتن,المرسل,الاتجاه\r\n'
        'هذا نص برقية,أحمد,وارد\r\n'
        ',سطر ناقص,صادر\r\n',
      );

      expect(result.rows, hasLength(1));
      expect(result.rows.single['body'], 'هذا نص برقية');
      expect(result.rows.single['sheetName'], 'وارد');
      expect(result.invalidRows, 1);
    });

    test('caps imports at one thousand rows', () {
      final buffer = StringBuffer('body\n');
      for (var index = 0; index < 1002; index++) {
        buffer.writeln('نص برقية رقم $index');
      }

      final result = TelegramCsvCodec.parseImport(buffer.toString());
      expect(result.rows, hasLength(1000));
      expect(result.invalidRows, 2);
    });

    test(
      'rejects an unclosed quoted field instead of silently corrupting it',
      () {
        expect(
          () => TelegramCsvCodec.parseImport('body\n"نص غير مكتمل'),
          throwsA(isA<FormatException>()),
        );
      },
    );
  });
}
