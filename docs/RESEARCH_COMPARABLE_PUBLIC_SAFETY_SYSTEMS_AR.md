# أنماط أنظمة السلامة العامة القابلة للتطبيق

**إعداد:** Manus AI
**التاريخ:** 2026-10-30

تمت دراسة ستة أمثلة تمثيلية من أنظمة CAD/RMS والاستجابة الميدانية: Mark43، Motorola PremierOne، Tyler Enterprise، Hexagon OnCall، Axon Evidence/Respond، وCentralSquare Enterprise. لا تدّعي هذه الدراسة أنها تغطي جميع المنتجات في السوق، ولا تنقل واجهة أو كوداً من أي منتج. الغرض منها استخلاص أنماط تشغيلية وأمنية قابلة للتطبيق في منصة البرقيات.

## ما يُطبق في المنصة

يُوحّد التنقل حول مهام المستخدم لا حول أسماء المكونات التقنية: لوحة المتابعة، البرقيات، العمليات والمواقع، التقارير والتصدير، إدارة الجهات، إدارة الحسابات، سجل الإجراءات، والإعدادات. تظهر العناصر حسب الدور، وتبقى الصلاحيات النهائية في API والخادم.

يعتمد البحث على خادم موحد ومرشحات واضحة حسب المستخدم، التاريخ، نوع الإجراء، رقم البرقية والجهة. تُظهر الواجهة نطاق النتائج وصلاحياتها، وتدعم تطبيعاً عربياً متحفظاً في حقول البحث دون تغيير البيانات الأصلية.

يعتمد السجل المحمي على هوية المنفذ، رتبته ودوره وقت التنفيذ، وقت الخادم، الجهاز، عنوان الشبكة، نوع الإجراء، المورد المتأثر، السبب عند الحاجة، ولقطات قبل/بعد للتعديلات الحساسة. تحفظ المرفقات بالبصمة SHA-256، وتسجل عمليات الرفع والتنزيل والتصدير والطباعة. يلزم أن يرفض المخطط أي تعديل أو حذف لسجلات التدقيق في مسار التطبيق وقاعدة البيانات.

تُعرض المواقع على أنها موقع البرقية لا تتبع حي للأفراد. يتضمن كل موقع مصدره وحداثته ودقته إن توفرت. تُحفظ الصلاحيات والنطاق التنظيمي في الخادم، ولا تُكشف مواقع أو محتويات حساسة في إشعارات أو خرائط عامة.

## ما لا يُفترض دون تحقق

لا تثبت صفحات الموردين العامة أن كل نظام يملك السجل أو فلاتر البحث أو التشفير أو سياسة الاحتفاظ نفسها في كل نسخة ونشر. شهادات المورد أو التزامه المعلن لا تعتبر امتثالاً تلقائياً للمنصة. يجب أن تراجع الجهة المالكة سياسة الاحتفاظ، موقع تخزين البيانات، MFA، الصلاحيات، التزامات الخصوصية، وقواعد مشاركة بيانات إنفاذ القانون محلياً قبل الاعتماد التشغيلي.

## مراجع مختارة

[1]: https://mark43.com/platform/cad/ "Mark43 CAD platform"
[2]: https://www.motorolasolutions.com/en_us/products/command-center-software/public-safety-software/premierone/premierone-cad.html "Motorola Solutions PremierOne CAD"
[3]: https://www.tylertech.com/products/enterprise-public-safety/enterprise-cad "Tyler Enterprise CAD"
[4]: https://www.octave.com/products/public-safety-physical-security/oncall/dispatch "Octave OnCall Dispatch"
[5]: https://www.axon.com/products/axon-evidence "Axon Evidence"
[6]: https://www.axon.com/help/admin-and-it/software/admin-and-it/user-management/groups/group-audit-trail.htm "Axon group audit trail"
[7]: https://www.centralsquare.com/solutions/public-safety-software/public-safety-suite/enterprise "CentralSquare Enterprise public safety"
[8]: https://media.centralsquare.com/wp-content/uploads/CJIS-Security-and-Compliance-Policy-Nov-2025.pdf "CentralSquare CJIS Security and Compliance Policy"
[9]: https://ico.org.uk/for-organisations/law-enforcement/guide-to-le-processing/accountability-and-governance/logging/ "ICO logging for law-enforcement processing"
[10]: https://www.ncsc.gov.uk/collection/securing-http-based-apis/6-logging-and-monitoring "NCSC logging and monitoring"
