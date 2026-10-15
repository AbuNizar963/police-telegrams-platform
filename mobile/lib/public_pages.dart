import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'api.dart';

const _publicNavy = Color(0xFF10233F);
const _publicGold = Color(0xFFC9A45C);

class AboutPage extends StatelessWidget {
  const AboutPage({super.key});

  static const _features = [
    (
      Icons.verified_user_outlined,
      'سلامة السجل',
      'الهوية الرقمية مفعلة',
      'كل برقية تُربط بحساب منشئها وتوقيتها وسجل التدقيق.',
    ),
    (
      Icons.check_circle_outline,
      'حماية تشغيلية نشطة',
      'صلاحيات ومسارات موثقة',
      'صلاحيات واضحة ومسارات عمل موثقة مع تسجيل الإجراءات الحساسة.',
    ),
    (
      Icons.fingerprint,
      'هوية موثوقة',
      'تتبع كامل لكل إجراء',
      'تُحفظ هوية منشئ البرقية وإجراءات الإدارة لتوفير سجل قابل للمراجعة.',
    ),
    (
      Icons.lock_outline,
      'جلسة دخول مستمرة',
      '30 يومًا لكل مستخدم',
      'يبقى تسجيل الدخول فعالًا لمدة 30 يومًا وينتهي عند تسجيل الخروج.',
    ),
  ];

  @override
  Widget build(BuildContext context) => _PublicScaffold(
    title: 'حول النظام',
    subtitle: 'ميزات النظام التي تحافظ على موثوقية البرقيات وسلامة التشغيل.',
    child: Card(
      clipBehavior: Clip.antiAlias,
      color: _publicNavy,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(18, 18, 18, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'ميزات النظام',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  'حماية موحدة للهوية والسجل والإجراءات التشغيلية.',
                  style: TextStyle(color: Color(0xFFD1D9E5)),
                ),
              ],
            ),
          ),
          GridView.builder(
            padding: const EdgeInsets.all(14),
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 1,
              mainAxisExtent: 145,
              mainAxisSpacing: 10,
            ),
            itemCount: _features.length,
            itemBuilder: (context, index) {
              final feature = _features[index];
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.12),
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: _publicGold.withValues(alpha: 0.18),
                          foregroundColor: _publicGold,
                          child: Icon(feature.$1),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                feature.$2,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              Text(
                                feature.$3,
                                style: const TextStyle(
                                  color: Color(0xFFB9C5D5),
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      feature.$4,
                      style: const TextStyle(
                        color: Color(0xFFD1D9E5),
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    ),
  );
}

class TermsPage extends StatelessWidget {
  const TermsPage({super.key});

  static const _sections = [
    (
      '1. نطاق التطبيق والقبول',
      'ينظم هذا النظام استخدام المستخدمين المصرح لهم والجهات الشرطية أو الأمنية التي تديره. ويُعد الدخول إلى النظام أو استخدام وظائفه قبولًا بسياسات الجهة والقوانين النافذة.',
    ),
    (
      '2. الاستخدام المصرح والمهني',
      'يُستخدم النظام فقط للمهام الرسمية المصرح بها، وبالقدر اللازم لأداء الواجب، ووفق مبدأ الحاجة إلى المعرفة وأقل صلاحية ممكنة. يحظر إدخال بيانات مختلقة أو مشاركة الحسابات أو التحايل على الصلاحيات.',
    ),
    (
      '3. السرية والمعلومات الحساسة',
      'تُعد المعلومات التشغيلية والإدارية والتقنية وبيانات الأفراد والمرفقات وسجلات التدقيق معلومات حساسة ما لم يُصرح بخلاف ذلك. يحظر النسخ أو النقل أو الإفصاح لأي طرف غير مصرح له.',
    ),
    (
      '4. النزاهة وسلسلة الحيازة الرقمية',
      'كل برقية يجب أن تُنشأ وتُحدّث وتُحال وفق المسار الرسمي. تُحفظ هوية المنشئ والتوقيت والإجراءات في سجل التدقيق، ولا يجوز العبث بالسجلات أو المرفقات.',
    ),
    (
      '5. حماية الحساب والوصول',
      'الحساب شخصي وغير قابل للإعارة. يلتزم المستخدم بحماية كلمة المرور وتسجيل الخروج عند استخدام جهاز مشترك والإبلاغ عن فقدان الجهاز أو الاشتباه في اختراق الحساب.',
    ),
    (
      '6. الإبلاغ عن الحوادث والامتثال',
      'يجب الإبلاغ فورًا عن أي وصول غير مصرح به أو تسريب أو فقدان أو استخدام خاطئ إلى مسؤول النظام والجهة المختصة، مع الالتزام بالقوانين وسياسات أمن المعلومات.',
    ),
    (
      '7. مبادئ الاستخدام الشرطي المسؤول',
      'يجب أن يكون جمع البيانات والوصول إليها واستخدامها ضروريًا ومتناسبًا وله أساس قانوني وغاية محددة، مع احترام الكرامة وحقوق الإنسان والخصوصية وقرينة البراءة.',
    ),
    (
      '8. المراجعة والتدقيق والإفصاح',
      'تخضع المواد أو التقارير التي تتضمن معلومات حساسة لمراجعة الجهة قبل الإرسال خارج نطاقها. لا يجوز الإفصاح لطرف ثالث إلا بتفويض مكتوب أو التزام قانوني.',
    ),
    (
      '9. المخالفات والإجراءات',
      'قد تؤدي مخالفة هذه الشروط إلى سحب الصلاحيات أو تعليق الحساب أو التحقيق الإداري أو الإحالة إلى الجهات المختصة، مع احتفاظ الجهة المالكة بحق تحديث الشروط.',
    ),
  ];

  @override
  Widget build(BuildContext context) => _PublicScaffold(
    title: 'الشروط والأحكام',
    subtitle: 'سياسة الاستخدام المهني والمسؤول لمركز البرقيات.',
    child: Column(
      children: [
        Card(
          color: const Color(0xFFFFF8E8),
          child: const Padding(
            padding: EdgeInsets.all(15),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.gavel_outlined, color: Color(0xFF7A5C1E)),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'هذه الشروط تجمع متطلبات الاستخدام المهني وحماية السجل. يجب اعتمادها ومراجعتها قانونيًا من الجهة المالكة قبل اعتبارها وثيقة ملزمة خارج النظام.',
                    style: TextStyle(color: Color(0xFF624B19), height: 1.6),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: _sections
                  .map(
                    (section) => Padding(
                      padding: const EdgeInsets.only(bottom: 20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            section.$1,
                            style: const TextStyle(
                              color: _publicNavy,
                              fontWeight: FontWeight.w900,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(section.$2, style: const TextStyle(height: 1.8)),
                        ],
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
      ],
    ),
  );
}

class VerifyTelegramPage extends StatefulWidget {
  const VerifyTelegramPage({super.key, required this.api, this.initialToken});
  final PoliceApi api;
  final String? initialToken;

  @override
  State<VerifyTelegramPage> createState() => _VerifyTelegramPageState();
}

class _VerifyTelegramPageState extends State<VerifyTelegramPage> {
  late final TextEditingController _token;
  bool _loading = false;
  Map<String, dynamic>? _result;
  String? _error;

  @override
  void initState() {
    super.initState();
    _token = TextEditingController(text: widget.initialToken ?? '');
    if (_token.text.trim().isNotEmpty) _verify();
  }

  @override
  void dispose() {
    _token.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final token = _token.text.trim();
    if (token.isEmpty) {
      setState(() => _error = 'أدخل رمز التحقق الموجود في الوثيقة.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _result = null;
    });
    try {
      final response = await http.get(
        Uri.parse(
          '${widget.api.baseUrl}/api/verify/${Uri.encodeComponent(token)}',
        ),
        headers: const {'accept': 'application/json'},
      );
      final decoded = jsonDecode(response.body);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(
          decoded is Map && decoded['error'] != null
              ? '${decoded['error']}'
              : 'تعذر التحقق من رمز الوثيقة.',
        );
      }
      if (mounted) {
        setState(() => _result = Map<String, dynamic>.from(decoded as Map));
      }
    } catch (exception) {
      if (mounted) setState(() => _error = _message(exception));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _message(Object exception) =>
      exception.toString().replaceFirst('Exception: ', '');

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: _publicNavy,
        foregroundColor: Colors.white,
        title: const Text(
          'التحقق من صحة البرقية',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: _publicNavy,
            child: const Padding(
              padding: EdgeInsets.all(18),
              child: Column(
                children: [
                  Icon(Icons.verified_outlined, color: _publicGold, size: 46),
                  SizedBox(height: 10),
                  Text(
                    'التحقق من الوثيقة الرسمية',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'تؤكد هذه الصفحة صحة المرجع فقط ولا تعرض محتوى البرقية أو بياناتها السرية.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xFFD1D9E5), height: 1.5),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _token,
            textDirection: TextDirection.ltr,
            decoration: const InputDecoration(
              labelText: 'رمز التحقق',
              hintText: 'ألصق رمز التحقق من الوثيقة',
              prefixIcon: Icon(Icons.qr_code_2_outlined),
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: _loading ? null : _verify,
            icon: _loading
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.search),
            label: Text(_loading ? 'جارٍ التحقق...' : 'تحقق من البرقية'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Card(
              color: const Color(0xFFFFEEEE),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            ),
          ],
          if (_result != null) ...[
            const SizedBox(height: 12),
            _resultCard(_result!),
          ],
        ],
      ),
    ),
  );

  Widget _resultCard(Map<String, dynamic> result) {
    final valid = result['valid'] == true;
    final archived = result['status'] == 'archived';
    final color = valid
        ? (archived ? Colors.amber.shade800 : Colors.green.shade700)
        : Colors.red.shade700;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            Icon(
              valid
                  ? (archived ? Icons.help_outline : Icons.check_circle_outline)
                  : Icons.cancel_outlined,
              color: color,
              size: 54,
            ),
            const SizedBox(height: 10),
            Text(
              valid
                  ? archived
                        ? 'الوثيقة صحيحة لكنها مؤرشفة'
                        : 'تم التحقق من صحة البرقية'
                  : 'تعذر التحقق من البرقية',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: color,
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
            if (valid) ...[
              const SizedBox(height: 14),
              _detail('اسم الوحدة الشرطية', result['unitName']),
              _detail(
                'رقم البرقية',
                result['displaySerialCode'] ?? result['serialNumber'],
              ),
              _detail('تاريخ الإنشاء', result['createdAt']),
            ],
          ],
        ),
      ),
    );
  }

  Widget _detail(String label, dynamic value) => Padding(
    padding: const EdgeInsets.only(top: 8),
    child: Row(
      children: [
        Text('$label: ', style: const TextStyle(color: Colors.black54)),
        Expanded(
          child: Text(
            '${value ?? '—'}',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

class _PublicScaffold extends StatelessWidget {
  const _PublicScaffold({
    required this.title,
    required this.subtitle,
    required this.child,
  });
  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: _publicNavy,
        foregroundColor: Colors.white,
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            title,
            style: const TextStyle(
              color: _publicNavy,
              fontSize: 24,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 4),
          Text(subtitle, style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 16),
          child,
        ],
      ),
    ),
  );
}
