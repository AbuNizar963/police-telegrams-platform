import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/telegram_report_labels.dart';

void main() {
  test('Arabic report labels match the web canonical labels', () {
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
    expect(telegramClassificationLabels, <String, String>{
      'secret': 'سري',
      'normal': 'عادية',
    });
    expect(telegramPriorityLabels, <String, String>{
      'urgent': 'عاجلة',
      'normal': 'عادية',
      'slow': 'بطيئة',
    });
    expect(telegramCategoryLabels, <String, String>{
      'administrative': 'إداري',
      'criminal': 'جنائي',
      'traffic': 'مروري',
      'security': 'أمني',
      'tactical': 'عملياتي',
      'intelligence': 'استخباراتي',
      'emergency': 'طوارئ',
      'public_order': 'حفظ النظام',
      'personnel': 'شؤون الأفراد',
      'logistics': 'إمداد ودعم',
      'training': 'تدريب وتأهيل',
      'community': 'مجتمعي وشكاوى',
      'other': 'أخرى',
    });
  });
}
