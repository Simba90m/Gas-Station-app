-- ============================================================================
-- DEMO / SEED DATA — customer accounts. Same disclaimer as 02_staff.sql:
-- password123 for every demo account, local/dev only.
-- The signup trigger auto-creates each profile (role defaults to CUSTOMER,
-- which is correct here — no promotion needed) + customers row + a
-- zero-balance loyalty account.
--
-- Guarded with ON CONFLICT (id) DO NOTHING so this file is safe to run more
-- than once — see the note at the top of 01_stations.sql.
--
-- crypt()/gen_salt() are schema-qualified (extensions.crypt(...)) — see
-- supabase/migrations/20240101000170_pgcrypto_extension.sql and the note
-- in 02_staff.sql for why.
-- ============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'customer1@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Youssef Adel","phone":"+201501112221"}'),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'customer2@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Dina Mahmoud","phone":"+201501112222"}'),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'customer3@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Mahmoud Ezzat","phone":"+201501112223"}'),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'customer4@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Nour Hesham","phone":"+201501112224"}'),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'customer5@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Amira Salah","phone":"+201501112225"}')
ON CONFLICT (id) DO NOTHING;
