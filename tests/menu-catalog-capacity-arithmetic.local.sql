\set ON_ERROR_STOP on
begin;
do $$
declare pro_limit integer; plus_ten integer; fifteen jsonb; sixteen jsonb;
  pdf_sixteen jsonb;
begin
 pro_limit:=public.menu_page_capacity_for_plan_internal('PRO',0);
 plus_ten:=public.menu_page_capacity_for_plan_internal('PRO',1);
 if pro_limit<>15 or plus_ten<>25
   or public.menu_page_capacity_for_plan_internal('BASIC',0)<>10
   or public.menu_page_capacity_for_plan_internal('BASIC',1)<>20 then
   raise exception 'MENU_CAPACITY_ARITHMETIC_BASE'; end if;
 select jsonb_agg(jsonb_build_object('mime_type','image/jpeg','page_count',1))
   into fifteen from generate_series(1,15);
 select jsonb_agg(jsonb_build_object('mime_type','image/jpeg','page_count',1))
   into sixteen from generate_series(1,16);
 pdf_sixteen:=jsonb_build_array(
   jsonb_build_object('mime_type','application/pdf','page_count',14),
   jsonb_build_object('mime_type','application/pdf','page_count',2));
 if public.menu_page_count_internal(fifteen)<>15
   or public.menu_page_count_internal(sixteen)<>16
   or public.menu_page_count_internal(pdf_sixteen)<>16
   or not (public.menu_page_count_internal(fifteen)<=pro_limit)
   or not (public.menu_page_count_internal(sixteen)>pro_limit)
   or not (public.menu_page_count_internal(sixteen)<=plus_ten)
   or not (public.menu_page_count_internal(pdf_sixteen)>pro_limit) then
   raise exception 'MENU_CAPACITY_ARITHMETIC_PAGES'; end if;
end $$;
rollback;
select 'MENU_CAPACITY_ARITHMETIC_PASS_NOT_PRO_E2E';
