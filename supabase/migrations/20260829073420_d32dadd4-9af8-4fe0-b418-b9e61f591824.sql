create table if not exists public.hair_concepts (
  id text primary key,
  label text not null,
  domain text not null check (domain in ('strand','scalp','substance','measure')),
  definition text not null,
  manuscript_source text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.hair_relationships (
  id text primary key,
  subject text not null,
  relation text not null,
  object text not null,
  polarity text not null check (polarity in ('approved','forbidden')),
  reason text not null,
  manuscript_source text not null,
  created_at timestamptz not null default now()
);

grant select on public.hair_concepts to authenticated, anon;
grant all on public.hair_concepts to service_role;
grant select on public.hair_relationships to authenticated, anon;
grant all on public.hair_relationships to service_role;

alter table public.hair_concepts enable row level security;
alter table public.hair_relationships enable row level security;

drop policy if exists "Hair concepts are readable" on public.hair_concepts;
create policy "Hair concepts are readable" on public.hair_concepts for select using (true);
drop policy if exists "Hair relationships are readable" on public.hair_relationships;
create policy "Hair relationships are readable" on public.hair_relationships for select using (true);

insert into public.hair_concepts (id, label, domain, definition, manuscript_source) values
  ('porosity', 'porosity', 'strand', 'The cuticle''s ability to absorb and release WATER. High porosity = raised cuticle: absorbs moisture easily, loses it easily. Low porosity = tightly closed cuticle: water struggles to get in, but is held well once in.', 'How To Love Your Afro — Porosity'),
  ('density', 'density', 'measure', 'The number of strands per square inch of scalp — follicle count and spacing. Nothing to do with moisture or oil.', 'How To Love Your Afro — Hair Characteristics'),
  ('elasticity', 'elasticity', 'strand', 'The hair''s ability to stretch and return without breaking — an indicator of strength and of protein–moisture balance.', 'How To Love Your Afro — Hair Characteristics'),
  ('cuticle', 'cuticle', 'strand', 'The strand''s outer scale layer; how raised or closed it sits is porosity.', 'How To Love Your Afro — Hair Architecture'),
  ('scalp', 'scalp', 'scalp', 'Skin — epidermis, dermis, hypodermis. Dermatology/trichology territory, a separate category from hair-strand science.', 'How To Love Your Afro — Trichology vs Dermatology'),
  ('sebum', 'sebum', 'scalp', 'Produced by the sebaceous glands at the follicle; lubricates hair and scalp. Over-oiling can suppress natural sebum production.', 'How To Love Your Afro — Trichology vs Dermatology / Scalp Care'),
  ('scalp_condition', 'scalp condition', 'scalp', 'Dry or oily scalp, dandruff, eczema, psoriasis, folliculitis — scalp conditions, a different category from porosity, density and elasticity.', 'How To Love Your Afro — Scalp Conditions'),
  ('water', 'water', 'substance', 'The only thing that can provide hair with moisture.', 'How To Love Your Afro — Moisture'),
  ('oil', 'oils and butters', 'substance', 'Soften, coat, seal and slow moisture LOSS. Oils are not moisturisers and do not add moisture.', 'How To Love Your Afro — Moisture / Oils'),
  ('humectant', 'humectants', 'substance', 'Aloe, glycerine, honey — attract and retain moisture from the atmosphere into the hair.', 'How To Love Your Afro — Moisture'),
  ('emollient', 'emollients', 'substance', 'Shea butter, coconut oil, mango butter, silicones — fill cuticle gaps, smooth the shaft and lock in existing moisture. They do not add moisture.', 'How To Love Your Afro — Moisture'),
  ('silicone', 'silicones', 'substance', 'Not inherently bad. Good for dry or porous hair prone to tangling; need proper cleansing to prevent build-up, especially on low-porosity hair.', 'How To Love Your Afro — Ingredient Myths'),
  ('preservative', 'preservatives', 'substance', 'Necessary and safe at formulated concentrations. "Natural = no preservatives = better" is a myth the book explicitly debunks.', 'How To Love Your Afro — Ingredient Myths'),
  ('follicle', 'follicle / root', 'scalp', 'Sits deep in the dermis. Topical products cannot reach it to stimulate growth unless genuinely medicinal (e.g. minoxidil).', 'How To Love Your Afro — Growth')
on conflict (id) do update set label = excluded.label, domain = excluded.domain, definition = excluded.definition, manuscript_source = excluded.manuscript_source;

insert into public.hair_relationships (id, subject, relation, object, polarity, reason, manuscript_source) values
  ('porosity-water', 'porosity', 'governs absorption and release of', 'water', 'approved', 'Porosity describes how readily the cuticle takes in and gives up water.', 'How To Love Your Afro — Porosity'),
  ('high-porosity-loses-water', 'high porosity', 'loses', 'water/moisture quickly', 'approved', 'A raised cuticle absorbs moisture easily and loses it easily.', 'How To Love Your Afro — Porosity'),
  ('low-porosity-resists-water', 'low porosity', 'resists entry of but holds', 'water/moisture', 'approved', 'A tightly closed cuticle makes it hard for water to enter, and holds it well once in.', 'How To Love Your Afro — Porosity'),
  ('density-follicles', 'density', 'counts', 'strands per square inch of scalp', 'approved', 'Density is follicle count and spacing.', 'How To Love Your Afro — Hair Characteristics'),
  ('elasticity-protein-moisture', 'elasticity', 'indicates', 'strength and protein–moisture balance', 'approved', 'Elasticity is the stretch-and-return test of strength.', 'How To Love Your Afro — Hair Characteristics'),
  ('sebum-glands', 'sebaceous glands at the follicle', 'produce', 'sebum', 'approved', 'Sebum comes from the sebaceous glands and lubricates hair and scalp.', 'How To Love Your Afro — Trichology vs Dermatology'),
  ('over-oiling-suppresses-sebum', 'over-oiling the scalp', 'suppresses', 'natural sebum production', 'approved', 'Too much oil on the scalp can suppress the scalp''s own sebum production.', 'How To Love Your Afro — Scalp Care'),
  ('water-moisturises', 'water', 'is the only source of', 'moisture', 'approved', '"The only thing that can provide our hair with moisture is water."', 'How To Love Your Afro — Moisture'),
  ('oil-slows-loss', 'oils and butters', 'soften, coat, seal and slow the loss of', 'moisture already in the hair', 'approved', 'Oils act on water already present; they slow its escape.', 'How To Love Your Afro — Moisture'),
  ('humectant-attracts', 'humectants', 'attract and retain from the atmosphere', 'moisture', 'approved', 'Aloe, glycerine and honey pull moisture from the air into the hair.', 'How To Love Your Afro — Moisture'),
  ('emollient-fills-gaps', 'emollients', 'fill cuticle gaps, smooth and lock in', 'existing moisture', 'approved', 'Emollients smooth the shaft and hold on to moisture already there.', 'How To Love Your Afro — Moisture'),
  ('silicone-detangling', 'silicones', 'smooth and reduce tangling on', 'dry or porous hair', 'approved', 'Silicones suit dry or porous hair prone to tangling, with proper cleansing.', 'How To Love Your Afro — Ingredient Myths'),
  ('silicone-buildup', 'silicones', 'require proper cleansing to prevent', 'build-up', 'approved', 'Build-up, especially on low-porosity hair, is the real consideration — not harm.', 'How To Love Your Afro — Ingredient Myths'),
  ('preservative-safety', 'preservatives', 'are necessary and safe at', 'formulated concentrations', 'approved', 'Preservatives protect the formula; synthetic does not mean unsafe.', 'How To Love Your Afro — Ingredient Myths'),
  ('growth-medicinal-only', 'topical products', 'cannot reach to stimulate', 'the follicle in the dermis', 'approved', 'Only genuinely medicinal actives (e.g. minoxidil) act at the root.', 'How To Love Your Afro — Growth'),
  ('porosity-oil-crossing', 'porosity / cuticle', 'must never be causally connected to', 'oil, sebum or scalp oiliness', 'forbidden', 'Porosity is the cuticle''s relationship with WATER, and sebum is scalp/skin territory. Connecting them ("high porosity hair loses oil fast") is a domain crossing the manuscript keeps apart. Say what porosity does to water, or talk about the scalp separately.', 'How To Love Your Afro — Porosity; Trichology vs Dermatology'),
  ('porosity-scalp-crossing', 'porosity / elasticity / density', 'must never be presented as a property of or cause of', 'the scalp or a scalp condition', 'forbidden', 'Strand properties (porosity, elasticity, density) and scalp conditions (dryness, oiliness, dandruff, eczema) are separate categories. A strand property never explains a scalp condition.', 'How To Love Your Afro — Trichology vs Dermatology'),
  ('density-moisture-crossing', 'density', 'must never be causally connected to', 'moisture or oil behaviour', 'forbidden', 'Density is the number of strands per square inch — follicle count and spacing. It says nothing about how hair holds moisture or oil.', 'How To Love Your Afro — Hair Characteristics'),
  ('elasticity-moisture-source', 'elasticity', 'must never be presented as', 'a measure of moisture level or oiliness', 'forbidden', 'Elasticity is stretch-and-return: strength and protein–moisture BALANCE. It is not a moisture reading and not a scalp measure.', 'How To Love Your Afro — Hair Characteristics'),
  ('oil-as-moisturiser', 'oils, butters, emollients, silicones', 'must never be described as', 'moisturising, hydrating or providing moisture', 'forbidden', 'Only water can give hair moisture. Oils, butters and emollients soften, coat and slow moisture loss — they act on water already in the hair.', 'How To Love Your Afro — Moisture'),
  ('humectant-role-inversion', 'humectants', 'must never be described as', 'sealing or locking moisture in', 'forbidden', 'Humectants (aloe, glycerine, honey) ATTRACT moisture from the atmosphere into the hair. Sealing and locking in is what emollients do.', 'How To Love Your Afro — Moisture'),
  ('emollient-role-inversion', 'emollients', 'must never be described as', 'drawing moisture from the atmosphere', 'forbidden', 'Emollients (shea butter, coconut oil, mango butter, silicones) fill cuticle gaps and hold on to moisture already there. Attracting moisture from the air is what humectants do.', 'How To Love Your Afro — Moisture'),
  ('topical-growth-stimulation', 'topical oils and serums', 'must never be described as', 'stimulating growth or reaching the follicle', 'forbidden', 'The root sits too deep in the dermis for a topical product to reach unless it is genuinely medicinal (e.g. minoxidil). A topical oil or serum cannot stimulate growth.', 'How To Love Your Afro — Growth'),
  ('silicone-negative-default', 'silicones', 'must never be framed as', 'inherently damaging or bad', 'forbidden', 'Silicones are not inherently bad: they suit dry or porous hair prone to tangling and simply need proper cleansing to avoid build-up, especially on low-porosity hair.', 'How To Love Your Afro — Ingredient Myths'),
  ('preservative-negative-default', 'preservatives', 'must never be framed as', 'harmful, or as something a "natural" formula is better without', 'forbidden', 'Preservatives are necessary and safe at formulated concentrations. "Natural means no preservatives, which is better" is a myth the book explicitly debunks.', 'How To Love Your Afro — Ingredient Myths'),
  ('sebum-porosity-production', 'sebum production', 'must never be attributed to', 'a strand property', 'forbidden', 'Sebum production is a scalp/skin function of the sebaceous glands. Porosity, density and elasticity do not raise or lower it.', 'How To Love Your Afro — Trichology vs Dermatology')
on conflict (id) do update set subject = excluded.subject, relation = excluded.relation, object = excluded.object, polarity = excluded.polarity, reason = excluded.reason, manuscript_source = excluded.manuscript_source;