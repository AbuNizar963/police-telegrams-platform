import 'package:flutter/material.dart';

import 'api.dart';
import 'telegram_outbox.dart';

const _outboxNavy = Color(0xFF10233F);
const _outboxGold = Color(0xFFD8C38E);

class TelegramOutboxPage extends StatefulWidget {
  const TelegramOutboxPage({
    super.key,
    required this.api,
    required this.outbox,
  });

  final PoliceApi api;
  final TelegramOutbox outbox;

  @override
  State<TelegramOutboxPage> createState() => _TelegramOutboxPageState();
}

class _TelegramOutboxPageState extends State<TelegramOutboxPage> {
  List<TelegramOutboxEntry> entries = const [];
  bool loading = true;
  bool syncing = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final value = await widget.outbox.list();
      if (!mounted) return;
      setState(() {
        entries = value;
        error = null;
      });
    } catch (exception) {
      if (mounted) setState(() => error = _message(exception));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _sync() async {
    if (syncing) return;
    setState(() {
      syncing = true;
      error = null;
    });
    try {
      await widget.outbox.sync(widget.api);
      await _load();
    } catch (exception) {
      if (mounted) setState(() => error = _message(exception));
    } finally {
      if (mounted) setState(() => syncing = false);
    }
  }

  Future<void> _remove(TelegramOutboxEntry entry) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('حذف البرقية المحلية؟'),
        content: const Text(
          'لن تُرسل هذه البرقية إلى الخادم بعد حذفها من صندوق المزامنة. هذا الإجراء لا يمكن التراجع عنه.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('حذف'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await widget.outbox.remove(entry.id);
    await _load();
  }

  String _message(Object exception) =>
      exception.toString().replaceFirst('Exception: ', '');

  String _date(DateTime value) {
    final local = value.toLocal();
    return '${local.year}/${local.month.toString().padLeft(2, '0')}/'
        '${local.day.toString().padLeft(2, '0')} '
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: const Text('صندوق المزامنة المحلية'),
        actions: [
          IconButton(
            tooltip: 'مزامنة الآن',
            onPressed: syncing || entries.isEmpty ? null : _sync,
            icon: const Icon(Icons.sync_outlined),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator(color: _outboxNavy))
          : entries.isEmpty
          ? _emptyState()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.cloud_off_outlined,
                            color: _outboxGold,
                            size: 30,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              '${entries.length} برقية محفوظة على الجهاز بانتظار الإرسال. ستبقى آمنة حتى عودة الاتصال.',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (error != null) _errorCard(error!),
                  const SizedBox(height: 8),
                  ...entries.map(_entryCard),
                ],
              ),
            ),
      bottomNavigationBar: syncing
          ? const LinearProgressIndicator(minHeight: 3)
          : null,
    ),
  );

  Widget _entryCard(TelegramOutboxEntry entry) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.pending_actions_outlined, color: _outboxNavy),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${entry.payload['subject'] ?? 'برقية محفوظة محليًا'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
              IconButton(
                tooltip: 'حذف',
                onPressed: syncing ? null : () => _remove(entry),
                icon: const Icon(
                  Icons.delete_outline,
                  color: Color(0xFFB42332),
                ),
              ),
            ],
          ),
          Text(
            '${entry.payload['body'] ?? ''}',
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 7),
          Text(
            'حُفظت في ${_date(entry.createdAt)} · محاولات المزامنة: ${entry.attempts}',
            style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
          ),
          if (entry.lastError != null && entry.lastError!.isNotEmpty) ...[
            const SizedBox(height: 5),
            Text(
              'آخر خطأ: ${entry.lastError}',
              style: const TextStyle(fontSize: 11, color: Color(0xFFB42332)),
            ),
          ],
        ],
      ),
    ),
  );

  Widget _emptyState() => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_done_outlined, size: 54, color: _outboxGold),
          const SizedBox(height: 12),
          const Text(
            'صندوق المزامنة فارغ',
            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
          ),
          const SizedBox(height: 6),
          const Text(
            'كل البرقيات محفوظة على الخادم، ولا توجد عمليات محلية بانتظار الإرسال.',
            textAlign: TextAlign.center,
          ),
          if (error != null) ...[
            const SizedBox(height: 12),
            _errorCard(error!),
          ],
        ],
      ),
    ),
  );

  Widget _errorCard(String text) => Card(
    color: const Color(0xFFFFEEEE),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Text(text, style: const TextStyle(color: Color(0xFFB42332))),
    ),
  );
}
