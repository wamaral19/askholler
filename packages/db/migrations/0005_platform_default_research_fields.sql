-- Platform-default research fields shared by every merchant (merchant_id is
-- null). They keep attribution answers comparable across research runs, and
-- the cohort builder requires at least one published field to save a moment.
-- Idempotent so environments seeded by hand are left untouched.
INSERT INTO "research_fields" ("id", "merchant_id", "key", "name", "status")
VALUES
  ('00000000-0000-7000-8000-00000000f001', NULL, 'discovery_source', 'Discovery source', 'published'),
  ('00000000-0000-7000-8000-00000000f002', NULL, 'purchase_trigger', 'Purchase trigger', 'published'),
  ('00000000-0000-7000-8000-00000000f003', NULL, 'marketing_influence', 'Marketing influence', 'published')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "research_field_versions" ("id", "research_field_id", "version", "definition", "status", "published_at")
VALUES
  (
    '00000000-0000-7000-8000-00000000f101',
    '00000000-0000-7000-8000-00000000f001',
    1,
    '{"schemaVersion":1,"key":"discovery_source","label":"Discovery source","prompt":"Where did you first hear about the brand?","valueType":"single_select","options":[{"key":"creator","label":"Creator"},{"key":"word_of_mouth","label":"Word of mouth"},{"key":"meta","label":"Meta"},{"key":"google","label":"Google"},{"key":"other","label":"Other"}],"required":true,"evidenceExpected":true,"attributionSemantic":"self_reported_discovery","completionMode":"live"}',
    'published',
    now()
  ),
  (
    '00000000-0000-7000-8000-00000000f102',
    '00000000-0000-7000-8000-00000000f002',
    1,
    '{"schemaVersion":1,"key":"purchase_trigger","label":"Purchase trigger","prompt":"What prompted you to place this order?","valueType":"single_select","options":[{"key":"email","label":"Email"},{"key":"sms","label":"SMS"},{"key":"paid_ad","label":"Paid ad"},{"key":"planned_purchase","label":"Planned purchase"},{"key":"other","label":"Other"}],"required":true,"evidenceExpected":true,"attributionSemantic":"self_reported_trigger","completionMode":"live"}',
    'published',
    now()
  ),
  (
    '00000000-0000-7000-8000-00000000f103',
    '00000000-0000-7000-8000-00000000f003',
    1,
    '{"schemaVersion":1,"key":"marketing_influence","label":"Marketing influence","prompt":"Which marketing, if any, influenced your decision?","valueType":"long_text","required":true,"evidenceExpected":true,"attributionSemantic":"self_reported_influence","completionMode":"live"}',
    'published',
    now()
  )
ON CONFLICT ("id") DO NOTHING;
