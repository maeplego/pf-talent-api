import { ulid } from "ulidx";
import type { Application, ApplicationStatus, BookingConfirmedEvent, Job } from "./domain.js";
import type { Store } from "./store.js";

export class MemoryStore implements Store {
  private jobs = new Map<string, Job>();
  private applications = new Map<string, Application>();

  async createJob(input: Omit<Job, "id">): Promise<Job> {
    const row: Job = { id: ulid(), ...input };
    this.jobs.set(row.id, row);
    return row;
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
}

