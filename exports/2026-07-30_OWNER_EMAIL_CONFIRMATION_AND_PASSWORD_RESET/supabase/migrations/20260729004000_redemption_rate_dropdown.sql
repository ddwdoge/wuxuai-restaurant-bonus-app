alter table public.loyalty_settings
  alter column redemption_return_rate set default 0.03;

alter table public.loyalty_settings
  drop constraint if exists loyalty_settings_redemption_return_rate_check;

alter table public.loyalty_settings
  add constraint loyalty_settings_redemption_return_rate_check
  check (
    redemption_return_rate >= 0.01
    and redemption_return_rate <= 0.10
    and redemption_return_rate = round(redemption_return_rate, 2)
  ) not valid;

-- Bestehende Altwerte bleiben unangetastet. Neue oder geänderte Zeilen müssen
-- einen ganzen Prozentwert zwischen 1 und 10 Prozent verwenden.
