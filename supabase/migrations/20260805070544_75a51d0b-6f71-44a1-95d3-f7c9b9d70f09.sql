REVOKE EXECUTE ON FUNCTION public.appointments_lock_client_columns() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pro_enquiries_lock_columns() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_booking_click_prompted(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_booking_click(uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mark_booking_click_prompted(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_booking_click(uuid, text, uuid) TO authenticated;