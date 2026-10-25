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
  'normal': 'عادي',
};

const Map<String, String> telegramPriorityLabels = <String, String>{
  'urgent': 'عاجلة',
  'normal': 'عادية',
  'slow': 'بطيئة',
};
