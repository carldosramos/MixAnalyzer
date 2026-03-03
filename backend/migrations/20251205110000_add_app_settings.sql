-- Add app_settings table for global configuration
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default value for audio_root_path (can be empty initially, or default to ./uploads)
INSERT INTO app_settings (key, value) VALUES ('audio_root_path', 'uploads') ON CONFLICT (key) DO NOTHING;
