import { ulid } from "ulidx";
import type { Application, ApplicationStatus, BookingConfirmedEvent, CandidateProfile, Job, SavedSearch } from "./domain.js";
import type { JobSearchParams, Store } from "./store.js";

export class MemoryStore implements Store {
  private jobs = new Map<string, Job>();
  private applications = new Map<string, Application>();
  private profiles = new Map<string, CandidateProfile>();
  private savedSearches = new Map<string, SavedSearch>();

  async createJob(input: Omit<Job, "id">): Promise<Job> {
    const row: Job = { id: ulid(), ...input };
    this.jobs.set(row.id, row);
    return row;
  }

  async findJobById(id: string): Promise<Job | null> {
    return this.jobs.get(id) ?? null;
  }

  async listJobs(): Promise<Job[]> {
    return [...this.jobs.values()];
  }

  async searchJobs(params: JobSearchParams): Promise<Job[]> {
    let results = [...this.jobs.values()].filter((j) => j.status === "published");

    if (params.q) {
      const lower = params.q.toLowerCase();
      results = results.filter(
        (j) => j.title.toLowerCase().includes(lower) || j.description.toLowerCase().includes(lower),
      );
    }
    if (params.employmentType) {
      results = results.filter((j) => j.employmentType === params.employmentType);
    }
    if (params.remote !== undefined) {
      results = results.filter((j) => j.remote === params.remote);
    }
    if (params.skills && params.skills.length > 0) {
      const wanted = params.skills.map((s) => s.toLowerCase());
      results = results.filter((j) =>
        wanted.some((w) => j.skills.some((s) => s.toLowerCase() === w)),
      );
    }
    if (params.salaryMin !== undefined) {
      results = results.filter((j) => j.salaryMax !== null && j.salaryMax >= params.salaryMin!);
    }
    if (params.salaryMax !== undefined) {
      results = results.filter((j) => j.salaryMin !== null && j.salaryMin <= params.salaryMax!);
    }

    return results;
  }

  async createSavedSearch(input: Omit<SavedSearch, "id" | "lastRunAt">): Promise<SavedSearch> {
    const row: SavedSearch = {
      id: ulid(),
      lastRunAt: null,
      ...input,
    };
    this.savedSearches.set(row.id, row);
    return row;
  }

  async listSavedSearches(candidateSub: string): Promise<SavedSearch[]> {
    return [...this.savedSearches.values()].filter((row) => row.candidateSub === candidateSub);
  }

  async runSavedSearch(id: string, now: string): Promise<{ savedSearch: SavedSearch; jobs: Job[] } | null> {
    const savedSearch = this.savedSearches.get(id);
    if (!savedSearch) {
      return null;
    }
    const jobs = await this.searchJobs({
      q: savedSearch.query || undefined,
      employmentType: savedSearch.employmentType,
      remote: savedSearch.remote,
      skills: savedSearch.skills,
      salaryMin: savedSearch.salaryMin,
      salaryMax: savedSearch.salaryMax,
    });
    savedSearch.lastRunAt = now;
    this.savedSearches.set(savedSearch.id, savedSearch);
    return { savedSearch, jobs };
  }

  async createApplication(input: Omit<Application, "id" | "status">): Promise<Application> {
    const row: Application = {
      id: ulid(),
      status: "applied",
      ...input,
    };
    this.applications.set(row.id, row);
    return row;
  }

  async updateApplicationStatus(id: string, status: ApplicationStatus): Promise<Application | null> {
    const found = this.applications.get(id);
    if (!found) {
      return null;
    }
    found.status = status;
    this.applications.set(id, found);
    return found;
  }

  async attachCalendarExternalRef(id: string, externalRef: string): Promise<Application | null> {
    const found = this.applications.get(id);
    if (!found) {
      return null;
    }
    found.calendarExternalRef = externalRef;
    this.applications.set(id, found);
    return found;
  }

  async findApplicationById(id: string): Promise<Application | null> {
    return this.applications.get(id) ?? null;
  }

  async findApplicationByExternalRef(externalRef: string): Promise<Application | null> {
    for (const row of this.applications.values()) {
      if (row.calendarExternalRef === externalRef) {
        return row;
      }
    }
    return null;
  }

  async markInterviewByBooking(event: BookingConfirmedEvent): Promise<Application | null> {
    const ext = event.data.externalRef?.trim();
    if (!ext) {
      return null;
    }
    const app = await this.findApplicationByExternalRef(ext);
    if (!app) {
      return null;
    }
    app.status = "interview";
    app.interviewBookingId = event.data.bookingId;
    this.applications.set(app.id, app);
    return app;
  }

  async upsertProfile(profile: CandidateProfile): Promise<CandidateProfile> {
    this.profiles.set(profile.sub, profile);
    return profile;
  }

  async findProfileBySub(sub: string): Promise<CandidateProfile | null> {
    return this.profiles.get(sub) ?? null;
  }
}

