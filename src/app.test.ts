import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { MemoryStore } from "./memory.js";

describe("talent-api minimal flow", () => {
  it("updates application status to interview from calendar webhook", async () => {
    const app = createApp(new MemoryStore());

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
});

