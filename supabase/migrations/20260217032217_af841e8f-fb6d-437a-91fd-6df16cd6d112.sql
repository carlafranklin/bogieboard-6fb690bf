
-- Create storage bucket for partner event images
INSERT INTO storage.buckets (id, name, public) VALUES ('partner-event-images', 'partner-event-images', true);

CREATE POLICY "Anyone can view partner event images" ON storage.objects
  FOR SELECT USING (bucket_id = 'partner-event-images');

CREATE POLICY "Partners can upload event images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'partner-event-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Partners can update event images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'partner-event-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Partners can delete event images" ON storage.objects
  FOR DELETE USING (bucket_id = 'partner-event-images' AND auth.uid()::text = (storage.foldername(name))[1]);
