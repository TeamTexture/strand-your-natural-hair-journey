-- Make bucket private
update storage.buckets set public = false where id = 'voicenotes';

-- Replace the public SELECT policy with an owner-only one
drop policy if exists "Voicenotes are publicly readable" on storage.objects;

create policy "Users read own voicenotes"
  on storage.objects for select
  using (
    bucket_id = 'voicenotes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );