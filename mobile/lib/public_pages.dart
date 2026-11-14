import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'api.dart';
import 'app_theme.dart';

const _publicNavy = Color(0xFF10233F);

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
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return _PublicScaffold(
      title: 'حول النظام',
      subtitle: 'ميزات النظام التي تحافظ على موثوقية البرقيات وسلامة التشغيل.',
      child: Card(
        clipBehavior: Clip.antiAlias,
        color: colors.surface,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
              decoration: BoxDecoration(
                color: colors.surfaceContainerLow,
                border: Border(
                  bottom: BorderSide(color: colors.outlineVariant),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'ميزات النظام',
                    style: TextStyle(
                      color: colors.onSurface,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'حماية موحدة للهوية والسجل والإجراءات التشغيلية.',
                    style: TextStyle(color: colors.onSurfaceVariant),
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
                    color: colors.surfaceContainerLow,
                    border: Border.all(color: colors.outlineVariant),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: colors.tertiary.withValues(
                              alpha: 0.12,
                            ),
                            foregroundColor: colors.tertiary,
                            child: Icon(feature.$1),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  feature.$2,
                                  style: TextStyle(
                                    color: colors.onSurface,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Text(
                                  feature.$3,
                                  style: TextStyle(
                                    color: colors.onSurfaceVariant,
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
                        style: TextStyle(
                          color: colors.onSurfaceVariant,
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
}

class TermsPage extends StatelessWidget {
  const TermsPage({super.key});

  static const _sections = [
    (
      '1. نطاق التطبيق والتعريفات',
      'تسري هذه الشروط على استخدام مركز البرقيات وموقعه وتطبيقاته وخدماته وبياناته، وعلى كل مستخدم أو جهة مُنحت حق الوصول.',
    ),
    (
      '2. القبول والأهلية والتفويض',
      'يقتصر الاستخدام على الحسابات الشخصية المفوضة، وفي حدود الدور والصلاحيات الممنوحة. ويُعد الدخول أو الاستمرار في الاستخدام إقرارًا بالالتزام بهذه الشروط والسياسات المعتمدة.',
    ),
    (
      '3. الاستخدام الرسمي والمشروع',
      'يُستخدم النظام للأغراض الرسمية والمشروعة فقط، وفق مبدأ الحاجة إلى المعرفة وأقل الصلاحيات. ويحظر الاستخدام الشخصي أو الفضولي أو التضليل أو انتحال الهوية أو إساءة استخدام النظام.',
    ),
    (
      '4. السرية وحماية المعلومات',
      'تُعد البرقيات والمراسلات والمرفقات وبيانات الأفراد والمواقع والسجلات والبيانات التشغيلية والأمنية معلومات سرية. ويحظر الاطلاع أو النسخ أو التصوير أو التنزيل أو النقل أو الإفصاح دون تفويض ولغير الغرض المصرح.',
    ),
    (
      '5. قيود الاستخدام والملكية الفكرية',
      'يحظر استغلال المعلومات لمصلحة شخصية أو لطرف ثالث، أو نسخ النظام أو وثائقه أو قواعد بياناته أو تعديلها أو نشرها أو إجراء هندسة عكسية لها دون موافقة مكتوبة.',
    ),
    (
      '6. الحسابات وبيانات الاعتماد',
      'الحساب وبيانات الدخول شخصية وغير قابلة للمشاركة. يجب حماية كلمات المرور والأجهزة والجلسات، والإبلاغ فورًا عن فقدان جهاز أو كشف بيانات الدخول أو نشاط غير مألوف.',
    ),
    (
      '7. دقة السجلات والأدلة الرقمية',
      'يجب إدخال بيانات دقيقة والتحقق من المستلم والمرفقات. ويحظر تزوير البرقيات أو حذفها أو العبث بسجلات التدقيق أو التوقيت أو المرفقات أو سلسلة الحيازة الرقمية.',
    ),
    (
      '8. حماية البيانات والخصوصية',
      'تُعالج البيانات على أساس قانوني ولغرض محدد وبالقدر الضروري، مع تقييد الوصول والاحتفاظ. ويحظر نقلها إلى أجهزة أو حسابات أو خدمات خارجية غير معتمدة.',
    ),
    (
      '9. الاستخدام المسؤول واحترام الحقوق',
      'يجب أن يكون الاستخدام ضروريًا ومتناسبًا وله أساس قانوني، مع احترام الكرامة والخصوصية والمساواة وقرينة البراءة. ولا تُتخذ القرارات المؤثرة في الحقوق اعتمادًا على مخرجات آلية وحدها دون مراجعة بشرية مختصة.',
    ),
    (
      '10. أمن المعلومات والأجهزة',
      'يجب استخدام الأجهزة والشبكات والتطبيقات المعتمدة وعدم تعطيل وسائل الحماية. ويحظر تجاوز الضوابط أو إجراء اختبارات أمنية أو مشاركة لقطات وملفات حساسة خارج القنوات المعتمدة.',
    ),
    (
      '11. الإبلاغ عن الحوادث',
      'يجب الإبلاغ فورًا عن التسريب أو الوصول غير المصرح أو فقدان الجهاز أو خطأ توجيه البرقية أو الاشتباه بالاختراق، مع المحافظة على الأدلة والتعاون في التحقيق.',
    ),
    (
      '12. المراجعة والتدقيق والإفصاح',
      'يجوز للجهة مراجعة سجلات الاستخدام في الحدود القانونية. وتخضع المواد التي قد تكشف معلومات الجهة أو أعمالها لموافقة مسبقة قبل النشر أو المشاركة خارج النطاق المصرح.',
    ),
    (
      '13. إعادة المعلومات وإنهاء الوصول',
      'عند انتهاء الحاجة أو العلاقة أو بطلب الجهة، يجب وقف الاستخدام وإعادة المعلومات والوسائط أو إتلاف النسخ غير الواجب الاحتفاظ بها وفق التعليمات والقانون.',
    ),
    (
      '14. استمرار السرية',
      'تستمر التزامات السرية وعدم الاستخدام غير المصرح بعد انتهاء الحساب أو العمل، ولا تنتهي بالنسبة إلى الأسرار والبيانات التي تظل محمية بطبيعتها أو بموجب القانون.',
    ),
    (
      '15. الأطراف الثالثة ومزودو الخدمات',
      'لا يجوز منح طرف ثالث أو مزود خدمة حق الوصول أو إرسال معلومات النظام إلى خدمات عامة أو أدوات ذكاء اصطناعي أو منصات غير معتمدة إلا بموافقة صريحة وتدابير حماية مناسبة.',
    ),
    (
      '16. التوافر والتحديثات',
      'قد يخضع النظام للصيانة أو التحديث أو التوقف المؤقت لأسباب تشغيلية أو أمنية. ولا يجيز العطل تجاوز الضوابط، ويجب اتباع إجراءات العمل البديلة المعتمدة.',
    ),
    (
      '17. المخالفات والمسؤولية',
      'قد تؤدي المخالفة إلى تقييد الصلاحيات أو تعليق الحساب أو التحقيق أو الإحالة للجهات المختصة أو المطالبة بالتعويض وفق القانون، دون المساس بالحقوق والضمانات القانونية.',
    ),
    (
      '18. القانون وتسوية النزاعات',
      'تطبق القوانين واللوائح النافذة لدى الجهة المالكة والقواعد الإلزامية ذات الصلة. وتسوى الخلافات عبر القنوات المختصة دون المساس بحق اللجوء إلى الجهات القضائية.',
    ),
    (
      '19. التحديثات والأحكام الختامية',
      'يجوز تحديث الشروط عند تغير النظام أو المخاطر أو المتطلبات القانونية. وتكمل هذه الشروط سياسات أمن المعلومات وحماية البيانات والسجلات والتعليمات الداخلية، وتظل الأحكام الأخرى نافذة إذا تعذر تطبيق حكم منها.',
    ),
  ];

  @override
  Widget build(BuildContext context) => _PublicScaffold(
    title: 'الشروط والأحكام',
    subtitle: 'سياسة الاستخدام المهني والمسؤول لمركز البرقيات.',
    child: Card(
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
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurface,
                          fontWeight: FontWeight.w900,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        section.$2,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                          height: 1.8,
                        ),
                      ),
                    ],
                  ),
                ),
              )
              .toList(),
        ),
      ),
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
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Theme.of(context).colorScheme.onPrimary,
        title: const Text(
          'التحقق من صحة البرقية',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: Theme.of(context).colorScheme.primary,
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Column(
                children: [
                  Icon(
                    Icons.verified_outlined,
                    color: Theme.of(context).colorScheme.secondary,
                    size: 46,
                  ),
                  SizedBox(height: 10),
                  Text(
                    'التحقق من الوثيقة الرسمية',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onPrimary,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'تؤكد هذه الصفحة صحة المرجع فقط ولا تعرض محتوى البرقية أو بياناتها السرية.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onPrimary
                          .withValues(alpha: 0.75),
                      height: 1.5,
                    ),
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
              color: Theme.of(context).colorScheme.errorContainer,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  _error!,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onErrorContainer,
                  ),
                ),
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
    final colorScheme = Theme.of(context).colorScheme;
    final color = valid
        ? (archived ? colorScheme.tertiary : AppPalette.success)
        : colorScheme.error;
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
        Text(
          '$label: ',
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
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
            style: TextStyle(
              color: Theme.of(context).colorScheme.primary,
              fontSize: 24,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    ),
  );
}
