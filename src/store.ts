import type { Application, ApplicationStatus, BookingConfirmedEvent, CandidateProfile, EmploymentType, Job, Report, SavedSearch } from "./domain.js";

export type JobSearchParams = {
  q?: string;
  employmentType?: EmploymentType;
  remote?: boolean;
  skills?: string[];
  salaryMin?: number;
  salaryMax?: number;
};

export type Store = {
  createJob(input: Omit<Job, "id">): Promise<Job>;
  createApplication(input: Omit<Application, "id" | "status">): Promise<Application>;
  findJobById(id: string): Promise<Job | null>;
  listJobs(): Promise<Job[]>;
  listJobsByEmployer(employerSub: string): Promise<Job[]>;
  searchJobs(params: JobSearchParams): Promise<Job[]>;
  listApplicationsByJob(jobId: string): Promise<Application[]>;
  listApplicationsByCandidate(candidateSub: string): Promise<Application[]>;
  createSavedSearch(input: Omit<SavedSearch, "id" | "lastRunAt">): Promise<SavedSearch>;
  listSavedSearches(candidateSub: string): Promise<SavedSearch[]>;
  runSavedSearch(id: string, now: string): Promise<{ savedSearch: SavedSearch; jobs: Job[] } | null>;
  createReport(input: Omit<Report, "id" | "createdAt" | "status">, now: string): Promise<Report>;
  listReports(): Promise<Report[]>;
  updateApplicationStatus(id: string, status: ApplicationStatus): Promise<Application | null>;
  attachCalendarExternalRef(id: string, externalRef: string): Promise<Application | null>;
  findApplicationById(id: string): Promise<Application | null>;
  findApplicationByExternalRef(externalRef: string): Promise<Application | null>;
  markInterviewByBooking(event: BookingConfirmedEvent): Promise<Application | null>;
  upsertProfile(profile: CandidateProfile): Promise<CandidateProfile>;
  findProfileBySub(sub: string): Promise<CandidateProfile | null>;
};

