-- Login attempt tracking for rate limiting and hCaptcha enforcement
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  attempt_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ DEFAULT now(),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by email
CREATE INDEX idx_admin_login_attempts_email ON admin_login_attempts (email);
