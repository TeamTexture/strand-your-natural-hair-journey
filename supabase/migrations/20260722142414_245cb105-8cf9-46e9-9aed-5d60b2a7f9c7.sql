DROP FUNCTION IF EXISTS public.forum_author_meta(uuid[]);

CREATE OR REPLACE FUNCTION public.forum_author_meta(_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  city text,
  goal_title text,
  hair_type text,
  current_style text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (public.has_active_plus_subscription(auth.uid()) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'STRAND+ required';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.display_name,
    p.avatar_url,
    (
      WITH area AS (
        SELECT upper(regexp_replace(split_part(coalesce(p.postcode,''), ' ', 1), '[^A-Za-z]', '', 'g')) AS a
      )
      SELECT CASE
        WHEN a IN ('E','EC','N','NW','SE','SW','W','WC','BR','CR','DA','EN','HA','IG','KT','RM','SM','TW','UB','WD') THEN 'London'
        WHEN a = 'M'  THEN 'Manchester'
        WHEN a = 'B'  THEN 'Birmingham'
        WHEN a = 'L'  THEN 'Liverpool'
        WHEN a = 'LS' THEN 'Leeds'
        WHEN a = 'S'  THEN 'Sheffield'
        WHEN a = 'BS' THEN 'Bristol'
        WHEN a = 'G'  THEN 'Glasgow'
        WHEN a = 'EH' THEN 'Edinburgh'
        WHEN a = 'CF' THEN 'Cardiff'
        WHEN a = 'NE' THEN 'Newcastle'
        WHEN a = 'NG' THEN 'Nottingham'
        WHEN a = 'BN' THEN 'Brighton'
        WHEN a = 'OX' THEN 'Oxford'
        WHEN a = 'CB' THEN 'Cambridge'
        WHEN a = 'RG' THEN 'Reading'
        WHEN a = 'SO' THEN 'Southampton'
        WHEN a = 'PO' THEN 'Portsmouth'
        WHEN a = 'MK' THEN 'Milton Keynes'
        WHEN a = 'CV' THEN 'Coventry'
        WHEN a = 'LE' THEN 'Leicester'
        WHEN a = 'DE' THEN 'Derby'
        WHEN a = 'ST' THEN 'Stoke-on-Trent'
        WHEN a = 'SN' THEN 'Swindon'
        WHEN a = 'GL' THEN 'Gloucester'
        WHEN a = 'BA' THEN 'Bath'
        WHEN a = 'EX' THEN 'Exeter'
        WHEN a = 'PL' THEN 'Plymouth'
        WHEN a = 'TR' THEN 'Truro'
        WHEN a = 'BH' THEN 'Bournemouth'
        WHEN a = 'DT' THEN 'Dorchester'
        WHEN a = 'SP' THEN 'Salisbury'
        WHEN a = 'GU' THEN 'Guildford'
        WHEN a = 'ME' THEN 'Medway'
        WHEN a = 'CT' THEN 'Canterbury'
        WHEN a = 'TN' THEN 'Tunbridge Wells'
        WHEN a = 'RH' THEN 'Redhill'
        WHEN a = 'SL' THEN 'Slough'
        WHEN a = 'HP' THEN 'Hemel Hempstead'
        WHEN a = 'AL' THEN 'St Albans'
        WHEN a = 'SG' THEN 'Stevenage'
        WHEN a = 'LU' THEN 'Luton'
        WHEN a = 'CM' THEN 'Chelmsford'
        WHEN a = 'CO' THEN 'Colchester'
        WHEN a = 'SS' THEN 'Southend-on-Sea'
        WHEN a = 'IP' THEN 'Ipswich'
        WHEN a = 'NR' THEN 'Norwich'
        WHEN a = 'PE' THEN 'Peterborough'
        WHEN a = 'NN' THEN 'Northampton'
        WHEN a = 'OL' THEN 'Oldham'
        WHEN a = 'BL' THEN 'Bolton'
        WHEN a = 'BB' THEN 'Blackburn'
        WHEN a = 'PR' THEN 'Preston'
        WHEN a = 'FY' THEN 'Blackpool'
        WHEN a = 'LA' THEN 'Lancaster'
        WHEN a = 'CA' THEN 'Carlisle'
        WHEN a = 'CH' THEN 'Chester'
        WHEN a = 'CW' THEN 'Crewe'
        WHEN a = 'SK' THEN 'Stockport'
        WHEN a = 'WA' THEN 'Warrington'
        WHEN a = 'WN' THEN 'Wigan'
        WHEN a = 'WF' THEN 'Wakefield'
        WHEN a = 'HD' THEN 'Huddersfield'
        WHEN a = 'HX' THEN 'Halifax'
        WHEN a = 'BD' THEN 'Bradford'
        WHEN a = 'HG' THEN 'Harrogate'
        WHEN a = 'YO' THEN 'York'
        WHEN a = 'HU' THEN 'Hull'
        WHEN a = 'DN' THEN 'Doncaster'
        WHEN a = 'DL' THEN 'Darlington'
        WHEN a = 'TS' THEN 'Teesside'
        WHEN a = 'SR' THEN 'Sunderland'
        WHEN a = 'DH' THEN 'Durham'
        WHEN a = 'NP' THEN 'Newport'
        WHEN a = 'SA' THEN 'Swansea'
        WHEN a = 'LL' THEN 'Llandudno'
        WHEN a = 'SY' THEN 'Shrewsbury'
        WHEN a = 'TF' THEN 'Telford'
        WHEN a = 'DY' THEN 'Dudley'
        WHEN a = 'WS' THEN 'Walsall'
        WHEN a = 'HR' THEN 'Hereford'
        WHEN a = 'WR' THEN 'Worcester'
        WHEN a = 'KA' THEN 'Kilmarnock'
        WHEN a = 'ML' THEN 'Motherwell'
        WHEN a = 'PA' THEN 'Paisley'
        WHEN a = 'FK' THEN 'Falkirk'
        WHEN a = 'KY' THEN 'Kirkcaldy'
        WHEN a = 'DD' THEN 'Dundee'
        WHEN a = 'AB' THEN 'Aberdeen'
        WHEN a = 'IV' THEN 'Inverness'
        WHEN a = 'PH' THEN 'Perth'
        WHEN a = 'BT' THEN 'Belfast'
        WHEN a = '' THEN NULL
        ELSE NULL
      END FROM area
    ) AS city,
    (
      SELECT g.title
      FROM public.user_goals g
      WHERE g.user_id = p.user_id
        AND g.status = 'in_progress'
        AND NULLIF(trim(g.title), '') IS NOT NULL
      ORDER BY g.updated_at DESC
      LIMIT 1
    ) AS goal_title,
    NULLIF(
      trim(
        CASE
          WHEN h.surface_texture IS NOT NULL AND h.surface_texture <> '' THEN
            'Type ' || upper(replace(replace(h.surface_texture, 'type_', ''), '_', ''))
          ELSE ''
        END
      ),
      ''
    ) AS hair_type,
    NULLIF(
      trim(
        initcap(
          replace(replace(coalesce(s.current_hairstyle, ''), '_', ' '), '-', ' ')
        )
      ),
      ''
    ) AS current_style
  FROM public.profiles p
  LEFT JOIN public.user_hair_profile h ON h.user_id = p.user_id
  LEFT JOIN public.user_style_profile s ON s.user_id = p.user_id
  WHERE p.user_id = ANY(_user_ids);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.forum_author_meta(uuid[]) TO authenticated;