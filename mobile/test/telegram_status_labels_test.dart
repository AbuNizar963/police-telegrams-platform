import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/telegram_status_labels.dart';

void main() {
  test('Arabic status labels match the web canonical labels', () {
    expect(telegramStatusLabels, <String, String>{
      'draft': 'مسودة',
      'submitted': 'مرسلة للمراجعة',
      'in_review': 'قيد المراجعة',
      'approved': 'معتمدة',
      'returned': 'معادة للتصحيح',
      'rejected': 'مرفوضة',
      'forwarded': 'محالة',
      'pending': 'قيد الانتظار',
      'in_progress': 'قيد الإجراء',
      'resolved': 'منجزة',
      'completed': 'مكتملة',
      'archived': 'مؤرشفة',
    });
  });
}
