update public.consumer_subscriptions
set status = 'active',
    tier = 'plus',
    stripe_subscription_id = 'sub_1U3ao3IuIMPjAPFMlRo2UL8g',
    stripe_customer_id = 'cus_V3i7MZD2ZJlufO',
    price_id = 'price_1TyGmaIuIMPjAPFMMz5ANQJM',
    cancel_at_period_end = false,
    current_period_end = null,
    updated_at = now()
where user_id = '39858e66-4b0d-4175-b302-c8a452e50410';