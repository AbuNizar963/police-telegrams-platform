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
      "1. نطاق التطبيق والتعريفات",
      "يقصد بالنظام منصة مركز البرقيات وموقعها الإلكتروني وتطبيقاتها وخدماتها وقواعد بياناتها ووسائل تشغيلها واتصالها. وتشمل الجهة المالكة أو المشغلة أو المخولة بإدارة النظام، ويشمل المستخدم كل شخص مُنح حق الوصول إليه. تسري هذه الشروط على جميع صور استخدام النظام، عبر الويب أو الهاتف أو أي واجهة معتمدة، بما في ذلك إنشاء البرقيات وتحريرها وإرسالها واستلامها والبحث فيها وحفظها وتصديرها وطباعتها وإدارتها.",
    ),
    (
      "2. القبول والتفويض وحدود الصلاحية",
      "لا يُسمح باستخدام النظام إلا لمن لديه تفويض ساري وحساب شخصي، وفي حدود المهمة والدور والصلاحيات الممنوحة له. ويُعد تسجيل الدخول أو الاستمرار في الاستخدام إقرارًا بالاطلاع على هذه الشروط والالتزام بها وبالسياسات والتعليمات المعتمدة لدى الجهة. الحساب لا يمنح صاحبه صلاحيات تتجاوز اختصاصه، وعلى المستخدم التحقق من مشروعية كل عملية ومن أن الوصول إلى المعلومات لازم لأداء عمله.",
    ),
    (
      "3. الاستخدام المشروع والسلوك المهني",
      "يُستخدم النظام للأغراض الرسمية والمشروعة والمصرح بها فقط، وبالقدر اللازم لإنجاز العمل، وفق مبدأ الحاجة إلى المعرفة وأقل قدر من الصلاحيات. ويلتزم المستخدم بالدقة والحياد واحترام الكرامة والخصوصية وقرينة البراءة والحقوق التي تحميها القوانين. يحظر الاستخدام الشخصي أو الفضولي أو التجاري أو السياسي، أو تتبع الأشخاص دون مسوغ، أو انتحال الهوية، أو إدخال معلومات مضللة، أو استغلال النظام للإضرار بالغير أو التمييز أو المضايقة أو الانتقام أو تجاوز الإجراءات. لا يجوز اتخاذ إجراء يمس حقوق شخص أو حريته اعتمادًا على مؤشر آلي أو معلومة غير متحققة وحدها؛ بل يجب التحقق والمراجعة البشرية من موظف مختص ومخول، مع التمييز بين الوقائع المثبتة والادعاءات أو المعلومات غير المؤكدة.",
    ),
    (
      "4. السرية وحماية البيانات",
      "تُعد سرية كل المعلومات التي يتيحها النظام أو ينتجها أو يعالجها متى كانت طبيعتها أو ظروف الاطلاع عليها تقتضي الحماية، سواء وُسمت بالسرية أم لا. ويشمل ذلك البرقيات والمراسلات والمرفقات وبيانات الأفراد والهويات والمواقع والمعلومات التشغيلية والإدارية والأمنية وسجلات الاستخدام وبيانات الدخول. يلتزم المستخدم بالاطلاع على المعلومات واستخدامها بالقدر المصرح وللغرض الرسمي المحدد، ويحظر نسخها أو تصويرها أو تنزيلها أو نقلها أو نشرها أو مشاركتها أو كشفها لغير المخولين. ولا يكون الإفصاح خارج نطاق التفويض إلا بموافقة الجهة المختصة أو بموجب إلزام قانوني، وفي أضيق نطاق يسمح به القانون. تُستخدم البيانات الشخصية للغرض المشروع والمحدد وبالقدر الضروري، مع مراعاة دقتها وتقييد الوصول إليها والاحتفاظ بها وفق المتطلبات القانونية وسياسات الجهة. ويحظر نقلها إلى أجهزة أو حسابات أو خدمات تخزين أو مراسلة غير معتمدة.",
    ),
    (
      "5. سلامة البرقيات والسجلات والأدلة الرقمية",
      "يلتزم المستخدم بإدخال بيانات صحيحة قدر علمه، والتحقق من المستلم والمرجع والمرفقات قبل الإرسال، وتصحيح الأخطاء عبر الإجراءات المعتمدة التي تحفظ أثر التعديل وسببه. يحظر تزوير البرقيات أو حذفها أو تغييرها خارج الصلاحيات، أو العبث بسجلات التدقيق والطوابع الزمنية وبيانات المنشئ ومسار الإحالة والمرفقات والبيانات الوصفية، أو إتلاف ما قد يكون لازمًا لمراجعة أو تحقيق أو إجراء رسمي. يجب المحافظة على النسخ والسجلات ذات الصلة عند استخدامها في إجراء رسمي، وتوثيق الوصول والتصدير والنقل والتسليم وفق إجراءات الجهة وسلسلة الحيازة المعتمدة.",
    ),
    (
      "6. الحسابات والأجهزة والأمن التقني",
      "بيانات الحساب شخصية ولا يجوز مشاركتها أو تمكين الغير من استخدامها. ويتعين حماية كلمات المرور ورموز التحقق والأجهزة والجلسات، وتسجيل الخروج من الأجهزة المشتركة، واستخدام وسائل الحماية والتطبيقات والشبكات المعتمدة. يحظر تعطيل ضوابط الأمن أو التشفير أو المراقبة، أو محاولة الوصول إلى حسابات أو بيانات أو أنظمة دون إذن، أو إجراء اختبار أمني أو تحميل أدوات أو ملفات ضارة دون تكليف مكتوب من الجهة المختصة. على المستخدم الإبلاغ فورًا عن فقدان جهاز أو كشف بيانات الدخول أو نشاط غير مألوف أو اشتباه باختراق، والتعاون في الاستجابة وعدم العبث بالأدلة أو حذفها.",
    ),
    (
      "7. الإفصاح والمراجعة والإبلاغ عن الحوادث",
      "يجب الإبلاغ فورًا إلى مسؤول النظام أو أمن المعلومات والجهة المختصة عن أي فقد أو تسريب أو وصول غير مصرح به أو إرسال خاطئ أو كشف بيانات اعتماد أو عبث بسجل أو حادث قد يؤثر في سرية المعلومات أو سلامتها أو توافرها. ولا يؤخر البلاغ انتظارًا لاكتمال التفاصيل. يجوز للجهة المالكة أو من تفوضه مراجعة سجلات الاستخدام والوصول والأنشطة المرتبطة بالنظام، بالقدر اللازم للأمن والتشغيل والتحقيق والامتثال، وفي الحدود التي يسمح بها القانون. ويلتزم المستخدم بالتعاون مع المراجعة وعدم إخفاء المعلومات أو عرقلة الإجراءات. لا يجوز نشر أو عرض أو تداول مواد تكشف معلومات الجهة أو أعمالها أو أنظمتها، أو استخدام اسم الجهة أو شعارها، خارج النطاق المصرح به دون موافقة مسبقة من الجهة المخولة.",
    ),
    (
      "8. الملكية الفكرية والأطراف الثالثة",
      "تظل حقوق النظام وبرمجياته وتصميماته وقواعد بياناته ووثائقه وعلاماته ومواده لأصحابها. ولا يمنح استخدام النظام أي حق في نسخها أو تعديلها أو توزيعها أو نشرها أو استغلالها، ولا في إجراء هندسة عكسية أو تجاوز وسائل الحماية، إلا بتفويض مكتوب وبما يسمح به القانون. لا يجوز منح مزود خدمة أو طرف ثالث وصولًا إلى النظام أو بياناته، أو إرسال معلوماته إلى بريد شخصي أو منصة مشاركة أو خدمة عامة أو أداة ذكاء اصطناعي، إلا بموافقة صريحة من الجهة المختصة وبعد استيفاء ضوابط السرية والأمن وحماية البيانات.",
    ),
    (
      "9. التوافر والتحديثات واستمرارية العمل",
      "قد يخضع النظام للصيانة أو التحديث أو التوقف المؤقت لأسباب تقنية أو تشغيلية أو أمنية. وتُبذل جهود معقولة للحفاظ على استمرارية الخدمة وسلامة البيانات، دون ضمان خلو الخدمة من الانقطاع أو الأخطاء. يجوز للجهة تعديل الوظائف أو تعليقها أو إيقافها لأسباب مشروعة. ولا يجيز العطل تجاوز الضوابط أو استخدام وسائل غير معتمدة؛ وعلى المستخدم اتباع إجراءات العمل البديلة والإبلاغ عن تعذر إنجاز المعاملة وفق التعليمات.",
    ),
    (
      "10. انتهاء الصلاحية واستمرار الالتزامات",
      "يجوز للجهة تقييد الحساب أو تعليقه أو إلغاء الوصول عند انتهاء الحاجة أو تغير الدور أو انتهاء العلاقة أو وجود اشتباه أمني أو مخالفة، وفق الإجراءات المعتمدة. عند انتهاء التفويض أو بطلب الجهة، يجب التوقف عن استخدام المعلومات وإعادة ما يلزم إعادته، والتعامل مع النسخ وفق تعليمات الجهة والقانون، وعدم الاحتفاظ بنسخ شخصية أو غير مصرح بها. تظل التزامات السرية وحماية البيانات وعدم الاستخدام أو الإفصاح غير المصرح به والمحافظة على السجلات نافذة بعد انتهاء الحساب أو العمل، ما دامت المعلومات محمية بطبيعتها أو بموجب القانون أو تعليمات الجهة.",
    ),
    (
      "11. المخالفات والمسؤولية",
      "قد تؤدي مخالفة هذه الشروط إلى تقييد الصلاحيات أو تعليق الحساب أو إنهاء الوصول أو إجراء تحقيق إداري أو إحالة الواقعة إلى الجهات المختصة، وقد تنشأ عنها مسؤولية أو مطالبة بالتعويض وفق القانون والوقائع المثبتة. لا تستبعد هذه الشروط أي مسؤولية أو حق أو ضمان لا يجوز استبعاده قانونًا، ولا تنشئ بذاتها جزاءً يتجاوز ما تقرره الأنظمة والجهات المختصة.",
    ),
    (
      "12. الأحكام الختامية والتحديثات",
      "تُطبق هذه الشروط بما لا يتعارض مع القوانين واللوائح والقرارات النافذة لدى الجهة المالكة والقواعد الإلزامية ذات الصلة. وتُعالج الخلافات عبر القنوات المختصة، دون المساس بحق اللجوء إلى الجهات القضائية أو التنظيمية المختصة. يجوز تحديث هذه الشروط عند تغير النظام أو المخاطر أو المتطلبات القانونية. وتُعرض النسخة السارية داخل النظام، ويُطلب من المستخدم إعادة الإقرار بها متى اقتضى التغيير أو سياسة الجهة ذلك. تكمل هذه الشروط سياسات أمن المعلومات وحماية البيانات وإدارة السجلات والتعليمات الداخلية واتفاقيات السرية المعتمدة. وعند تعذر تطبيق حكم منها، لا يؤثر ذلك في بقية الأحكام، ويكون أي استثناء أو تعديل بموافقة موثقة من جهة مخولة.",
    ),
  ];

  @override
  Widget build(BuildContext context) => _PublicScaffold(
    title: 'الشروط والأحكام',
    subtitle:
        'إطار واضح للاستخدام المصرح والسرية وحماية المعلومات في مركز البرقيات.',
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
