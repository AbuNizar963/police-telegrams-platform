import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/telegram_display.dart';

void main() {
  group('getTelegramSerialCode', () {
    test('prefers the organization-scoped serial', () {
      expect(
        getTelegramSerialCode({
          'organizationSerialCode': 'UNIT-00072',
          'serialCode': 'GLOBAL-00419',
        }),
        'UNIT-00072',
      );
    });

    test('prefers the exact original serial imported from Excel', () {
      expect(
        getTelegramSerialCode({
          'originalSerial': 'ب و ٠٠٦',
          'organizationSerialCode': 'UNIT-00072',
          'serialCode': 'GLOBAL-00419',
        }),
        'ب و ٠٠٦',
      );
    });

    test('falls back to legacy serial fields', () {
      expect(getTelegramSerialCode({'serialNumber': 'POL-00108'}), 'POL-00108');
      expect(getTelegramSerialCode({}), isEmpty);
    });
  });

  group('getTelegramDisplayNumber', () {
    test('strips the prefix and leading zeroes like the web client', () {
      expect(getTelegramDisplayNumber('POL-2026-09-30-00690'), '690');
      expect(getTelegramDisplayNumber('UNIT-00072'), '72');
    });

    test('preserves exact imported serials and handles missing values', () {
      expect(
        getTelegramDisplayNumber(
          'POL-2026-09-30-00690',
          originalSerial: '2025-009',
        ),
        '2025-009',
      );
      expect(
        getTelegramDisplayNumber(
          'POL-2026-09-30-00690',
          originalSerial: 'ب و ٠٠٦',
        ),
        'ب و ٠٠٦',
      );
      expect(getTelegramDisplayNumber('UNIT-ALPHA'), 'UNIT-ALPHA');
      expect(getTelegramDisplayNumber(null), '—');
      expect(getTelegramDisplayNumber('  '), '—');
    });
  });

  group('localizeTelegramDigits', () {
    test('uses Arabic-Indic digits only when configured', () {
      expect(localizeTelegramDigits('Telegram 690', 'arabic'), 'Telegram ٦٩٠');
      expect(localizeTelegramDigits('Telegram ٦٩٠', 'latin'), 'Telegram 690');
      expect(localizeTelegramDigits('Telegram 690', 'latin'), 'Telegram 690');
    });
  });
}
