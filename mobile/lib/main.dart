import 'package:flutter/material.dart';

import 'api.dart';

const navy = Color(0xFF101C35);
const gold = Color(0xFFC9A45C);
const canvas = Color(0xFFF5F7FA);

void main() => runApp(const PoliceTelegramsApp());

class PoliceTelegramsApp extends StatelessWidget {
  const PoliceTelegramsApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'برقيات الشرطة',
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: canvas,
      colorScheme: ColorScheme.fromSeed(seedColor: navy),
    ),
    home: const LoginPage(),
  );
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final username = TextEditingController();
  final password = TextEditingController();
  final api = PoliceApi();
  bool busy = false;
  String? error;

  Future<void> login() async {
    if (username.text.trim().isEmpty || password.text.isEmpty) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final account = await api.login(username.text.trim(), password.text);
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => DashboardPage(api: api, account: account),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(22),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Container(
                      width: 78,
                      height: 78,
                      decoration: const BoxDecoration(
                        color: navy,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.shield_outlined,
                        color: gold,
                        size: 42,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'برقيات الشرطة',
                      style: TextStyle(
                        color: navy,
                        fontSize: 27,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'منصة رسمية آمنة لإدارة البرقيات والعمليات',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 26),
                    TextField(
                      controller: username,
                      textDirection: TextDirection.ltr,
                      decoration: const InputDecoration(
                        labelText: 'اسم المستخدم',
                        prefixIcon: Icon(Icons.person_outline),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 13),
                    TextField(
                      controller: password,
                      obscureText: true,
                      textDirection: TextDirection.ltr,
                      onSubmitted: (_) => login(),
                      decoration: const InputDecoration(
                        labelText: 'كلمة المرور',
                        prefixIcon: Icon(Icons.lock_outline),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    if (error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(
                          error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: FilledButton.icon(
                        onPressed: busy ? null : login,
                        icon: busy
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.login),
                        label: Text(busy ? 'جارٍ التحقق...' : 'تسجيل الدخول'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key, required this.api, required this.account});
  final PoliceApi api;
  final Map<String, dynamic> account;
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  bool loading = true;
  String? error;
  Map<String, dynamic> stats = {};
  List<dynamic> telegrams = [];

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    setState(() => loading = true);
    try {
      final results = await Future.wait([
        widget.api.call('dashboard.stats'),
        widget.api.call('telegrams.list', input: {'page': 1, 'pageSize': 20}),
      ]);
      final list = results[1];
      if (mounted) {
        setState(() {
          stats = Map<String, dynamic>.from(results[0] as Map);
          telegrams = list is Map && list['items'] is List
              ? list['items'] as List
              : list is List
              ? list
              : [];
          error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> create() async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => CreateTelegramSheet(api: widget.api),
    );
    if (result == true) refresh();
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        title: const Text(
          'لوحة البرقيات',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(onPressed: refresh, icon: const Icon(Icons.refresh)),
          IconButton(
            onPressed: () async {
              final navigator = Navigator.of(context);
              await widget.api.logout();
              if (!mounted) return;
              navigator.pushReplacement(
                MaterialPageRoute(builder: (_) => const LoginPage()),
              );
            },
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: gold,
        foregroundColor: navy,
        onPressed: create,
        icon: const Icon(Icons.add),
        label: const Text('برقية جديدة'),
      ),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (error != null)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Text(
                          error!,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ),
                    ),
                  Text(
                    'مرحبًا ${widget.account['name'] ?? widget.account['username'] ?? ''}',
                    style: const TextStyle(
                      color: navy,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 13),
                  Row(
                    children: [
                      _stat(
                        'الإجمالي',
                        stats['total'] ?? stats['totalTelegrams'] ?? 0,
                        Icons.description_outlined,
                      ),
                      _stat(
                        'قيد المراجعة',
                        stats['inReview'] ?? stats['pending'] ?? 0,
                        Icons.pending_actions_outlined,
                      ),
                      _stat(
                        'مكتملة',
                        stats['completed'] ?? stats['approved'] ?? 0,
                        Icons.verified_outlined,
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'آخر البرقيات',
                    style: TextStyle(
                      color: navy,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (telegrams.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: Center(child: Text('لا توجد برقيات بعد')),
                      ),
                    ),
                  ...telegrams.map((item) {
                    final row = Map<String, dynamic>.from(item as Map);
                    return Card(
                      child: ListTile(
                        leading: const CircleAvatar(
                          backgroundColor: navy,
                          child: Icon(Icons.description, color: gold),
                        ),
                        title: Text(
                          '${row['subject'] ?? 'برقية بدون موضوع'}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        subtitle: Text(
                          '${row['serialCode'] ?? row['serialNumber'] ?? '—'} · ${row['status'] ?? 'مسودة'}',
                        ),
                        trailing: const Icon(Icons.chevron_left),
                      ),
                    );
                  }),
                ],
              ),
      ),
    ),
  );

  Widget _stat(String title, dynamic value, IconData icon) => Expanded(
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Icon(icon, color: gold),
            const SizedBox(height: 7),
            Text(
              '$value',
              style: const TextStyle(
                color: navy,
                fontSize: 21,
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(title, style: const TextStyle(fontSize: 10)),
          ],
        ),
      ),
    ),
  );
}

class CreateTelegramSheet extends StatefulWidget {
  const CreateTelegramSheet({super.key, required this.api});
  final PoliceApi api;
  @override
  State<CreateTelegramSheet> createState() => _CreateTelegramSheetState();
}

class _CreateTelegramSheetState extends State<CreateTelegramSheet> {
  final subject = TextEditingController();
  final recipient = TextEditingController();
  final body = TextEditingController();
  bool busy = false;
  String priority = 'normal';
  String? error;

  Future<void> submit() async {
    if (subject.text.trim().length < 2 ||
        recipient.text.trim().length < 2 ||
        body.text.trim().length < 3) {
      setState(() => error = 'أكمل الموضوع والجهة ونص البرقية');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.call(
        'telegrams.create',
        mutation: true,
        input: {
          'subject': subject.text.trim(),
          'recipient': recipient.text.trim(),
          'body': body.text.trim(),
          'classification': 'normal',
          'priority': priority,
          'category': 'administrative',
        },
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Padding(
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 18,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 18,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'إنشاء برقية جديدة',
                    style: TextStyle(
                      color: navy,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            TextField(
              controller: subject,
              decoration: const InputDecoration(
                labelText: 'موضوع البرقية',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: recipient,
              decoration: const InputDecoration(
                labelText: 'الجهة المستلمة',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: priority,
              decoration: const InputDecoration(
                labelText: 'الأولوية',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'normal', child: Text('عادية')),
                DropdownMenuItem(value: 'urgent', child: Text('عاجلة')),
                DropdownMenuItem(value: 'slow', child: Text('بطيئة')),
              ],
              onChanged: (v) => setState(() => priority = v!),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: body,
              maxLines: 7,
              decoration: const InputDecoration(
                labelText: 'نص البرقية',
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
              ),
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(error!, style: const TextStyle(color: Colors.red)),
              ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: busy ? null : submit,
              icon: const Icon(Icons.send),
              label: Text(busy ? 'جارٍ الإرسال...' : 'إرسال البرقية'),
            ),
          ],
        ),
      ),
    ),
  );
}
