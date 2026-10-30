import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/audit_log_presentation.dart';

void main() {
  group('audit log presentation', () {
    test('translates known actions and avoids raw unknown action codes', () {
      expect(auditActionLabel('telegram.create'), 'إنشاء برقية');
      expect(auditActionLabel('telegram.document.print'), 'طباعة وثيقة برقية');
      expect(auditActionLabel('unknown.action_code'), 'إجراء مسجل');
    });

    test('shows a human-readable resource reference without UUIDs', () {
      expect(auditEntitySummary('telegram', '93'), 'البرقية رقم 93');
      expect(
        auditEntitySummary(
          'telegram',
          '550e8400-e29b-41d4-a716-446655440000',
        ),
        'البرقية',
      );
    });

    test('translates metadata fields and omits technical values', () {
      final fields = readableAuditFields(
        '{"serialNumber":788,"classification":"normal",'
        '"format":"pdf","actorUserId":23,'
        '"userAgent":"Mozilla/5.0 (Android) Chrome/156.0"}',
      );

      expect(fields.map((field) => field.label), [
        'رقم البرقية',
        'درجة السرية',
        'صيغة الملف',
      ]);
      expect(fields[1].value, 'عادية');
      expect(fields[2].value, 'ملف PDF');
      expect(fields.any((field) => field.value.contains('Mozilla')), isFalse);
    });

    test('summarizes device and browser information in Arabic', () {
      expect(auditDeviceLabel('mobile'), 'تطبيق الهاتف');
      expect(auditDeviceLabel('web'), 'موقع الويب');
      expect(
        auditUserAgentSummary(
          'Mozilla/5.0 (Linux; Android 10) AppleWebKit Chrome/156.0 Mobile Safari/537.36',
        ),
        'Google Chrome على Android',
      );
    });
  });
}
