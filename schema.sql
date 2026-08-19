-- Local / overlay demo schema. ULID ids, timestamptz clocks.
-- Search: tsvector (simple, no English stemming) + pg_trgm for Japanese/partial.
-- OpenSearch is not in this slice.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- to_tsvector(regconfig, text) is STABLE; generated columns need IMMUTABLE.
CREATE OR REPLACE FUNCTION jobs_search_tsv(title text, description text, location text, skills text[])
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A')
      || setweight(to_tsvector('simple'::regconfig, coalesce(description, '')), 'B')
      || setweight(to_tsvector('simple'::regconfig, coalesce(location, '')), 'C')
      || setweight(to_tsvector('simple'::regconfig, coalesce(array_to_string(skills, ' '), '')), 'B');
$$;

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  employer_sub TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  remote BOOLEAN NOT NULL DEFAULT FALSE,
  salary_min INTEGER,
  salary_max INTEGER,
  skills TEXT[] NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  search_tsv tsvector GENERATED ALWAYS AS (
    jobs_search_tsv(title, description, location, skills)
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (jobs_search_tsv(title, description, location, skills)) STORED;

CREATE INDEX IF NOT EXISTS jobs_search_tsv_gin ON jobs USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS jobs_title_trgm_gin ON jobs USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS jobs_description_trgm_gin ON jobs USING GIN (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS jobs_location_trgm_gin ON jobs USING GIN (location gin_trgm_ops);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  candidate_sub TEXT NOT NULL,
  resume_snapshot TEXT NOT NULL,
  status TEXT NOT NULL,
  calendar_external_ref TEXT,
  interview_booking_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS applications_job_id_idx ON applications (job_id);
CREATE INDEX IF NOT EXISTS applications_candidate_sub_idx ON applications (candidate_sub);
CREATE INDEX IF NOT EXISTS applications_calendar_external_ref_idx ON applications (calendar_external_ref);

CREATE TABLE IF NOT EXISTS profiles (
  sub TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  desired_employment_types TEXT[] NOT NULL DEFAULT '{}',
  desired_min_salary INTEGER,
  desired_remote BOOLEAN NOT NULL DEFAULT FALSE,
  bio TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  candidate_sub TEXT NOT NULL,
  name TEXT NOT NULL,
  query TEXT NOT NULL DEFAULT '',
  employment_type TEXT,
  remote BOOLEAN,
  skills TEXT[] NOT NULL DEFAULT '{}',
  salary_min INTEGER,
  salary_max INTEGER,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_searches_candidate_sub_idx ON saved_searches (candidate_sub);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_sub TEXT NOT NULL,
  job_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
