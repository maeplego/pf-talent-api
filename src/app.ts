import { Hono } from "hono";
import { z } from "zod";
import type { BookingConfirmedEvent } from "./domain.js";
import type { Store } from "./store.js";

const jobCreateSchema = z.object({
  employerSub: z.string().min(1),
  title: z.string().min(1).max(160),
  status: z.enum(["draft", "published"]).default("draft"),
});

const appCreateSchema = z.object({
  candidateSub: z.string().min(1),
  resumeSnapshot: z.string().min(1).max(20000),
});

const appStatusSchema = z.object({
  status: z.enum(["applied", "document_passed", "interview", "rejected"]),
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
    const row = await store.updateApplicationStatus(c.req.param("id"), parsed.data.status);
    if (!row) {
      return c.json({ error: { code: "not_found", message: "not found" } }, 404);
    }
    return c.json(row);
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

