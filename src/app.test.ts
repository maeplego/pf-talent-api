import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { canTransition, rankSimilarJobs } from "./domain.js";
import { MemoryStore } from "./memory.js";

function jobPayload(overrides: Record<string, unknown> = {}) {
  return {
    employerSub: "employer-1",
    title: "Backend Engineer",
    status: "published",
    ...overrides,
  };
}

describe("canTransition", () => {
  it.each([
    ["applied", "document_passed", true],
    ["applied", "rejected", true],
    ["applied", "interview", false],
    ["document_passed", "interview", true],
    ["document_passed", "rejected", true],
    ["document_passed", "applied", false],
    ["interview", "offered", true],
    ["interview", "rejected", true],
    ["interview", "applied", false],
    ["offered", "rejected", false],
    ["rejected", "applied", false],
  ] as const)("%s → %s = %s", (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });
});

describe("rankSimilarJobs", () => {
  it("ranks jobs by overlapping skills", () => {
    const target = { id: "job-1", employerSub: "e1", title: "A", status: "published", employmentType: "full_time", location: "", remote: true, salaryMin: null, salaryMax: null, skills: ["Go", "PostgreSQL"], description: "" } as const;
    const ranked = rankSimilarJobs(target, [
      target,
      { ...target, id: "job-2", title: "B", skills: ["Go"] },
      { ...target, id: "job-3", title: "C", skills: ["Go", "PostgreSQL"] },
      { ...target, id: "job-4", title: "D", skills: ["React"] },
    ], 5);
    expect(ranked.map((row) => row.id)).toEqual(["job-3", "job-2"]);
  });
});

describe("talent-api", () => {
  it("serves health and readiness", async () => {
    const app = createApp(new MemoryStore());
    const health = await app.request("/health");
    const ready = await app.request("/ready");
    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
  });

  it("creates job with extended fields", async () => {
    const app = createApp(new MemoryStore());
    const res = await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload({ skills: ["Go", "PostgreSQL"], salaryMin: 5000000, salaryMax: 8000000, remote: true })),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { skills: string[]; remote: boolean };
    expect(body.skills).toEqual(["Go", "PostgreSQL"]);
    expect(body.remote).toBe(true);
  });

  it("lists jobs", async () => {
    const app = createApp(new MemoryStore());
    await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload()) });
    const res = await app.request("/v1/jobs");
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body.length).toBe(1);
  });

  it("rejects invalid state transition (applied → interview)", async () => {
    const app = createApp(new MemoryStore());
    const job = await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload()) });
    const jobBody = (await job.json()) as { id: string };
    const appRes = await app.request(`/v1/jobs/${jobBody.id}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateSub: "c1", resumeSnapshot: "resume" }),
    });
    const appBody = (await appRes.json()) as { id: string };
    const patch = await app.request(`/v1/applications/${appBody.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "interview" }),
    });
    expect(patch.status).toBe(409);
  });

  it("allows valid state transition (applied → document_passed)", async () => {
    const app = createApp(new MemoryStore());
    const job = await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload()) });
    const jobBody = (await job.json()) as { id: string };
    const appRes = await app.request(`/v1/jobs/${jobBody.id}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateSub: "c1", resumeSnapshot: "resume" }),
    });
    const appBody = (await appRes.json()) as { id: string };
    const patch = await app.request(`/v1/applications/${appBody.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "document_passed" }),
    });
    expect(patch.status).toBe(200);
  });

  it("upserts and retrieves candidate profile", async () => {
    const app = createApp(new MemoryStore());
    const profile = { sub: "candidate-1", displayName: "Alice", skills: ["TypeScript"], desiredEmploymentTypes: ["full_time"], desiredMinSalary: 4000000, desiredRemote: true, bio: "Hi" };
    const put = await app.request("/v1/profiles/candidate-1", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
    expect(put.status).toBe(200);
    const get = await app.request("/v1/profiles/candidate-1");
    expect(get.status).toBe(200);
    const body = (await get.json()) as { displayName: string };
    expect(body.displayName).toBe("Alice");
  });

  it("returns 404 for unknown profile", async () => {
    const app = createApp(new MemoryStore());
    const res = await app.request("/v1/profiles/unknown");
    expect(res.status).toBe(404);
  });

  it("filters jobs by employmentType", async () => {
    const app = createApp(new MemoryStore());
    await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload({ employmentType: "full_time" })) });
    await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload({ title: "Contract Dev", employmentType: "contract" })) });
    const res = await app.request("/v1/jobs?employmentType=contract");
    const body = (await res.json()) as { title: string }[];
    expect(body.length).toBe(1);
    expect(body[0].title).toBe("Contract Dev");
  });

  it("filters jobs by remote", async () => {
    const app = createApp(new MemoryStore());
    await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload({ remote: true })) });
    await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload({ title: "Office", remote: false })) });
    const res = await app.request("/v1/jobs?remote=true");
    const body = (await res.json()) as unknown[];
    expect(body.length).toBe(1);
  });

  it("filters jobs by skills", async () => {
    const app = createApp(new MemoryStore());
    await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload({ skills: ["Go", "PostgreSQL"] })) });
    await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload({ title: "Frontend", skills: ["React"] })) });
    const res = await app.request("/v1/jobs?skills=Go");
    const body = (await res.json()) as { title: string }[];
    expect(body.length).toBe(1);
    expect(body[0].title).toBe("Backend Engineer");
  });

  it("filters jobs by salary range", async () => {
    const app = createApp(new MemoryStore());
    await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload({ salaryMin: 5000000, salaryMax: 8000000 })) });
    await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload({ title: "Junior", salaryMin: 3000000, salaryMax: 4000000 })) });
    const res = await app.request("/v1/jobs?salaryMin=5000000");
    const body = (await res.json()) as unknown[];
    expect(body.length).toBe(1);
  });

  it("filters jobs by keyword q", async () => {
    const app = createApp(new MemoryStore());
    await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload({ description: "We use Go and Kubernetes" })) });
    await app.request("/v1/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload({ title: "Designer", description: "Figma expert" })) });
    const res = await app.request("/v1/jobs?q=kubernetes");
    const body = (await res.json()) as unknown[];
    expect(body.length).toBe(1);
  });

  it("creates and lists saved searches", async () => {
    const app = createApp(new MemoryStore());
    const created = await app.request("/v1/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateSub: "candidate-1",
        name: "Remote Go",
        query: "go",
        remote: true,
        skills: ["Go"],
      }),
    });
    expect(created.status).toBe(201);

    const listed = await app.request("/v1/candidates/candidate-1/saved-searches");
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { name: string }[];
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Remote Go");
  });

  it("runs saved search and returns matching published jobs", async () => {
    const app = createApp(new MemoryStore());
    await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload({ title: "Go Remote", remote: true, skills: ["Go"], description: "remote go role" })),
    });
    await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload({ title: "Office React", remote: false, skills: ["React"], description: "frontend" })),
    });
    const saved = await app.request("/v1/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateSub: "candidate-1",
        name: "Remote Go",
        query: "go",
        remote: true,
        skills: ["Go"],
      }),
    });
    const savedBody = (await saved.json()) as { id: string };

    const run = await app.request(`/v1/saved-searches/${savedBody.id}/run`, {
      method: "POST",
    });
    expect(run.status).toBe(200);
    const body = (await run.json()) as { matchedCount: number; matchedJobs: { title: string }[]; savedSearch: { lastRunAt: string | null } };
    expect(body.matchedCount).toBe(1);
    expect(body.matchedJobs[0].title).toBe("Go Remote");
    expect(body.savedSearch.lastRunAt).toBeTruthy();
  });

  it("returns 404 when running unknown saved search", async () => {
    const app = createApp(new MemoryStore());
    const run = await app.request("/v1/saved-searches/unknown/run", { method: "POST" });
    expect(run.status).toBe(404);
  });

  it("returns interview slots for a document-passed application via P05 APIs", async () => {
    const app = createApp(new MemoryStore());
    const originalToken = process.env.CALENDAR_INTERNAL_TOKEN;
    const originalBase = process.env.CALENDAR_API_URL;
    process.env.CALENDAR_INTERNAL_TOKEN = "test-internal-token";
    process.env.CALENDAR_API_URL = "http://calendar-api:8095";

    try {
      const job = await app.request("/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobPayload()),
      });
      const jobBody = (await job.json()) as { id: string };
      const created = await app.request(`/v1/jobs/${jobBody.id}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateSub: "candidate-1", resumeSnapshot: "resume" }),
      });
      const appBody = (await created.json()) as { id: string };
      await app.request(`/v1/applications/${appBody.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "document_passed" }),
      });

      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes("/internal/v1/hosts/")) {
          return new Response(
            JSON.stringify({
              eventTypes: [{ id: "et-1", slug: "interview-30m-demo", externalRef: jobBody.id }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            slug: "interview-30m-demo",
            name: "Interview 30m",
            durationMinutes: 30,
            hostTimeZone: "Asia/Tokyo",
            starts: ["2026-08-19T01:00:00Z"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });
      vi.stubGlobal("fetch", fetchMock);

      const slots = await app.request(
        `/v1/applications/${appBody.id}/interview-slots?rangeStart=${encodeURIComponent("2026-08-19T00:00:00Z")}&rangeEnd=${encodeURIComponent("2026-08-20T00:00:00Z")}`,
      );
      expect(slots.status).toBe(200);
      const body = (await slots.json()) as { starts: string[] };
      expect(body.starts).toEqual(["2026-08-19T01:00:00Z"]);

      vi.unstubAllGlobals();
    } finally {
      process.env.CALENDAR_INTERNAL_TOKEN = originalToken;
      process.env.CALENDAR_API_URL = originalBase;
    }
  });

  it("rejects interview slot lookup before document_passed", async () => {
    const app = createApp(new MemoryStore());
    const job = await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload()),
    });
    const jobBody = (await job.json()) as { id: string };
    const created = await app.request(`/v1/jobs/${jobBody.id}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateSub: "candidate-1", resumeSnapshot: "resume" }),
    });
    const appBody = (await created.json()) as { id: string };
    const slots = await app.request(
      `/v1/applications/${appBody.id}/interview-slots?rangeStart=${encodeURIComponent("2026-08-19T00:00:00Z")}&rangeEnd=${encodeURIComponent("2026-08-20T00:00:00Z")}`,
    );
    expect(slots.status).toBe(409);
  });

  it("returns similar jobs from local fallback", async () => {
    const app = createApp(new MemoryStore());
    const base = { employmentType: "full_time", remote: true, salaryMin: null, salaryMax: null, description: "" };
    const target = await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload({ ...base, title: "Backend", skills: ["Go", "PostgreSQL"] })),
    });
    const targetBody = (await target.json()) as { id: string };
    await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload({ ...base, title: "Go Dev", skills: ["Go"] })),
    });
    await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload({ ...base, title: "Frontend", skills: ["React"] })),
    });
    const res = await app.request(`/v1/jobs/${targetBody.id}/similar?k=5`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; jobs: { title: string }[] };
    expect(body.source).toBe("fallback");
    expect(body.jobs.map((row) => row.title)).toEqual(["Go Dev"]);
  });

  it("uses recommend API when available", async () => {
    const app = createApp(new MemoryStore());
    const originalBase = process.env.RECOMMEND_API_URL;
    process.env.RECOMMEND_API_URL = "http://recommend-api:8080";
    try {
      const target = await app.request("/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobPayload({ title: "Backend", skills: ["Go"] })),
      });
      const targetBody = (await target.json()) as { id: string };
      const other = await app.request("/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobPayload({ title: "Go Dev", skills: ["Go"] })),
      });
      const otherBody = (await other.json()) as { id: string };

      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ items: [{ item_id: otherBody.id }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const res = await app.request(`/v1/jobs/${targetBody.id}/similar`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { source: string; jobs: { id: string }[] };
      expect(body.source).toBe("recommend");
      expect(body.jobs[0].id).toBe(otherBody.id);
      vi.unstubAllGlobals();
    } finally {
      process.env.RECOMMEND_API_URL = originalBase;
    }
  });

  it("returns facet counts for published jobs", async () => {
    const app = createApp(new MemoryStore());
    await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload({ title: "Go Dev", employmentType: "full_time", remote: true, skills: ["Go"] })),
    });
    await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload({ title: "React Dev", employmentType: "contract", remote: false, skills: ["React", "Go"] })),
    });
    const res = await app.request("/v1/jobs/facets");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      employmentType: Record<string, number>;
      remote: Record<string, number>;
      skills: Record<string, number>;
    };
    expect(body.total).toBe(2);
    expect(body.employmentType.full_time).toBe(1);
    expect(body.employmentType.contract).toBe(1);
    expect(body.remote.true).toBe(1);
    expect(body.remote.false).toBe(1);
    expect(body.skills.Go).toBe(2);
  });

  it("creates and lists reports", async () => {
    const app = createApp(new MemoryStore());
    const job = await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload()),
    });
    const jobBody = (await job.json()) as { id: string };
    const created = await app.request("/v1/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reporterSub: "candidate-1", jobId: jobBody.id, reason: "spam" }),
    });
    expect(created.status).toBe(201);
    const listed = await app.request("/v1/reports");
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { reports: { reason: string; status: string }[] };
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0].reason).toBe("spam");
    expect(body.reports[0].status).toBe("open");
  });

  it("returns 404 when reporting unknown job", async () => {
    const app = createApp(new MemoryStore());
    const created = await app.request("/v1/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reporterSub: "candidate-1", jobId: "missing", reason: "spam" }),
    });
    expect(created.status).toBe(404);
  });

  it("updates application status to interview from calendar webhook", async () => {
    const app = createApp(new MemoryStore());

    const job = await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload()),
    });
    expect(job.status).toBe(201);
    const jobBody = (await job.json()) as { id: string };

    const created = await app.request(`/v1/jobs/${jobBody.id}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateSub: "candidate-1",
        resumeSnapshot: "resume text v1",
      }),
    });
    expect(created.status).toBe(201);
    const appBody = (await created.json()) as { id: string };

    const hooked = await app.request("/webhooks/calendar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Calendar-Event-Type": "calendar.booking.confirmed",
      },
      body: JSON.stringify({
        id: "evt-1",
        type: "calendar.booking.confirmed",
        occurredAt: "2026-08-18T00:00:00Z",
        data: {
          bookingId: "bk-1",
          eventTypeId: "et-1",
          externalRef: jobBody.id,
          hostSub: "employer-1",
          slug: "interview-30m",
          start: "2026-08-19T01:00:00Z",
          end: "2026-08-19T01:30:00Z",
          guestName: "Alice",
          guestEmail: "alice@example.test",
          guestTimeZone: "Asia/Tokyo",
        },
      }),
    });
    expect(hooked.status).toBe(200);

    const after = await app.request(`/v1/applications/${appBody.id}`);
    const afterBody = (await after.json()) as { status: string; interviewBookingId?: string };
    expect(afterBody.status).toBe("interview");
    expect(afterBody.interviewBookingId).toBe("bk-1");
  });

  it("provisions calendar event type for a job via P05 internal API", async () => {
    const app = createApp(new MemoryStore());

    const originalToken = process.env.CALENDAR_INTERNAL_TOKEN;
    const originalBase = process.env.CALENDAR_API_URL;
    process.env.CALENDAR_INTERNAL_TOKEN = "test-internal-token";
    process.env.CALENDAR_API_URL = "http://calendar-api:8095";

    try {
      const job = await app.request("/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerSub: "employer-1",
          title: "Backend Engineer",
          status: "published",
        }),
      });
      expect(job.status).toBe(201);
      const jobBody = (await job.json()) as { id: string };

      const fetchMock = vi.fn(async (_url: string) => {
        const init = (fetchMock as any).mock.calls[0][1];
        const payload = JSON.parse(init.body);
        expect(payload.externalRef).toBe(jobBody.id);
        expect(init.headers.Authorization).toBe(`Bearer ${process.env.CALENDAR_INTERNAL_TOKEN}`);
        return new Response(JSON.stringify({ slug: payload.slug, externalRef: payload.externalRef }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const provision = await app.request(`/v1/jobs/${jobBody.id}/provision-interview-event-type`, {
        method: "POST",
      });
      expect(provision.status).toBe(201);
      const body = (await provision.json()) as { slug: string; externalRef: string };
      expect(body.externalRef).toBe(jobBody.id);

      vi.unstubAllGlobals();
    } finally {
      process.env.CALENDAR_INTERNAL_TOKEN = originalToken;
      process.env.CALENDAR_API_URL = originalBase;
    }
  });

  it("returns a published job by id", async () => {
    const app = createApp(new MemoryStore());
    const created = await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload()),
    });
    const job = (await created.json()) as { id: string; title: string };
    const res = await app.request(`/v1/jobs/${job.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; title: string };
    expect(body.id).toBe(job.id);
    expect(body.title).toBe("Backend Engineer");
  });

  it("returns 404 for unknown job id", async () => {
    const app = createApp(new MemoryStore());
    const res = await app.request("/v1/jobs/missing-id");
    expect(res.status).toBe(404);
  });

  it("lists employer jobs for the matching header", async () => {
    const app = createApp(new MemoryStore());
    await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload({ title: "Mine", status: "draft" })),
    });
    await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload({ employerSub: "employer-2", title: "Other" })),
    });
    const res = await app.request("/v1/employers/employer-1/jobs", {
      headers: { "X-Dev-User-Sub": "employer-1" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string }[];
    expect(body.map((row) => row.title)).toEqual(["Mine"]);
  });

  it("forbids another employer from listing job applications", async () => {
    const app = createApp(new MemoryStore());
    const job = await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload()),
    });
    const jobBody = (await job.json()) as { id: string };
    await app.request(`/v1/jobs/${jobBody.id}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateSub: "candidate-1", resumeSnapshot: "resume" }),
    });
    const denied = await app.request(`/v1/jobs/${jobBody.id}/applications`, {
      headers: { "X-Dev-User-Sub": "employer-2" },
    });
    expect(denied.status).toBe(403);
    const allowed = await app.request(`/v1/jobs/${jobBody.id}/applications`, {
      headers: { "X-Dev-User-Sub": "employer-1" },
    });
    expect(allowed.status).toBe(200);
    const body = (await allowed.json()) as { candidateSub: string }[];
    expect(body).toHaveLength(1);
    expect(body[0].candidateSub).toBe("candidate-1");
  });

  it("forbids another candidate from listing applications", async () => {
    const app = createApp(new MemoryStore());
    const job = await app.request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload()),
    });
    const jobBody = (await job.json()) as { id: string };
    await app.request(`/v1/jobs/${jobBody.id}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateSub: "candidate-1", resumeSnapshot: "resume" }),
    });
    const denied = await app.request("/v1/candidates/candidate-1/applications", {
      headers: { "X-Dev-User-Sub": "candidate-2" },
    });
    expect(denied.status).toBe(403);
    const allowed = await app.request("/v1/candidates/candidate-1/applications", {
      headers: { "X-Dev-User-Sub": "candidate-1" },
    });
    expect(allowed.status).toBe(200);
    const body = (await allowed.json()) as { candidateSub: string }[];
    expect(body).toHaveLength(1);
  });

  it("seeds fictional demo jobs", async () => {
    const app = createApp(new MemoryStore());
    const res = await app.request("/v1/dev/seed", { method: "POST" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { count: number; jobs: { title: string }[] };
    expect(body.count).toBeGreaterThanOrEqual(8);
    expect(body.count).toBeLessThanOrEqual(12);
    expect(body.jobs.some((row) => /Google|Amazon|Microsoft|Apple|Meta/i.test(row.title))).toBe(false);
  });
});

