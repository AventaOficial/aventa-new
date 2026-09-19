-- Reproduce the exact insert handle_new_user does, inside a txn that rolls back.
-- Uses a temp auth.users insert if permitted; otherwise just try profiles insert after
-- checking last_value of sequences.
SELECT last_value AS user_number_seq_last FROM user_number_seq;
SELECT last_value AS profiles_join_seq_last FROM profiles_join_seq;
SELECT COUNT(*)::int AS admin_count FROM public.profiles WHERE role = 'admin';
SELECT COUNT(*)::int AS user_count FROM public.profiles WHERE role = 'user';
