export const classificationLabels = {
  secret: "سري",
  normal: "عادي",
} as const;

export const priorityLabels = {
  slow: "بطيء",
  normal: "عادي",
  urgent: "عاجل",
} as const;

export const categoryLabels = {
  criminal: "جنائي",
  administrative: "إداري",
  traffic: "مروري",
  security: "أمني",
  tactical: "عملياتي",
  intelligence: "استخباراتي",
  emergency: "طوارئ",
  public_order: "حفظ النظام",
  personnel: "شؤون الأفراد",
  logistics: "إمداد ودعم",
  training: "تدريب وتأهيل",
  community: "مجتمعي وشكاوى",
  other: "أخرى",
} as const;

export const statusLabels = {
  draft: "مسودة",
  submitted: "مرسلة للمراجعة",
  in_review: "قيد المراجعة",
  approved: "معتمدة",
  returned: "معادة للتصحيح",
  rejected: "مرفوضة",
  forwarded: "محالة",
  pending: "قيد الانتظار",
  in_progress: "قيد الإجراء",
  resolved: "منجزة",
  completed: "مكتملة",
  archived: "مؤرشفة",
} as const;

export const organizationTypeLabels: Record<string, string> = {
  central: "وزارة الداخلية",
  governorate: "قيادة الأمن الداخلي في المحافظة",
  region: "قيادة المنطقة",
  police_department: "مديرية الأمن الداخلي بالريف",
  station: "المخفر",
  command: "القيادة",
  department: "القسم داخل المدينة",
  unit: "الوحدة",
};

export type Classification = keyof typeof classificationLabels;
export type Priority = keyof typeof priorityLabels;
export type Category = keyof typeof categoryLabels;
export type Status = keyof typeof statusLabels;
export type OrganizationType = keyof typeof organizationTypeLabels;

export const uiLabels = {
  appName: "نظام برقيات الشرطة",
  dashboard: "لوحة التحكم",
  telegram: "برقية",
  telegrams: "البرقيات",
  createTelegram: "إنشاء برقية",
  reports: "التقارير",
  archive: "الأرشيف",
  settings: "الإعدادات",
  profile: "الملف الشخصي",
  notifications: "التنبيهات",
  organization: "الجهة الشرطية",
  sourceOrganization: "الجهة المرسلة",
  destinationOrganization: "الجهة المستلمة",
  creator: "منشئ البرقية",
  createdAt: "تاريخ الإنشاء",
  updatedAt: "تاريخ آخر تحديث",
  decision: "القرار",
  approval: "الموافقة",
  rejection: "الرفض",
  routeRequest: "طلب إحالة",
  routeApproval: "اعتماد الإحالة",
} as const;
