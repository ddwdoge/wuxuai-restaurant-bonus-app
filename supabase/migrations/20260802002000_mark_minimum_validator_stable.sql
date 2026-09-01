-- Align validator volatility with PostgreSQL's jsonb construction functions.

alter function public.validate_minimum_points_amount_v1(integer) stable;

notify pgrst, 'reload schema';
