# تنفيذ `DriftOutboxRepository` مع عزل الحسابات وIdempotency

هذا نموذج مصدر لـDrift يوضح جداول حالة الحساب والطابور، تحديثات epoch الذرية، ومزامنة إعادة المحاولة. يفترض Drift 2.x مع `drift_flutter`. ملف `outbox_database.g.dart` مولّد وليس يدوياً؛ أنشئه بأوامر build_runner أدناه.

## 1. الحزم وتوليد Drift

أضف إلى `pubspec.yaml`:

```yaml
dependencies:
  drift: ^2.30.0
  drift_flutter: ^0.3.1
  sqlite3_flutter_libs: ^0.6.0

dev_dependencies:
  drift_dev: ^2.30.0
  build_runner: ^2.10.0
```

ثم شغّل:

```sh
flutter pub get
dart run build_runner build --delete-conflicting-outputs
```

تأكد من تثبيت نسخ Drift المتوافقة مع قيد Dart/Flutter الفعلي للمشروع قبل الدمج، ولا ترفع ملفاً مولداً يدوياً.

## 2. قاعدة البيانات والجداول — `lib/outbox_database.dart`

```dart
import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'outbox_database.g.dart';

@DataClassName('OutboxAccountState')
class OutboxAccountStates extends Table {
  TextColumn get accountId => text()();
  IntColumn get epoch => integer().withDefault(const Constant(0))();
  BoolColumn get loggingOut => boolean().withDefault(const Constant(false))();

  @override
  Set<Column<Object>> get primaryKey => {accountId};
}

@DataClassName('OutboxRecord')
class OutboxEntries extends Table {
  TextColumn get accountId => text()();
  TextColumn get id => text()();
  TextColumn get idempotencyKey => text()();
  TextColumn get payloadJson => text()();
  TextColumn get attachmentJson => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {accountId, id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {accountId, idempotencyKey},
  ];
}

@DriftDatabase(tables: [OutboxAccountStates, OutboxEntries])
class OutboxDatabase extends _$OutboxDatabase {
  OutboxDatabase(super.executor);

  /// استخدم هذه الـfactory في التطبيق. يجب على كل isolate/engine الوصول
  /// إلى قاعدة البيانات نفسها، مع shareAcrossIsolates عند دعم isolates
  /// داخل Flutter engine نفسه.
  factory OutboxDatabase.open() => OutboxDatabase(
    driftDatabase(
      name: 'telegram_outbox',
      native: const DriftNativeOptions(shareAcrossIsolates: true),
    ),
  );

  @override
  int get schemaVersion => 1;
}
```

> `shareAcrossIsolates: true` في `drift_flutter` يشارك خادم Drift بين isolates داخل Flutter engine نفسه. عامل يعمل في Flutter engine مستقل لا يستفيد تلقائياً من ذلك؛ في هذه الحالة استخدم إعداد `DriftIsolate` موثقاً من Drift، أو اتصل بقاعدة SQLite نفسها باتصال مستقل مع الاعتماد على عمليات SQL الذرية وقيود SQLite، لا على كائن Dart مشترك.

## 3. المستودع — `lib/drift_outbox_repository.dart`

```dart
import 'dart:convert';

import 'package:drift/drift.dart';

import 'outbox_database.dart';

class SyncLease {
  const SyncLease({required this.accountId, required this.epoch});

  final String accountId;
  final int epoch;
}

class NewOutboxItem {
  const NewOutboxItem({
    required this.id,
    required this.idempotencyKey,
    required this.payload,
    required this.createdAt,
    this.attachment,
  });

  final String id;
  final String idempotencyKey;
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? attachment;
  final DateTime createdAt;
}

class DriftOutboxRepository {
  DriftOutboxRepository(this.db);

  final OutboxDatabase db;

  Future<void> _ensureAccountState(String accountId) async {
    // INSERT OR IGNORE لا يغيّر epoch/loggingOut إذا كان الصف موجوداً.
    await db.customStatement(
      'INSERT OR IGNORE INTO outbox_account_states '
      '(account_id, epoch, logging_out) VALUES (?, 0, 0)',
      [Variable.withString(accountId)],
    );
  }

  /// تفعيل الحساب بعد مصادقة ناجحة. لا تخفّض epoch أبداً.
  /// استدعِه فقط بعد التأكد من أن مخزن الطابور الخاص بالحساب صالح.
  Future<void> activateAccount(String accountId) async {
    await db.transaction(() async {
      await _ensureAccountState(accountId);
      await (db.update(db.outboxAccountStates)
            ..where((t) => t.accountId.equals(accountId)))
          .write(const OutboxAccountStatesCompanion(loggingOut: Value(false)));
    });
  }

  Future<void> enqueue({
    required String accountId,
    required NewOutboxItem item,
  }) async {
    await db.transaction(() async {
      await _ensureAccountState(accountId);
      final state = await (db.select(db.outboxAccountStates)
            ..where((t) => t.accountId.equals(accountId)))
          .getSingle();
      if (state.loggingOut) {
        throw StateError('الحساب في طور تسجيل الخروج؛ رُفضت إضافة برقية.');
      }

      await db.into(db.outboxEntries).insert(
        OutboxEntriesCompanion.insert(
          accountId: accountId,
          id: item.id,
          idempotencyKey: item.idempotencyKey,
          payloadJson: jsonEncode(item.payload),
          attachmentJson: Value(
            item.attachment == null ? null : jsonEncode(item.attachment),
          ),
          createdAt: item.createdAt.toUtc(),
        ),
      );
    });
  }

  /// يأخذ لقطة epoch. null يعني أن الحساب في طور الخروج.
  Future<SyncLease?> beginSync(String accountId) async {
    return db.transaction(() async {
      await _ensureAccountState(accountId);
      final state = await (db.select(db.outboxAccountStates)
            ..where((t) => t.accountId.equals(accountId)))
          .getSingle();
      if (state.loggingOut) return null;
      return SyncLease(accountId: accountId, epoch: state.epoch);
    });
  }

  Future<bool> isLeaseCurrent(SyncLease lease) async {
    final state = await (db.select(db.outboxAccountStates)
          ..where((t) => t.accountId.equals(lease.accountId)))
        .getSingleOrNull();
    return state != null &&
        !state.loggingOut &&
        state.epoch == lease.epoch;
  }

  Future<List<OutboxRecord>> entriesFor(SyncLease lease) async {
    if (!await isLeaseCurrent(lease)) return const [];
    return (db.select(db.outboxEntries)
          ..where((t) => t.accountId.equals(lease.accountId))
          ..orderBy([(t) => OrderingTerm.asc(t.createdAt)]))
        .get();
  }

  /// يحذف العنصر المرسل فقط إذا كانت lease ما تزال صالحة.
  /// NOT EXISTS يجعل فحص epoch والحذف جملة SQL ذرية، حتى عند اتصال آخر.
  Future<bool> markSynced(SyncLease lease, String entryId) async {
    final changed = await db.customUpdate(
      'DELETE FROM outbox_entries '
      'WHERE account_id = ? AND id = ? '
      'AND EXISTS ('
      ' SELECT 1 FROM outbox_account_states s '
      ' WHERE s.account_id = ? AND s.epoch = ? AND s.logging_out = 0'
      ')',
      variables: [
        Variable.withString(lease.accountId),
        Variable.withString(entryId),
        Variable.withString(lease.accountId),
        Variable.withInt(lease.epoch),
      ],
      updates: {db.outboxEntries, db.outboxAccountStates},
    );
    return changed == 1;
  }

  /// يسجل فشل المحاولة مع شرط epoch ذري. false تعني أن الخروج سبق الكتابة.
  Future<bool> recordRetry({
    required SyncLease lease,
    required String entryId,
    required String error,
  }) async {
    final changed = await db.customUpdate(
      'UPDATE outbox_entries '
      'SET attempts = attempts + 1, last_error = ? '
      'WHERE account_id = ? AND id = ? '
      'AND EXISTS ('
      ' SELECT 1 FROM outbox_account_states s '
      ' WHERE s.account_id = ? AND s.epoch = ? AND s.logging_out = 0'
      ')',
      variables: [
        Variable.withString(error),
        Variable.withString(lease.accountId),
        Variable.withString(entryId),
        Variable.withString(lease.accountId),
        Variable.withInt(lease.epoch),
      ],
      updates: {db.outboxEntries, db.outboxAccountStates},
    );
    return changed == 1;
  }

  /// ذرّي: زيادة الجيل وإغلاق الحساب ثم حذف عناصره.
  /// أي sync قديم يحمل epoch سابقاً ولن يستطيع تحديث/حذف صفوف بعد ذلك.
  Future<int> logoutAndDelete(String accountId) async {
    return db.transaction(() async {
      await _ensureAccountState(accountId);
      await db.customUpdate(
        'UPDATE outbox_account_states '
        'SET epoch = epoch + 1, logging_out = 1 '
        'WHERE account_id = ?',
        variables: [Variable.withString(accountId)],
        updates: {db.outboxAccountStates},
      );

      return db.customUpdate(
        'DELETE FROM outbox_entries WHERE account_id = ?',
        variables: [Variable.withString(accountId)],
        updates: {db.outboxEntries},
      );
    });
  }

  Future<int> pendingCount(String accountId) async {
    final count = db.outboxEntries.id.count();
    final row = await (db.selectOnly(db.outboxEntries)
          ..addColumns([count])
          ..where(db.outboxEntries.accountId.equals(accountId)))
        .getSingle();
    return row.read(count) ?? 0;
  }

  /// تستخدمه اختبارات الوحدة أو واجهة صيانة، وليس الخروج العادي.
  Future<int> currentEpoch(String accountId) async {
    final state = await (db.select(db.outboxAccountStates)
          ..where((t) => t.accountId.equals(accountId)))
        .getSingleOrNull();
    return state?.epoch ?? 0;
  }
}
```

**ملاحظة مهمة عن SQL وأسماء الجداول:** أسماء SQL الافتراضية هنا هي `outbox_account_states` و`outbox_entries` وفق تحويل Drift لأسماء Dart. تحقق منها في SQL الناتج بعد code generation. إذا غيّرت أسماء الجداول عبر `@TableName`، حدّث عبارات SQL الخام أيضاً.

## 4. دمج idempotency في عامل المزامنة

أنشئ المفتاح مرة واحدة عند enqueue واحفظه في صف الطابور. في كل محاولة أعد إرسال المفتاح نفسه والحمولة نفسها. لا تولّد مفتاحاً جديداً عند retry. إذا كان API الحالي tRPC يقبل `idempotencyKey` ضمن input، أرسله هناك كما في المثال؛ لا تضف HTTP header إلا إذا كان الخادم يقرأ هذا الرأس فعلياً.

```dart
abstract interface class TelegramRemote {
  Future<int> createTelegram({
    required Map<String, dynamic> payload,
    required String idempotencyKey,
  });
}

class OutboxSyncWorker {
  OutboxSyncWorker(this.repository, this.remote);

  final DriftOutboxRepository repository;
  final TelegramRemote remote;

  Future<void> syncAccount(String accountId) async {
    final lease = await repository.beginSync(accountId);
    if (lease == null) return;

    final items = await repository.entriesFor(lease);
    for (final item in items) {
      if (!await repository.isLeaseCurrent(lease)) return;

      try {
        final telegramId = await remote.createTelegram(
          payload: Map<String, dynamic>.from(jsonDecode(item.payloadJson) as Map),
          // القيمة المحفوظة لا تتغير بين المحاولات.
          idempotencyKey: item.idempotencyKey,
        );

        // لا ترفع المرفق أو تحذف العنصر قبل اعتماد نتيجة الإنشاء.
        // يجب أيضاً أن تكون uploadAttachment idempotent أو لها مفتاحها الثابت.
        final attachmentJson = item.attachmentJson;
        if (attachmentJson != null) {
          await uploadAttachmentIdempotently(
            telegramId: telegramId,
            attachment: Map<String, dynamic>.from(
              jsonDecode(attachmentJson) as Map,
            ),
            idempotencyKey: '${item.idempotencyKey}:attachment',
          );
        }

        final committed = await repository.markSynced(lease, item.id);
        if (!committed) return; // logout غيّر epoch؛ لا كتابة قديمة.
      } catch (error) {
        final recorded = await repository.recordRetry(
          lease: lease,
          entryId: item.id,
          error: sanitizeError(error),
        );
        if (!recorded) return;
        break; // نحافظ على ترتيب FIFO عند فشل الشبكة.
      }
    }
  }
}
```

`uploadAttachmentIdempotently` و`sanitizeError` واجهتان توضيحيتان يجب ربطهما بطبقة الشبكة الموجودة. لا تسجل محتوى البرقية أو رموز الجلسة في `lastError`.

### واجهة API القائمة

إذا كانت `PoliceApi.call` ترسل JSON إلى tRPC، مرّر المفتاح داخل input ما دام router يتحقق منه ويدعمه:

```dart
final result = await api.call(
  'telegrams.create',
  mutation: true,
  input: {
    ...payload,
    'idempotencyKey': item.idempotencyKey,
  },
);
```

مفتاح على العميل وحده لا يمنع التكرار. يجب على الخادم أن ينفذ idempotency: حفظ المفتاح مع نطاق مناسب (مثلاً الحساب/الجهة والعملية)، فرض قيد `UNIQUE`، والتحقق أن إعادة الاستخدام تطابق نفس الحمولة، وإرجاع نتيجة الإنشاء الأصلية عند إعادة الطلب. يجب أن يكون تسجيل المفتاح وإنشاء البرقية ضمن معاملة خادمية واحدة. إذا تم إنشاء البرقية لكن ضاعت الاستجابة، تعيد المحاولة بالمفتاح نفسه النتيجة نفسها بدلاً من إنشاء برقية ثانية. ثبّت مدة الاحتفاظ بالمفاتيح على الخادم أطول من أقصى نافذة إعادة المحاولة، أو احتفظ بسجل دائم بحسب متطلبات العمل.

## 5. الخروج مع مزامنة تعمل

```dart
Future<void> logoutAccount(String accountId) async {
  // هذا هو حاجز الصحة الأساسي: يرفع epoch ويحذف محلياً بعملية ذرية.
  await repository.logoutAndDelete(accountId);

  // بعد ذلك ألغِ الجدولة كتحسين، لا كضمان وحيد.
  await cancelScheduledSync(accountId);

  // طلب logout البعيد best effort؛ لا يؤخر حذف الطابور المحلي.
  try {
    await api.call('auth.logout', mutation: true);
  } catch (_) {
    // تستمر عملية الخروج المحلية.
  }

  await clearLocalSession(accountId);
}
```

أوقف بدء مزامنات جديدة في مدير المهام أيضاً، لكن لا تعتمد على إلغاء worker وحده. يمكن أن يكون طلب الشبكة قد وصل للخادم بالفعل. الـepoch يمنع ذلك العامل من تثبيت أي تحديث محلي متأخر بعد الخروج.

## 6. اختبار سباق حتمي بـin-memory Drift

أضف `drift_dev` و`build_runner` كما سبق. الاختبار التالي يحاكي اكتمال طلب الشبكة بعد `logoutAndDelete`، ثم يتأكد أن lease القديمة لا تستطيع كتابة retry أو الإبقاء على الصف:

```dart
import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:your_app/outbox_database.dart';
import 'package:your_app/drift_outbox_repository.dart';

typedef SendOutboxEntry = Future<void> Function(OutboxRecord entry);

/// ضع هذا الكلاس في lib/outbox_sync_engine.dart في التطبيق.
class DriftOutboxSyncEngine {
  DriftOutboxSyncEngine({required this.repository, required this.sendEntry});

  final DriftOutboxRepository repository;
  final SendOutboxEntry sendEntry;

  Future<void> syncAccount(String accountId) async {
    final lease = await repository.beginSync(accountId);
    if (lease == null) return;

    final entries = await repository.entriesFor(lease);
    for (final entry in entries) {
      if (!await repository.isLeaseCurrent(lease)) return;

      try {
        await sendEntry(entry); // طلب الشبكة خارج أي transaction.

        // logout قد يحدث أثناء انتظار الشبكة.
        if (!await repository.isLeaseCurrent(lease)) return;
        if (!await repository.markSynced(lease, entry.id)) return;
      } catch (error) {
        final recorded = await repository.recordRetry(
          lease: lease,
          entryId: entry.id,
          error: error.toString(),
        );
        if (!recorded) return;
        break; // حافظ على FIFO عند فشل الطلب.
      }
    }
  }
}

void main() {
  late OutboxDatabase db;
  late DriftOutboxRepository repository;

  setUp(() {
    db = OutboxDatabase(NativeDatabase.memory());
    repository = DriftOutboxRepository(db);
  });

  tearDown(() async => db.close());

  test('late sync response after logout cannot recreate or mutate entry', () async {
    const accountId = 'account-A';
    await repository.activateAccount(accountId);
    await repository.enqueue(
      accountId: accountId,
      item: NewOutboxItem(
        id: 'entry-1',
        idempotencyKey: 'mobile-offline-fixed-key-0001',
        payload: const {'subject': 'test'},
        createdAt: DateTime.utc(2026, 1, 1),
      ),
    );

    final startedNetwork = Completer<void>();
    final releaseNetwork = Completer<void>();

    final syncFuture = () async {
      final lease = await repository.beginSync(accountId);
      expect(lease, isNotNull);
      final snapshot = await repository.entriesFor(lease!);
      expect(snapshot, hasLength(1));

      // هذا يمثل طلب HTTP أُرسل قبل الخروج، لكن رده تأخر.
      startedNetwork.complete();
      await releaseNetwork.future;

      // محاكاة خطأ/استجابة متأخرة تحاول حفظ حالة retry.
      return repository.recordRetry(
        lease: lease,
        entryId: 'entry-1',
        error: 'late network failure',
      );
    }();

    await startedNetwork.future;
    final oldEpoch = await repository.currentEpoch(accountId);

    final deleted = await repository.logoutAndDelete(accountId);
    expect(deleted, 1);
    expect(await repository.pendingCount(accountId), 0);
    expect(await repository.currentEpoch(accountId), oldEpoch + 1);

    releaseNetwork.complete();
    final lateWriteAccepted = await syncFuture;

    expect(lateWriteAccepted, isFalse);
    expect(await repository.pendingCount(accountId), 0);

    // وكذلك لا يستطيع عامل قديم بدء عملية جديدة بعد logout.
    expect(await repository.beginSync(accountId), isNull);
  });

  test('sync engine stops before next request when logout changes epoch', () async {
    const accountId = 'account-B';
    await repository.activateAccount(accountId);

    for (final id in ['entry-1', 'entry-2']) {
      await repository.enqueue(
        accountId: accountId,
        item: NewOutboxItem(
          id: id,
          idempotencyKey: 'stable-idempotency-key-$id',
          payload: {'subject': id},
          createdAt: DateTime.utc(2026, 1, 1).add(
            Duration(seconds: id == 'entry-1' ? 1 : 2),
          ),
        ),
      );
    }

    final firstRequestStarted = Completer<void>();
    final finishFirstRequest = Completer<void>();
    final sentIds = <String>[];

    final engine = DriftOutboxSyncEngine(
      repository: repository,
      sendEntry: (entry) async {
        // تمثل هذه الدالة طلب الشبكة. الطلب الأول يبقى معلّقاً
        // بينما ينفذ الاختبار logout بالتوازي.
        sentIds.add(entry.id);
        if (entry.id == 'entry-1') {
          firstRequestStarted.complete();
          await finishFirstRequest.future;
        }
      },
    );

    final syncFuture = engine.syncAccount(accountId);
    await firstRequestStarted.future;

    // محاكاة ضغط تسجيل الخروج أثناء انتظار رد HTTP.
    final deleted = await repository.logoutAndDelete(accountId);
    expect(deleted, 2);

    finishFirstRequest.complete();
    await syncFuture;

    // لا يرسل العنصر الثاني ولا تعود نتيجة الأول إلى قاعدة البيانات.
    expect(sentIds, ['entry-1']);
    expect(await repository.pendingCount(accountId), 0);
    expect(await repository.beginSync(accountId), isNull);
  });
}
```

هذا اختبار وحدة لمحرك المزامنة فوق قاعدة Drift in-memory؛ يختبر ترتيب السباق داخل isolate الاختبار. لإثبات مشاركة قاعدة البيانات عبر isolates فعلياً، أضف اختبار تكامل على ملف SQLite مؤقت، وافتحه من اتصالات Drift التي يستخدمها العامل والواجهة كما في الإعداد الإنتاجي، ثم كرر الترتيب نفسه. لا تمرر كائن `OutboxDatabase` نفسه بين isolates؛ استخدم آلية اتصال Drift المناسبة.

## 7. التحقق المطلوب قبل الدمج

1. شغّل build_runner، ثم `flutter analyze` و`flutter test`.
2. اختبر أن مفتاح العنصر لا يتغير بعد إعادة تشغيل التطبيق أو retry.
3. اختبر إعادة إرسال متزامنة للمفتاح نفسه على الخادم، وكذلك إعادة استخدامه مع حمولة مختلفة؛ يجب رفض الحمولة المختلفة.
4. اختبر وصول رد إنشاء ناجح بعد الخروج: يجب أن تبقى البيانات المحلية محذوفة، مع العلم أن الأثر البعيد قد تم إذا عالج الخادم الطلب قبل logout.
5. اختبر عملية uploadAttachment كعملية مستقلة؛ مفتاح إنشاء البرقية لا يمنع بالضرورة رفع المرفق مرتين.
6. اختبر migrations للنسخ القديمة، ولا تستورد الطابور العام القديم إلى حساب جديد دون إثبات ملكيته.

## مصادر

- [وثائق Drift للكتابة والمعاملات](https://drift.simonbinder.eu/dart_api/writes/).
- [وثائق Drift لمشاركة الاتصالات بين isolates](https://drift.simonbinder.eu/isolates/).
- [حزمة drift_flutter وإعداد shareAcrossIsolates](https://pub.dev/packages/drift_flutter).
- [RFC 9110، دلالات إعادة محاولات الطلبات idempotent](https://www.rfc-editor.org/rfc/rfc9110).
- [Stripe، idempotent requests كمثال موثق لسلوك إعادة المحاولة](https://docs.stripe.com/api/idempotent_requests).
