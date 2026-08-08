UPDATE public.brand_offer_placements SET daily_rate_pence = 7500
WHERE offer_id = '298476a1-907c-43a9-8b21-baea9ae6474a' AND placement_date BETWEEN '2026-08-13' AND '2026-08-19' AND daily_rate_pence = 0;
UPDATE public.brand_offers SET total_price_pence = 67500 WHERE id = '298476a1-907c-43a9-8b21-baea9ae6474a';