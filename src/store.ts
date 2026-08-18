import type { Application, ApplicationStatus, BookingConfirmedEvent, CandidateProfile, Job } from "./domain.js";

export type Store = {
  createJob(input: Omit<Job, "id">): Promise<Job>;
  createApplication(input: Omit<Application, "id" | "status">): Promise<Application>;
  findJobById(id: string): Promise<Job | null>;
  listJobs(): Promise<Job[]>;
  updateApplicationStatus(id: string, status: ApplicationStatus): Promise<Application | null>;
  attachCalendarExternalRef(id: string, externalRef: string): Promise<Application | null>;
  findApplicationById(id: string): Promise<Application | null>;
  findApplicationByExternalRef(externalRef: string): Promise<Application | null>;
  markInterviewByBooking(event: BookingConfirmedEvent): Promise<Application | null>;
  upsertProfile(profile: CandidateProfile): Promise<CandidateProfile>;
  findProfileBySub(sub: string): Promise<CandidateProfile | null>;
};

