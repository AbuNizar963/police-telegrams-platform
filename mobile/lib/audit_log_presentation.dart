import 'dart:convert';

class AuditLogField {
  const AuditLogField({required this.label, required this.value});

  final String label;
  final String value;
}

const Map<String, String> auditActionLabels = {
  'organization.settings.update': 'تحديث إعدادات الجهة',
  'organization.create': 'إنشاء جهة',
  'organization.update': 'تعديل جهة',
  'settings.update': 'تحديث الإعدادات',
  'platform.document_settings.update': 'تحديث إعدادات الوثائق',
  'attachment.upload': 'رفع مرفق',
  'attachment.download': 'تنزيل مرفق',
  'telegram.update': 'تعديل برقية',
  'telegram.delete': 'حذف برقية',
  'telegram.route': 'إحالة برقية',
  'telegram.route.receive': 'تأكيد استلام إحالة',
  'telegram.status.transition': 'تغيير حالة برقية',
  'telegram.create': 'إنشاء برقية',
  'telegram.document.print': 'طباعة وثيقة برقية',
  'telegram.document.download': 'تنزيل أو مشاركة وثيقة برقية',
  'telegram.export.rows': 'تجهيز تصدير سجل البرقيات',
  'telegram.export.workbook': 'تصدير سجل البرقيات إلى Excel',
  'telegram.import.excel': 'استيراد برقيات من Excel',
  'telegram.broadcast': 'توزيع برقية على جهات',
  'telegram.broadcast.atomic_failure': 'تعذّر توزيع البرقية',
  'user.create': 'إنشاء حساب مستخدم',
  'user.update': 'تعديل بيانات مستخدم',
  'user.disable': 'تعطيل حساب مستخدم',
  'user.enable': 'تفعيل حساب مستخدم',
  'user.delete': 'حذف حساب مستخدم',
  'platform.owner_workplace.switch': 'تغيير جهة عمل المالك',
};

const Map<String, String> _entityLabels = {
  'telegram': 'البرقية',
  'telegram_attachment': 'مرفق البرقية',
  'telegram_collection': 'مجموعة البرقيات',
  'telegram_route': 'إحالة البرقية',
  'organization': 'الجهة',
  'user': 'حساب المستخدم',
  'settings': 'الإعدادات',
  'attachment': 'المرفق',
  'platform': 'النظام',
};

const Map<String, String> _fieldLabels = {
  'serialNumber': 'رقم البرقية',
  'serialCode': 'الرقم المرجعي',
  'originalSerial': 'الرقم السابق',
  'subject': 'الموضوع',
  'recipient': 'الجهة المستلمة',
  'body': 'نص الوثيقة',
  'classification': 'درجة السرية',
  'priority': 'درجة الأسبقية',
  'category': 'التصنيف',
  'status': 'الحالة',
  'fromStatus': 'الحالة السابقة',
  'toStatus': 'الحالة الجديدة',
  'statusAtDeletion': 'الحالة عند الحذف',
  'format': 'صيغة الملف',
  'operation': 'نوع العملية',
  'mode': 'طريقة التنفيذ',
  'reason': 'السبب',
  'username': 'اسم المستخدم',
  'name': 'الاسم',
  'rank': 'الرتبة',
  'role': 'الصلاحية',
  'accepted': 'نتيجة الاستلام',
  'approved': 'نتيجة الاعتماد',
  'deletedAttachmentCount': 'عدد المرفقات المحذوفة',
  'pendingStorageCleanup': 'ملفات بانتظار التنظيف',
  'rowCount': 'عدد السجلات',
  'recordCount': 'عدد السجلات',
  'createdCount': 'عدد السجلات المنشأة',
  'updatedCount': 'عدد السجلات المعدّلة',
  'targetCount': 'عدد الجهات المستهدفة',
  'rollbackGuaranteed': 'تم التراجع عن العملية بالكامل',
  'failure': 'ملخص التعذّر',
  'occurredAt': 'وقت تنفيذ العملية',
  'telegramId': 'رقم البرقية المرتبطة',
  'toOrganizationName': 'الجهة المحال إليها',
  'fromOrganizationName': 'الجهة المحيلة',
  'fileName': 'اسم الملف',
  'originalName': 'اسم الملف الأصلي',
  'mimeType': 'نوع الملف',
  'sizeBytes': 'حجم الملف',
};

const Map<String, String> _tokenLabels = {
  'normal': 'عادية',
  'routine': 'عادية',
  'secret': 'سرية',
  'confidential': 'سرية',
  'restricted': 'مقيّدة',
  'top_secret': 'سرية مشددة',
  'urgent': 'عاجلة',
  'immediate': 'فورية',
  'high': 'مرتفعة',
  'low': 'منخفضة',
  'security': 'أمنية',
  'administrative': 'إدارية',
  'pending': 'قيد المعالجة',
  'draft': 'مسودة',
  'approved': 'معتمدة',
  'rejected': 'مرفوضة',
  'completed': 'مكتملة',
  'sent': 'مرسلة',
  'archived': 'مؤرشفة',
  'deleted': 'محذوفة',
  'print': 'طباعة',
  'download': 'تنزيل',
  'upload': 'رفع',
  'pdf': 'ملف PDF',
  'png': 'صورة PNG',
  'jpg': 'صورة JPG',
  'jpeg': 'صورة JPEG',
  'xlsx': 'ملف Excel',
  'excel': 'Excel',
  'permanent': 'حذف نهائي',
  'soft': 'حذف قابل للاستعادة',
  'true': 'نعم',
  'false': 'لا',
  'success': 'ناجحة',
  'failed': 'فاشلة',
  'web': 'موقع الويب',
  'mobile': 'تطبيق الهاتف',
  'owner': 'مالك النظام',
  'platform_owner': 'مالك المنصة',
  'admin': 'مسؤول النظام',
  'unit_admin': 'مسؤول الجهة',
  'reviewer': 'مراجع',
  'auditor': 'مدقق',
  'officer': 'موظف',
  'member': 'موظف جهة',
};

const Map<String, String> _keyWordLabels = {
  'serial': 'رقم',
  'number': 'رقم',
  'code': 'مرجعي',
  'date': 'التاريخ',
  'time': 'الوقت',
  'status': 'الحالة',
  'from': 'من',
  'to': 'إلى',
  'count': 'العدد',
  'file': 'الملف',
  'attachment': 'المرفق',
  'organization': 'الجهة',
  'user': 'المستخدم',
  'accepted': 'الاستلام',
  'approved': 'الاعتماد',
  'created': 'الإنشاء',
  'updated': 'التعديل',
};

const Set<String> _technicalKeys = {
  'actoruserid',
  'createdbyuserid',
  'userid',
  'organizationid',
  'parentorganizationid',
  'resourceid',
  'entityid',
  'ipaddress',
  'useragent',
  'deviceid',
  'storagekey',
  'endpoint',
  'url',
};

String auditActionLabel(dynamic value) {
  final action = '$value'.trim();
  return auditActionLabels[action] ?? 'إجراء مسجل';
}

String auditEntitySummary(dynamic typeValue, dynamic idValue) {
  final type = '$typeValue'.trim();
  final label = _entityLabels[type] ?? 'سجل النظام';
  final id = '$idValue'.trim();
  if (id.isEmpty || id == 'null') return label;
  if (RegExp(r'^\d{1,12}$').hasMatch(id)) return '$label رقم $id';
  return label;
}

String auditRoleLabel(dynamic value) {
  final role = '$value'.trim().toLowerCase();
  return _tokenLabels[role] ?? (role.isEmpty ? 'غير محددة' : 'صلاحية مسجلة');
}

String auditDeviceLabel(dynamic value) {
  final device = '$value'.trim().toLowerCase();
  if (const {'mobile', 'app', 'android', 'ios'}.contains(device)) {
    return 'تطبيق الهاتف';
  }
  if (const {'web', 'browser', 'desktop'}.contains(device)) {
    return 'موقع الويب';
  }
  return 'غير محدد';
}

String auditUserAgentSummary(dynamic value) {
  final agent = '$value'.trim();
  if (agent.isEmpty || agent == 'null') return 'بيانات المتصفح غير متاحة';
  final browser = RegExp(r'Edg/', caseSensitive: false).hasMatch(agent)
      ? 'Microsoft Edge'
      : RegExp(r'Firefox/', caseSensitive: false).hasMatch(agent)
      ? 'Firefox'
      : RegExp(r'Chrome/', caseSensitive: false).hasMatch(agent)
      ? 'Google Chrome'
      : RegExp(r'Safari/', caseSensitive: false).hasMatch(agent)
      ? 'Safari'
      : RegExp(r'AppleWebKit', caseSensitive: false).hasMatch(agent)
      ? 'متصفح الهاتف'
      : 'متصفح غير محدد';
  final platform = RegExp(r'Android', caseSensitive: false).hasMatch(agent)
      ? 'Android'
      : RegExp(r'iPhone|iPad|iPod', caseSensitive: false).hasMatch(agent)
      ? 'iPhone أو iPad'
      : RegExp(r'Windows', caseSensitive: false).hasMatch(agent)
      ? 'Windows'
      : RegExp(r'Mac OS|Macintosh', caseSensitive: false).hasMatch(agent)
      ? 'macOS'
      : RegExp(r'Linux', caseSensitive: false).hasMatch(agent)
      ? 'Linux'
      : 'جهاز غير محدد';
  return '$browser على $platform';
}

List<AuditLogField> readableAuditFields(dynamic value) {
  final record = _recordFrom(value);
  if (record == null) {
    if (value is String && value.trim().isNotEmpty) {
      return [
        AuditLogField(
          label: 'ملاحظة',
          value: _displayFieldValue('note', value),
        ),
      ];
    }
    return const [];
  }
  return record.entries
      .where((entry) => !_isTechnicalField(entry.key, entry.value))
      .take(24)
      .map(
        (entry) => AuditLogField(
          label: _labelForKey(entry.key),
          value: _displayFieldValue(entry.key, entry.value),
        ),
      )
      .toList(growable: false);
}

String rawAuditDetails(dynamic value) {
  if (value == null || value == '') return '';
  if (value is String) {
    try {
      return const JsonEncoder.withIndent('  ').convert(jsonDecode(value));
    } catch (_) {
      return value;
    }
  }
  try {
    return const JsonEncoder.withIndent('  ').convert(value);
  } catch (_) {
    return '$value';
  }
}

Map<String, dynamic>? _recordFrom(dynamic value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  if (value is! String || value.trim().isEmpty) return null;
  try {
    final decoded = jsonDecode(value);
    return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
  } catch (_) {
    return null;
  }
}

bool _isTechnicalField(String key, dynamic value) {
  final normalized = key.replaceAll(RegExp(r'[_-]'), '').toLowerCase();
  if (_technicalKeys.contains(normalized) ||
      normalized.contains('hash') ||
      normalized.contains('token') ||
      normalized.contains('secret')) {
    return true;
  }
  return normalized.endsWith('id') &&
      key != 'telegramId' &&
      value is String &&
      value.length > 24;
}

String _labelForKey(String key) {
  final label = _fieldLabels[key];
  if (label != null) return label;
  final words = key
      .replaceAllMapped(
        RegExp(r'([a-z0-9])([A-Z])'),
        (match) => '${match[1]} ${match[2]}',
      )
      .replaceAll(RegExp(r'[._-]+'), ' ')
      .toLowerCase()
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .toList();
  final translated = words.map((word) => _keyWordLabels[word]).toList();
  return translated.every((word) => word != null)
      ? translated.join(' ')
      : 'معلومة إضافية';
}

String _displayFieldValue(String key, dynamic value) {
  if (value == null || value == '') return 'غير محدد';
  if (value is bool) return value ? 'نعم' : 'لا';
  if (value is num) return value.toString();
  if (value is List) {
    if (value.isEmpty) return 'لا توجد عناصر';
    if (RegExp(r'ids?$', caseSensitive: false).hasMatch(key)) {
      return '${value.length} عناصر مرتبطة';
    }
    return value
        .take(5)
        .map((item) => _displayFieldValue(key, item))
        .join('، ');
  }
  if (value is Map) {
    return value.isEmpty ? 'لا توجد تفاصيل' : 'تفاصيل إضافية (${value.length})';
  }
  final text = '$value'.trim();
  if (const {'occurredAt', 'createdAt', 'updatedAt'}.contains(key)) {
    final date = DateTime.tryParse(text)?.toLocal();
    if (date != null) {
      final year = date.year.toString().padLeft(4, '0');
      final month = date.month.toString().padLeft(2, '0');
      final day = date.day.toString().padLeft(2, '0');
      final hour = date.hour.toString().padLeft(2, '0');
      final minute = date.minute.toString().padLeft(2, '0');
      final second = date.second.toString().padLeft(2, '0');
      return '$year/$month/$day - $hour:$minute:$second';
    }
  }
  final normalized = text.toLowerCase().replaceAll(RegExp(r'[\s-]+'), '_');
  final translated =
      _tokenLabels['$key:$normalized'] ?? _tokenLabels[normalized];
  if (translated != null) return translated;
  if (RegExp(r'^[a-z0-9_.-]{1,64}$', caseSensitive: false).hasMatch(text)) {
    return 'قيمة مسجلة';
  }
  if (RegExp(r'^[0-9a-f]{24,}$', caseSensitive: false).hasMatch(text)) {
    return 'معرّف مسجل';
  }
  return text.length > 240 ? '${text.substring(0, 237)}…' : text;
}
