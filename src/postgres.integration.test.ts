import pg from "pg";
import { describe, expect, it } from "vitest";
import { PostgresStore } from "./postgres.js";

const databaseUrl = process.env.TALENT_DATABASE_URL?.trim();

async function postgresReachable(url: string): Promise<boolean> {
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 1500 });
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

const integrationEnabled = Boolean(databaseUrl && (await postgresReachable(databaseUrl)));

describe.skipIf(!integrationEnabled)("PostgresStore", () => {
  it("persists jobs, applications, profiles, saved searches, and reports", async () => {
    const store = await PostgresStore.connect(databaseUrl!);
    const suffix = `${Date.now()}`;
    const job = await store.createJob({
      employerSub: `employer-${suffix}`,
      orgId: "org-demo-a",
      title: `Postgres Engineer ${suffix}`,
      status: "published",
      employmentType: "full_time",
      location: "Tokyo",
      remote: true,
      salaryMin: 6000000,
      salaryMax: 9000000,
      skills: ["Go", "PostgreSQL"],
      description: "integration",
    });
    expect(job.id).toHaveLength(26);
    expect(job.orgId).toBe("org-demo-a");

    const found = await store.findJobById(job.id);
    expect(found?.title).toBe(job.title);

    const searched = await store.searchJobs({ orgId: "org-demo-a", q: "postgres engineer", skills: ["go"] });
    expect(searched.some((row) => row.id === job.id)).toBe(true);

    const japanese = await store.createJob({
      employerSub: `employer-${suffix}`,
      orgId: "org-demo-a",
      title: `バックエンドエンジニア募集 ${suffix}`,
      status: "published",
      employmentType: "full_time",
      location: "Tokyo",
      remote: true,
      salaryMin: 5000000,
      salaryMax: 8000000,
      skills: ["Go"],
      description: "日本語の部分一致用の架空求人。",
    });
    const miss = await store.createJob({
      employerSub: `employer-${suffix}`,
      orgId: "org-demo-a",
      title: `デザイナー募集 ${suffix}`,
      status: "published",
      employmentType: "full_time",
      location: "Osaka",
      remote: false,
      salaryMin: 4000000,
      salaryMax: 6000000,
      skills: ["Figma"],
      description: "UI only.",
    });
    const partialJa = await store.searchJobs({ orgId: "org-demo-a", q: "エンジ" });
    expect(partialJa.some((row) => row.id === japanese.id)).toBe(true);
    expect(partialJa.some((row) => row.id === miss.id)).toBe(false);

    const ranked = await store.searchJobs({ orgId: "org-demo-a", q: job.title });
    expect(ranked[0]?.id).toBe(job.id);

    const application = await store.createApplication({
      jobId: job.id,
      candidateSub: `candidate-${suffix}`,
      resumeSnapshot: "Go and Postgres",
      calendarExternalRef: job.id,
    });
    const updated = await store.updateApplicationStatus(application.id, "document_passed");
    expect(updated?.status).toBe("document_passed");

    const interviewed = await store.markInterviewByBooking({
      id: `evt-${suffix}`,
      type: "calendar.booking.confirmed",
      occurredAt: new Date().toISOString(),
      data: {
        bookingId: `book-${suffix}`,
        eventTypeId: "et",
        externalRef: job.id,
        hostSub: job.employerSub,
        slug: "interview-30m",
        start: new Date().toISOString(),
        end: new Date().toISOString(),
        guestName: "Candidate",
        guestEmail: "candidate@example.test",
        guestTimeZone: "Asia/Tokyo",
      },
    });
    expect(interviewed?.status).toBe("interview");
    expect(interviewed?.interviewBookingId).toBe(`book-${suffix}`);

    const profile = await store.upsertProfile({
      sub: `candidate-${suffix}`,
      displayName: "Pat",
      skills: ["Go"],
      desiredEmploymentTypes: ["full_time"],
      desiredMinSalary: 5000000,
      desiredRemote: true,
      bio: "hi",
    });
    expect((await store.findProfileBySub(profile.sub))?.displayName).toBe("Pat");

    const saved = await store.createSavedSearch({
      candidateSub: profile.sub,
      name: "Go jobs",
      query: "Postgres",
      skills: ["Go"],
    });
    const ran = await store.runSavedSearch(saved.id, new Date().toISOString(), "org-demo-a");
    expect(ran?.savedSearch.lastRunAt).toBeTruthy();
    expect(ran?.jobs.some((row) => row.id === job.id)).toBe(true);

    const report = await store.createReport(
      { reporterSub: profile.sub, jobId: job.id, reason: "spam" },
      new Date().toISOString(),
    );
    expect((await store.listReports()).some((row) => row.id === report.id)).toBe(true);
  });
});
