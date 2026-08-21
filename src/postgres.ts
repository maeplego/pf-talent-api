import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { ulid } from "ulidx";
import type {
  Application,
  ApplicationStatus,
  BookingConfirmedEvent,
  CandidateProfile,
  EmploymentType,
  Job,
  Report,
  SavedSearch,
} from "./domain.js";
import type { JobSearchParams, Store } from "./store.js";

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "schema.sql");

type JobRow = {
  id: string;
  employer_sub: string;
  org_id: string;
  title: string;
  status: Job["status"];
  employment_type: EmploymentType;
  location: string;
  remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  skills: string[] | null;
  description: string;
};

type ApplicationRow = {
  id: string;
  job_id: string;
  candidate_sub: string;
  resume_snapshot: string;
  status: ApplicationStatus;
  calendar_external_ref: string | null;
  interview_booking_id: string | null;
};

type ProfileRow = {
  sub: string;
  display_name: string;
  skills: string[] | null;
  desired_employment_types: string[] | null;
  desired_min_salary: number | null;
  desired_remote: boolean;
  bio: string;
};

type SavedSearchRow = {
  id: string;
  candidate_sub: string;
  name: string;
  query: string;
  employment_type: EmploymentType | null;
  remote: boolean | null;
  skills: string[] | null;
  salary_min: number | null;
  salary_max: number | null;
  last_run_at: Date | null;
};

type ReportRow = {
  id: string;
  reporter_sub: string;
  job_id: string;
  reason: string;
  status: Report["status"];
  created_at: Date;
};

function mapJob(row: JobRow): Job {
  return {
    id: row.id,
    employerSub: row.employer_sub,
    orgId: row.org_id,
    title: row.title,
    status: row.status,
    employmentType: row.employment_type,
    location: row.location,
    remote: row.remote,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    skills: row.skills ?? [],
    description: row.description,
  };
}

function mapApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    jobId: row.job_id,
    candidateSub: row.candidate_sub,
    resumeSnapshot: row.resume_snapshot,
    status: row.status,
    calendarExternalRef: row.calendar_external_ref ?? undefined,
    interviewBookingId: row.interview_booking_id ?? undefined,
  };
}

function mapProfile(row: ProfileRow): CandidateProfile {
  return {
    sub: row.sub,
    displayName: row.display_name,
    skills: row.skills ?? [],
    desiredEmploymentTypes: (row.desired_employment_types ?? []) as EmploymentType[],
    desiredMinSalary: row.desired_min_salary,
    desiredRemote: row.desired_remote,
    bio: row.bio,
  };
}

function mapSavedSearch(row: SavedSearchRow): SavedSearch {
  return {
    id: row.id,
    candidateSub: row.candidate_sub,
    name: row.name,
    query: row.query,
    employmentType: row.employment_type ?? undefined,
    remote: row.remote ?? undefined,
    skills: row.skills ?? [],
    salaryMin: row.salary_min ?? undefined,
    salaryMax: row.salary_max ?? undefined,
    lastRunAt: row.last_run_at ? row.last_run_at.toISOString() : null,
  };
}

/** LIKE wildcards in user q must not become patterns. Escape char is '!'. */
function likeContains(q: string): string {
  return `%${q.replace(/[!%_]/g, "!$&")}%`;
}

function mapReport(row: ReportRow): Report {
  return {
    id: row.id,
    reporterSub: row.reporter_sub,
    jobId: row.job_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

export class PostgresStore implements Store {
  constructor(private readonly pool: pg.Pool) {}

  static async connect(databaseUrl: string): Promise<PostgresStore> {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const store = new PostgresStore(pool);
    await store.migrate();
    return store;
  }

  async migrate(): Promise<void> {
    const sql = await readFile(schemaPath, "utf8");
    await this.pool.query(sql);
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async createJob(input: Omit<Job, "id">): Promise<Job> {
    const id = ulid();
    const found = await this.pool.query<JobRow>(
      `INSERT INTO jobs (
         id, employer_sub, org_id, title, status, employment_type, location, remote,
         salary_min, salary_max, skills, description
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        id,
        input.employerSub,
        input.orgId,
        input.title,
        input.status,
        input.employmentType,
        input.location,
        input.remote,
        input.salaryMin,
        input.salaryMax,
        input.skills,
        input.description,
      ],
    );
    return mapJob(found.rows[0]);
  }

  async findJobById(id: string): Promise<Job | null> {
    const found = await this.pool.query<JobRow>("SELECT * FROM jobs WHERE id = $1", [id]);
    return found.rowCount ? mapJob(found.rows[0]) : null;
  }

  async listJobs(orgId?: string): Promise<Job[]> {
    if (!orgId) {
      const found = await this.pool.query<JobRow>("SELECT * FROM jobs ORDER BY created_at");
      return found.rows.map(mapJob);
    }
    const found = await this.pool.query<JobRow>("SELECT * FROM jobs WHERE org_id = $1 ORDER BY created_at", [orgId]);
    return found.rows.map(mapJob);
  }

  async listJobsByEmployer(employerSub: string, orgId: string): Promise<Job[]> {
    const found = await this.pool.query<JobRow>(
      "SELECT * FROM jobs WHERE employer_sub = $1 AND org_id = $2 ORDER BY created_at",
      [employerSub, orgId],
    );
    return found.rows.map(mapJob);
  }

  async searchJobs(params: JobSearchParams): Promise<Job[]> {
    const q = params.q?.trim() || null;
    const found = await this.pool.query<JobRow>(
      `SELECT *
       FROM jobs
       WHERE org_id = $8
         AND status = 'published'
         AND (
           $1::text IS NULL
           OR search_tsv @@ plainto_tsquery('simple', $1)
           OR title ILIKE $7 ESCAPE '!'
           OR description ILIKE $7 ESCAPE '!'
           OR location ILIKE $7 ESCAPE '!'
           OR array_to_string(skills, ' ') ILIKE $7 ESCAPE '!'
           OR similarity(title, $1) >= 0.3
           OR word_similarity($1, title) >= 0.4
           OR word_similarity($1, description) >= 0.4
         )
         AND ($2::text IS NULL OR employment_type = $2)
         AND ($3::boolean IS NULL OR remote = $3)
         AND (
           $4::text[] IS NULL OR EXISTS (
             SELECT 1
             FROM unnest(skills) AS s(skill)
             JOIN unnest($4::text[]) AS w(wanted) ON lower(s.skill) = lower(w.wanted)
           )
         )
         AND ($5::int IS NULL OR (salary_max IS NOT NULL AND salary_max >= $5))
         AND ($6::int IS NULL OR (salary_min IS NOT NULL AND salary_min <= $6))
       ORDER BY
         CASE
           WHEN $1::text IS NULL THEN 0
           ELSE ts_rank_cd(search_tsv, plainto_tsquery('simple', $1))
             + greatest(similarity(title, $1), word_similarity($1, title))
         END DESC,
         created_at`,
      [
        q,
        params.employmentType ?? null,
        params.remote ?? null,
        params.skills && params.skills.length > 0 ? params.skills : null,
        params.salaryMin ?? null,
        params.salaryMax ?? null,
        q ? likeContains(q) : null,
        params.orgId,
      ],
    );
    return found.rows.map(mapJob);
  }

  async createApplication(input: Omit<Application, "id" | "status">): Promise<Application> {
    const id = ulid();
    const found = await this.pool.query<ApplicationRow>(
      `INSERT INTO applications (
         id, job_id, candidate_sub, resume_snapshot, status, calendar_external_ref, interview_booking_id
       ) VALUES ($1,$2,$3,$4,'applied',$5,$6)
       RETURNING *`,
      [id, input.jobId, input.candidateSub, input.resumeSnapshot, input.calendarExternalRef ?? null, input.interviewBookingId ?? null],
    );
    return mapApplication(found.rows[0]);
  }

  async listApplicationsByJob(jobId: string): Promise<Application[]> {
    const found = await this.pool.query<ApplicationRow>(
      "SELECT * FROM applications WHERE job_id = $1 ORDER BY created_at",
      [jobId],
    );
    return found.rows.map(mapApplication);
  }

  async listApplicationsByCandidate(candidateSub: string): Promise<Application[]> {
    const found = await this.pool.query<ApplicationRow>(
      "SELECT * FROM applications WHERE candidate_sub = $1 ORDER BY created_at",
      [candidateSub],
    );
    return found.rows.map(mapApplication);
  }

  async createSavedSearch(input: Omit<SavedSearch, "id" | "lastRunAt">): Promise<SavedSearch> {
    const id = ulid();
    const found = await this.pool.query<SavedSearchRow>(
      `INSERT INTO saved_searches (
         id, candidate_sub, name, query, employment_type, remote, skills, salary_min, salary_max, last_run_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL)
       RETURNING *`,
      [
        id,
        input.candidateSub,
        input.name,
        input.query,
        input.employmentType ?? null,
        input.remote ?? null,
        input.skills,
        input.salaryMin ?? null,
        input.salaryMax ?? null,
      ],
    );
    return mapSavedSearch(found.rows[0]);
  }

  async listSavedSearches(candidateSub: string): Promise<SavedSearch[]> {
    const found = await this.pool.query<SavedSearchRow>(
      "SELECT * FROM saved_searches WHERE candidate_sub = $1 ORDER BY created_at",
      [candidateSub],
    );
    return found.rows.map(mapSavedSearch);
  }

  async runSavedSearch(id: string, now: string, orgId: string): Promise<{ savedSearch: SavedSearch; jobs: Job[] } | null> {
    const found = await this.pool.query<SavedSearchRow>("SELECT * FROM saved_searches WHERE id = $1", [id]);
    if (!found.rowCount) {
      return null;
    }
    const savedSearch = mapSavedSearch(found.rows[0]);
    const jobs = await this.searchJobs({
      orgId,
      q: savedSearch.query || undefined,
      employmentType: savedSearch.employmentType,
      remote: savedSearch.remote,
      skills: savedSearch.skills,
      salaryMin: savedSearch.salaryMin,
      salaryMax: savedSearch.salaryMax,
    });
    const updated = await this.pool.query<SavedSearchRow>(
      "UPDATE saved_searches SET last_run_at = $2::timestamptz, updated_at = now() WHERE id = $1 RETURNING *",
      [id, now],
    );
    return { savedSearch: mapSavedSearch(updated.rows[0]), jobs };
  }

  async createReport(input: Omit<Report, "id" | "createdAt" | "status">, now: string): Promise<Report> {
    const id = ulid();
    const found = await this.pool.query<ReportRow>(
      `INSERT INTO reports (id, reporter_sub, job_id, reason, status, created_at)
       VALUES ($1,$2,$3,$4,'open',$5::timestamptz)
       RETURNING *`,
      [id, input.reporterSub, input.jobId, input.reason, now],
    );
    return mapReport(found.rows[0]);
  }

  async listReports(): Promise<Report[]> {
    const found = await this.pool.query<ReportRow>("SELECT * FROM reports ORDER BY created_at");
    return found.rows.map(mapReport);
  }

  async updateApplicationStatus(id: string, status: ApplicationStatus): Promise<Application | null> {
    const found = await this.pool.query<ApplicationRow>(
      "UPDATE applications SET status = $2, updated_at = now() WHERE id = $1 RETURNING *",
      [id, status],
    );
    return found.rowCount ? mapApplication(found.rows[0]) : null;
  }

  async attachCalendarExternalRef(id: string, externalRef: string): Promise<Application | null> {
    const found = await this.pool.query<ApplicationRow>(
      "UPDATE applications SET calendar_external_ref = $2, updated_at = now() WHERE id = $1 RETURNING *",
      [id, externalRef],
    );
    return found.rowCount ? mapApplication(found.rows[0]) : null;
  }

  async findApplicationById(id: string): Promise<Application | null> {
    const found = await this.pool.query<ApplicationRow>("SELECT * FROM applications WHERE id = $1", [id]);
    return found.rowCount ? mapApplication(found.rows[0]) : null;
  }

  async findApplicationByExternalRef(externalRef: string): Promise<Application | null> {
    const found = await this.pool.query<ApplicationRow>(
      "SELECT * FROM applications WHERE calendar_external_ref = $1 ORDER BY created_at LIMIT 1",
      [externalRef],
    );
    return found.rowCount ? mapApplication(found.rows[0]) : null;
  }

  async markInterviewByBooking(event: BookingConfirmedEvent): Promise<Application | null> {
    const ext = event.data.externalRef?.trim();
    if (!ext) {
      return null;
    }
    const found = await this.pool.query<ApplicationRow>(
      `UPDATE applications
       SET status = 'interview', interview_booking_id = $2, updated_at = now()
       WHERE id = (
         SELECT id FROM applications WHERE calendar_external_ref = $1 ORDER BY created_at LIMIT 1
       )
       RETURNING *`,
      [ext, event.data.bookingId],
    );
    return found.rowCount ? mapApplication(found.rows[0]) : null;
  }

  async upsertProfile(profile: CandidateProfile): Promise<CandidateProfile> {
    const found = await this.pool.query<ProfileRow>(
      `INSERT INTO profiles (
         sub, display_name, skills, desired_employment_types, desired_min_salary, desired_remote, bio
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (sub) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         skills = EXCLUDED.skills,
         desired_employment_types = EXCLUDED.desired_employment_types,
         desired_min_salary = EXCLUDED.desired_min_salary,
         desired_remote = EXCLUDED.desired_remote,
         bio = EXCLUDED.bio,
         updated_at = now()
       RETURNING *`,
      [
        profile.sub,
        profile.displayName,
        profile.skills,
        profile.desiredEmploymentTypes,
        profile.desiredMinSalary,
        profile.desiredRemote,
        profile.bio,
      ],
    );
    return mapProfile(found.rows[0]);
  }

  async findProfileBySub(sub: string): Promise<CandidateProfile | null> {
    const found = await this.pool.query<ProfileRow>("SELECT * FROM profiles WHERE sub = $1", [sub]);
    return found.rowCount ? mapProfile(found.rows[0]) : null;
  }
}
