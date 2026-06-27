-- ================================================================
-- Migration: 20260627000001_metro_areas_add_updated_at.sql
-- Applies to: Dev Supabase (abkijvqhrvduqqzglfkj)
-- Purpose: Add updated_at column and BEFORE UPDATE trigger to
--          public.metro_areas.
-- Scope: metro_areas table only.
--        No RPC changes. No enum changes. No audit-table changes.
--        No seed-data changes. No Production changes.
-- Idempotent: IF NOT EXISTS / IF EXISTS guards throughout.
-- Prerequisite: public.update_updated_at_column() must exist.
--   Verify before applying:
--     SELECT routine_name FROM information_schema.routines
--     WHERE routine_schema = 'public'
--       AND routine_name = 'update_updated_at_column';
--   Expected: 1 row. Do not apply if 0 rows are returned.
-- ================================================================

-- Step 1: Add nullable column first so backfill can run before NOT NULL is enforced
ALTER TABLE public.metro_areas
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Step 2: Backfill all existing rows using created_at as the initial value
--         Targets only rows where updated_at is still NULL.
--         Safe to re-run: subsequent runs match 0 rows and do nothing.
UPDATE public.metro_areas
SET    updated_at = created_at
WHERE  updated_at IS NULL;

-- Step 3: Apply server-side default for all future inserts
ALTER TABLE public.metro_areas
  ALTER COLUMN updated_at SET DEFAULT now();

-- Step 4: Enforce NOT NULL now that every existing row has a value
ALTER TABLE public.metro_areas
  ALTER COLUMN updated_at SET NOT NULL;

-- Step 5: Add BEFORE UPDATE trigger using the existing helper function.
--         DROP IF EXISTS guard makes this safe to re-run.
DROP TRIGGER IF EXISTS trg_metro_areas_updated ON public.metro_areas;
CREATE TRIGGER trg_metro_areas_updated
  BEFORE UPDATE ON public.metro_areas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
