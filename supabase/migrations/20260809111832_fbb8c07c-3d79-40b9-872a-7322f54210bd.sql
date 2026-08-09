update public.user_tools
set image_url = null
where image_url ~* '(s?[0-9]{1,3}x[0-9]{1,3}_|/[0-9]{1,3}x[0-9]{1,3}/|support|24[-_]?7|sprite|logo|placeholder)';

update public.user_products
set image_url = null
where image_url ~* '(s?[0-9]{1,3}x[0-9]{1,3}_|/[0-9]{1,3}x[0-9]{1,3}/|support|24[-_]?7|sprite|logo|placeholder)';