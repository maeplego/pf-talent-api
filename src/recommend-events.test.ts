import { describe, expect, it, vi } from "vitest";

import { postRecommendEvent } from "./recommend-events.js";

describe("postRecommendEvent", () => {
  it("no-ops when base url is empty", async () => {
    const fetchMock = vi.fn();
    await postRecommendEvent("", { namespace: "jobs", user_id: "alice", item_id: "j1", type: "view" }, fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts view events", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await postRecommendEvent(
      "http://recommend:8080",
      { namespace: "jobs", user_id: "alice", item_id: "job-1", type: "view" },
      fetchMock,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://recommend:8080/v1/events");
    expect(JSON.parse(String(init.body))).toEqual({
      namespace: "jobs",
      user_id: "alice",
      item_id: "job-1",
      type: "view",
    });
  });
});
