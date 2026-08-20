/** Best-effort append-only feedback for pf-recommend (jobs namespace). */
export type RecommendEvent = {
  namespace: "jobs";
  user_id: string;
  item_id: string;
  type: "view" | "apply";
};

export async function postRecommendEvent(
  baseUrl: string,
  event: RecommendEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const base = baseUrl.replace(/\/$/, "");
  if (!base || !event.user_id || !event.item_id) {
    return;
  }
  try {
    const res = await fetchImpl(`${base}/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    await res.arrayBuffer().catch(() => undefined);
  } catch {
    // Optional feedback path; never fail the API request.
  }
}
