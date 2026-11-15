-- Keep direct-to-storage telegram uploads within the application's validated 10 MiB limit.
-- Files are uploaded to Supabase Storage directly using a short-lived signed upload URL.
UPDATE storage.buckets
SET file_size_limit = 10485760
WHERE id = 'telegram-files';
