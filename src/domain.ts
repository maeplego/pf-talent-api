export type Job = {
  id: string;
  employerSub: string;
  title: string;
  status: "draft" | "published";
};

export type ApplicationStatus = "applied" | "document_passed" | "interview" | "rejected";

export type Application = {
  id: string;
  jobId: string;
  candidateSub: string;
  resumeSnapshot: string;
  status: ApplicationStatus;
  // P05 webhookとの結合キー。event.data.externalRef と一致させる。
  calendarExternalRef?: string;
  interviewBookingId?: string;
};

export type BookingConfirmedEvent = {
  id: string;
  type: "calendar.booking.confirmed";
  occurredAt: string;
  data: {
    bookingId: string;
    eventTypeId: string;
    externalRef?: string;
    hostSub: string;
    slug: string;
    start: string;
    end: string;
    guestName: string;
    guestEmail: string;
    guestTimeZone: string;
  };
};

