INSERT INTO public.ad_targeting_attributes (attribute_key, value_code, label, attribute_label, sort_order)
SELECT k.key, public.ad_style_code('Afro Mohawk'), 'Afro Mohawk', k.attr_label, 10
FROM (VALUES ('current_style','Current style'), ('planned_style','Planned next style')) AS k(key, attr_label)
ON CONFLICT DO NOTHING;