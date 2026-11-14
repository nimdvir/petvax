-- Default settings and a starter vaccine list (matching the vaccines offered on the
-- current Jotform intake form). Manufacturer, route and site are intentionally left
-- blank: they depend on the product actually stocked and must be entered by a clinician.
-- Forms are installed from src/lib/forms/defaults.ts (Office > Forms > Install defaults,
-- or `npm run seed:forms`).

insert into public.app_settings (id, business_name, tagline, phone, email, website, certificate_footer)
values (true, 'PetVax', 'House-call pet vaccinations in New York City', null, 'petvaxnyc@gmail.com', 'www.petvax.org',
        'This certificate reflects vaccinations recorded by PetVax. Keep it with your pet''s records.')
on conflict (id) do nothing;

insert into public.vaccine_products (name, vaccine_type, species, default_interval_months, is_rabies) values
  ('Rabies (1-year)', 'Rabies', 'dog', 12, true),
  ('Rabies (3-year)', 'Rabies', 'dog', 36, true),
  ('DHPP / DAPP', 'DHPP', 'dog', 12, false),
  ('Leptospirosis', 'Leptospirosis', 'dog', 12, false),
  ('Bordetella', 'Bordetella', 'dog', 12, false),
  ('Canine Influenza (H3N2/H3N8)', 'Canine Influenza', 'dog', 12, false),
  ('Lyme', 'Lyme', 'dog', 12, false),
  ('Rabies (1-year)', 'Rabies', 'cat', 12, true),
  ('Rabies (3-year)', 'Rabies', 'cat', 36, true),
  ('FVRCP', 'FVRCP', 'cat', 12, false),
  ('FeLV', 'FeLV', 'cat', 12, false)
on conflict do nothing;
