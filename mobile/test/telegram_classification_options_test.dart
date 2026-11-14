import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/advanced_create_telegram_page.dart';

void main() {
  test('classification options match the web order and wording', () {
    expect(telegramClassificationOptions.keys.toList(), ['secret', 'normal']);
    expect(telegramClassificationOptions, {
      'secret': 'سري',
      'normal': 'عادية',
    });
  });
}
