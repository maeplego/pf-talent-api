import type { Application, ApplicationStatus, BookingConfirmedEvent, Job } from "./domain.js";

export type Store = {
  createJob(input: Omit<Job, "id">): Promise<Job>;
  createApplication(input: Omit<Application, "id" | "status">): Promise<Application>;
  updateApplicationStatus(id: string, status: ApplicationStatus): Promise<Application | null>;
  attachCalendarExternalRef(id: string, externalRef: string): Promise<Application | null>;
  findApplicationById(id: string): Promise<Application | null>;
  findApplicationByExternalRef(externalRef: string): Promise<Application | null>;
  markInterviewByBooking(event: BookingConfirmedEvent): Promise<Application | null>;
};

