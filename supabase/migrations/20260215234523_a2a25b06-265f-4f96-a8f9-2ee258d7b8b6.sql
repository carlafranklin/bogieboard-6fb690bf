-- Add 'html' to feed_type enum for web scrape targets
ALTER TYPE public.feed_type ADD VALUE IF NOT EXISTS 'html';