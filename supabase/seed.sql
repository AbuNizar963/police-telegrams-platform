-- Local development only. Do not put real officers, passwords, or production data here.

insert into public.department_settings (
  "configKey",
  "departmentName",
  "unitName",
  timezone
)
values ('primary', 'إدارة الشرطة', 'وحدة العمليات', 'Asia/Damascus')
on conflict ("configKey") do update
set
  "departmentName" = excluded."departmentName",
  "unitName" = excluded."unitName",
  timezone = excluded.timezone;
