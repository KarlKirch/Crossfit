-- One private photo per completed Rõuge CrossFit training.
-- Deployed to Supabase on 19 Nov 2026; safe when replayed in a new project.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('rcf-training-photos','rcf-training-photos',false,6291456,ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.wod_training_photos (
 training_id bigint PRIMARY KEY REFERENCES public.wod_trainings(id) ON DELETE CASCADE,
 image_path text NOT NULL UNIQUE,
 uploaded_by uuid NOT NULL REFERENCES auth.users(id),
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT rcf_training_photo_path CHECK (
   image_path ~ '^[0-9]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
   AND split_part(image_path,'/',1)=training_id::text
 )
);
ALTER TABLE public.wod_training_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wod_training_photos FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.wod_training_photos TO authenticated;
CREATE POLICY rcf_training_photo_read ON public.wod_training_photos
 FOR SELECT TO authenticated USING (
 (SELECT private.wod_is_active_user()) AND EXISTS (
 SELECT 1 FROM public.wod_trainings t WHERE t.id=training_id
 AND t.archived_at IS NULL AND t.status='published'
 AND lower(trim(t.title))='crossfit'
 AND t.created_by='783362cf-5a1c-4bc7-ac7c-76e011663bb7'::uuid
 AND t.starts_at+make_interval(mins=>greatest(0,t.duration_minutes))<=now()));
CREATE POLICY rcf_training_photo_insert ON public.wod_training_photos
 FOR INSERT TO authenticated WITH CHECK (
 (SELECT private.wod_is_trainer()) AND uploaded_by=(SELECT auth.uid())
 AND EXISTS (SELECT 1 FROM public.wod_trainings t WHERE t.id=training_id
 AND t.created_by=(SELECT auth.uid()) AND t.archived_at IS NULL
 AND t.status='published' AND lower(trim(t.title))='crossfit'
 AND t.starts_at+make_interval(mins=>greatest(0,t.duration_minutes))<=now()));
CREATE POLICY rcf_training_photo_update ON public.wod_training_photos
 FOR UPDATE TO authenticated USING (
 (SELECT private.wod_is_trainer()) AND EXISTS(
 SELECT 1 FROM public.wod_trainings t WHERE t.id=training_id
 AND t.created_by=(SELECT auth.uid()) AND t.archived_at IS NULL))
 WITH CHECK (
 (SELECT private.wod_is_trainer()) AND uploaded_by=(SELECT auth.uid())
 AND EXISTS (SELECT 1 FROM public.wod_trainings t WHERE t.id=training_id
 AND t.created_by=(SELECT auth.uid()) AND t.archived_at IS NULL
 AND t.status='published' AND lower(trim(t.title))='crossfit'
 AND t.starts_at+make_interval(mins=>greatest(0,t.duration_minutes))<=now()));
CREATE POLICY rcf_training_photo_delete ON public.wod_training_photos
 FOR DELETE TO authenticated USING (
 (SELECT private.wod_is_trainer()) AND EXISTS(
 SELECT 1 FROM public.wod_trainings t WHERE t.id=training_id
 AND t.created_by=(SELECT auth.uid())));
CREATE POLICY rcf_training_photo_file_insert ON storage.objects
 FOR INSERT TO authenticated WITH CHECK (
 bucket_id='rcf-training-photos' AND (SELECT private.wod_is_trainer())
 AND name ~ '^[0-9]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
 AND EXISTS (SELECT 1 FROM public.wod_trainings t
 WHERE t.id=split_part(name,'/',1)::bigint
 AND t.created_by=(SELECT auth.uid()) AND t.archived_at IS NULL
 AND t.status='published' AND lower(trim(t.title))='crossfit'
 AND t.starts_at+make_interval(mins=>greatest(0,t.duration_minutes))<=now()));
CREATE POLICY rcf_training_photo_file_read ON storage.objects
 FOR SELECT TO authenticated USING (
 bucket_id='rcf-training-photos'
 AND (SELECT private.wod_is_active_user())
 AND EXISTS (SELECT 1 FROM public.wod_training_photos p WHERE p.image_path=name));
CREATE POLICY rcf_training_photo_file_delete ON storage.objects
 FOR DELETE TO authenticated USING (
 bucket_id='rcf-training-photos' AND (SELECT private.wod_is_trainer()));
