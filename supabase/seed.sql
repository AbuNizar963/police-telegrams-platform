-- Local development only. Do not put real officers, passwords, or production data here.
-- Create the first owner through Supabase Auth, then assign the role in a protected admin workflow.

insert into public.department_settings (config_key, department_name, unit_name, timezone)
values ('primary', 'إدارة الشرطة', 'وحدة العمليات', 'Asia/Damascus')
on conflict (config_key) do update
set department_name = excluded.department_name,
    unit_name = excluded.unit_name,
    timezone = excluded.timezone;
