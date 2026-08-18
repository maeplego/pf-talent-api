import { Hono } from "hono";
import { z } from "zod";
import { canTransition, type BookingConfirmedEvent } from "./domain.js";
import type { Store } from "./store.js";

const employmentTypeEnum = z.enum(["full_time", "contract", "part_time", "internship"]);

const jobCreateSchema = z.object({
  employerSub: z.string().min(1),
  title: z.string().min(1).max(160),
  status: z.enum(["draft", "published"]).default("draft"),
  employmentType: employmentTypeEnum.default("full_time"),
  location: z.string().max(120).default(""),
  remote: z.boolean().default(false),
  salaryMin: z.number().int().nonnegative().nullable().default(null),
  salaryMax: z.number().int().nonnegative().nullable().default(null),
  skills: z.array(z.string().min(1)).default([]),
  description: z.string().max(50000).default(""),
});

const appCreateSchema = z.object({
  candidateSub: z.string().min(1),
  resumeSnapshot: z.string().min(1).max(20000),
});

const appStatusSchema = z.object({
  status: z.enum(["applied", "document_passed", "interview", "offered", "rejected"]),
});

const profileSchema = z.object({
  sub: z.string().min(1),
  displayName: z.string().min(1).max(120),
  skills: z.array(z.string().min(1)).default([]),
  desiredEmploymentTypes: z.array(employmentTypeEnum).default([]),
  desiredMinSalary: z.number().int().nonnegative().nullable().default(null),
  desiredRemote: z.boolean().default(false),
  bio: z.string().max(5000).default(""),
});

const savedSearchSchema = z.object({
  candidateSub: z.string().min(1),
  name: z.string().min(1).max(120),
  query: z.string().max(200).default(""),
  employmentType: employmentTypeEnum.optional(),
  remote: z.boolean().optional(),
  skills: z.array(z.string().min(1)).default([]),
  salaryMin: z.number().int().nonnegative().optional(),
  salaryMax: z.number().int().nonnegative().optional(),
});

const slotRangeSchema = z.object({
  rangeStart: z.string().min(1),
  rangeEnd: z.string().min(1),
});

const calendarLinkSchema = z.object({
  externalRef: z.string().min(1).max(128),
});

const bookingConfirmedSchema = z.object({
  id: z.string().min(1),
  type: z.literal("calendar.booking.confirmed"),
  occurredAt: z.string().min(1),
  data: z.object({
    bookingId: z.string().min(1),
    eventTypeId: z.string().min(1),
    externalRef: z.string().min(1).optional(),
    hostSub: z.string().min(1),
    slug: z.string().min(1),
    start: z.string().min(1),
    end: z.string().min(1),
    guestName: z.string().min(1),
    guestEmail: z.string().min(1),
    guestTimeZone: z.string().min(1),
  }),
});

const weekdayRules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startLocal: "09:00",
  endLocal: "12:00",
}));

export function createApp(store: Store): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/v1/jobs", async (c) => {
    const q = c.req.query("q");
    const employmentType = c.req.query("employmentType");
    const remoteStr = c.req.query("remote");
    const skillsStr = c.req.query("skills");
    const salaryMinStr = c.req.query("salaryMin");
    const salaryMaxStr = c.req.query("salaryMax");

    const hasFilter = q || employmentType || remoteStr || skillsStr || salaryMinStr || salaryMaxStr;
    if (!hasFilter) {
      return c.json(await store.listJobs());
    }

    const rows = await store.searchJobs({
      q: q || undefined,
      employmentType: employmentType as any || undefined,
      remote: remoteStr === "true" ? true : remoteStr === "false" ? false : undefined,
      skills: skillsStr ? skillsStr.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      salaryMin: salaryMinStr ? Number(salaryMinStr) : undefined,
      salaryMax: salaryMaxStr ? Number(salaryMaxStr) : undefined,
    });
    return c.json(rows);
  });

  app.post("/v1/saved-searches", async (c) => {
    const parsed = savedSearchSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_request", message: parsed.error.message } }, 400);
    }
    const row = await store.createSavedSearch(parsed.data);
    return c.json(row, 201);
  });

  app.get("/v1/candidates/:sub/saved-searches", async (c) => {
    const rows = await store.listSavedSearches(c.req.param("sub"));
    return c.json(rows);
  });

  app.post("/v1/saved-searches/:id/run", async (c) => {
    const result = await store.runSavedSearch(c.req.param("id"), new Date().toISOString());
    if (!result) {
      return c.json({ error: { code: "not_found", message: "not found" } }, 404);
    }
    return c.json({
      savedSearch: result.savedSearch,
      matchedJobs: result.jobs,
      matchedCount: result.jobs.length,
    });
  });

  app.post("/v1/jobs", async (c) => {
    const parsed = jobCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_request", message: parsed.error.message } }, 400);
    }
    const row = await store.createJob(parsed.data);
    return c.json(row, 201);
  });

  app.post("/v1/jobs/:id/provision-interview-event-type", async (c) => {
    const token = process.env.CALENDAR_INTERNAL_TOKEN?.trim() ?? "";
    if (!token) {
      return c.json({ error: { code: "unavailable", message: "calendar internal token is required" } }, 503);
    }
    const baseUrl = (process.env.CALENDAR_API_URL?.trim() ?? "http://localhost:8095").replace(/\/$/, "");

    const job = await store.findJobById(c.req.param("id"));
    if (!job) {
      return c.json({ error: { code: "not_found", message: "not found" } }, 404);
    }

    const slug = `interview-30m-${job.id.slice(-16)}`.toLowerCase();

    const res = await fetch(`${baseUrl}/internal/v1/event-types`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        hostSub: job.employerSub,
        slug,
        name: "Interview 30m",
        durationMinutes: 30,
        bufferMinutes: 0,
        minNoticeMinutes: 0,
        hostTimeZone: "Asia/Tokyo",
        rules: weekdayRules,
        externalRef: job.id,
      }),
    });

    const text = await res.text();
    return c.body(text, res.status, {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
    });
  });

  app.get("/v1/applications/:id/interview-slots", async (c) => {
    const parsed = slotRangeSchema.safeParse({
      rangeStart: c.req.query("rangeStart"),
      rangeEnd: c.req.query("rangeEnd"),
    });
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_request", message: parsed.error.message } }, 400);
    }
    const token = process.env.CALENDAR_INTERNAL_TOKEN?.trim() ?? "";
    if (!token) {
      return c.json({ error: { code: "unavailable", message: "calendar internal token is required" } }, 503);
    }
    const baseUrl = (process.env.CALENDAR_API_URL?.trim() ?? "http://localhost:8095").replace(/\/$/, "");
    const application = await store.findApplicationById(c.req.param("id"));
    if (!application) {
      return c.json({ error: { code: "not_found", message: "not found" } }, 404);
    }
    if (application.status !== "document_passed" && application.status !== "interview") {
      return c.json({ error: { code: "invalid_state", message: "application must be document_passed or interview" } }, 409);
    }
    const job = await store.findJobById(application.jobId);
    if (!job) {
      return c.json({ error: { code: "not_found", message: "not found" } }, 404);
    }

    const eventTypesRes = await fetch(`${baseUrl}/internal/v1/hosts/${encodeURIComponent(job.employerSub)}/event-types`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!eventTypesRes.ok) {
      const text = await eventTypesRes.text();
      return c.body(text, eventTypesRes.status, {
        "Content-Type": eventTypesRes.headers.get("content-type") ?? "application/json",
      });
    }
    const eventTypesBody = (await eventTypesRes.json()) as {
      eventTypes: { id: string; slug: string; externalRef?: string }[];
    };
    const eventType = eventTypesBody.eventTypes.find((row) => row.externalRef === job.id);
    if (!eventType) {
      return c.json({ error: { code: "not_found", message: "interview event type not found" } }, 404);
    }

    const slotsRes = await fetch(
      `${baseUrl}/public/${encodeURIComponent(eventType.slug)}/slots?rangeStart=${encodeURIComponent(parsed.data.rangeStart)}&rangeEnd=${encodeURIComponent(parsed.data.rangeEnd)}`,
    );
    const text = await slotsRes.text();
    return c.body(text, slotsRes.status, {
      "Content-Type": slotsRes.headers.get("content-type") ?? "application/json",
    });
  });

  app.post("/v1/jobs/:id/applications", async (c) => {
    const parsed = appCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_request", message: parsed.error.message } }, 400);
    }
    const row = await store.createApplication({
      jobId: c.req.param("id"),
      // P05 creates event types with `externalRef` per job. MVPでは application を jobId と同じ外部参照で紐付ける。
      calendarExternalRef: c.req.param("id"),
      candidateSub: parsed.data.candidateSub,
      resumeSnapshot: parsed.data.resumeSnapshot,
    });
    return c.json(row, 201);
  });

  app.get("/v1/applications/:id", async (c) => {
    const row = await store.findApplicationById(c.req.param("id"));
    if (!row) {
      return c.json({ error: { code: "not_found", message: "not found" } }, 404);
    }
    return c.json(row);
  });

  app.patch("/v1/applications/:id/status", async (c) => {
    const parsed = appStatusSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_request", message: parsed.error.message } }, 400);
    }
    const current = await store.findApplicationById(c.req.param("id"));
    if (!current) {
      return c.json({ error: { code: "not_found", message: "not found" } }, 404);
    }
    if (!canTransition(current.status, parsed.data.status)) {
      return c.json(
        { error: { code: "invalid_transition", message: `cannot transition from ${current.status} to ${parsed.data.status}` } },
        409,
      );
    }
    const row = await store.updateApplicationStatus(c.req.param("id"), parsed.data.status);
    return c.json(row!);
  });

  // P05 internal APIで作る event_type.externalRef を application と結びつける。
  app.put("/v1/applications/:id/calendar-link", async (c) => {
    const parsed = calendarLinkSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_request", message: parsed.error.message } }, 400);
    }
    const row = await store.attachCalendarExternalRef(c.req.param("id"), parsed.data.externalRef);
    if (!row) {
      return c.json({ error: { code: "not_found", message: "not found" } }, 404);
    }
    return c.json(row);
  });

  app.put("/v1/profiles/:sub", async (c) => {
    const parsed = profileSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_request", message: parsed.error.message } }, 400);
    }
    if (parsed.data.sub !== c.req.param("sub")) {
      return c.json({ error: { code: "invalid_request", message: "sub mismatch" } }, 400);
    }
    const row = await store.upsertProfile(parsed.data);
    return c.json(row);
  });

  app.get("/v1/profiles/:sub", async (c) => {
    const row = await store.findProfileBySub(c.req.param("sub"));
    if (!row) {
      return c.json({ error: { code: "not_found", message: "not found" } }, 404);
    }
    return c.json(row);
  });

  app.post("/webhooks/calendar", async (c) => {
    const headerType = c.req.header("X-Calendar-Event-Type")?.trim();
    if (headerType !== "calendar.booking.confirmed") {
      return c.json({ error: { code: "invalid_request", message: "invalid event type header" } }, 400);
    }
    const parsed = bookingConfirmedSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_request", message: parsed.error.message } }, 400);
    }
    const updated = await store.markInterviewByBooking(parsed.data as BookingConfirmedEvent);
    if (!updated) {
      return c.json({ ok: true, matched: false });
    }
    return c.json({ ok: true, matched: true, applicationId: updated.id, status: updated.status });
  });

  return app;
}

