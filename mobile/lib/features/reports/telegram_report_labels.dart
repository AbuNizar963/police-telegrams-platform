const Map<String, String> telegramStatusLabels = <String, String>{
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
};

const Map<String, String> telegramClassificationLabels = <String, String>{
  'secret': 'سري',
  'normal': 'عادية',
};

const Map<String, String> telegramPriorityLabels = <String, String>{
  'urgent': 'عاجلة',
  'normal': 'عادية',
  'slow': 'بطيئة',
};

const Map<String, String> telegramCategoryLabels = <String, String>{
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
};
