-- Add stem_job_id to mix_versions
ALTER TABLE mix_versions ADD COLUMN IF NOT EXISTS stem_job_id TEXT;
