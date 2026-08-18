export type EmploymentType = "full_time" | "contract" | "part_time" | "internship";

export type Job = {
  id: string;
  employerSub: string;
  title: string;
  status: "draft" | "published";
  employmentType: EmploymentType;
  location: string;
  remote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  skills: string[];
  description: string;
};

export type ApplicationStatus = "applied" | "document_passed" | "interview" | "offered" | "rejected";

const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  applied: ["document_passed", "rejected"],
  document_passed: ["interview", "rejected"],
  interview: ["offered", "rejected"],
  offered: [],
  rejected: [],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export type Application = {
  id: string;
  jobId: string;
  candidateSub: string;
  resumeSnapshot: string;
  status: ApplicationStatus;
  calendarExternalRef?: string;
  interviewBookingId?: string;
};

export type CandidateProfile = {
  sub: string;
  displayName: string;
  skills: string[];
  desiredEmploymentTypes: EmploymentType[];
  desiredMinSalary: number | null;
  desiredRemote: boolean;
  bio: string;
};

export type SavedSearch = {
  id: string;
  candidateSub: string;
  name: string;
  query: string;
  employmentType?: EmploymentType;
  remote?: boolean;
  skills: string[];
  salaryMin?: number;
  salaryMax?: number;
  lastRunAt: string | null;
};

export function rankSimilarJobs(target: Job, candidates: Job[], limit: number): Job[] {
  return candidates
    .filter((row) => row.id !== target.id && row.status === "published")
    .map((row) => ({
      row,
      score: row.skills.filter((skill) => target.skills.some((s) => s.toLowerCase() === skill.toLowerCase())).length,
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title))
    .slice(0, limit)
    .map((row) => row.row);
}

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

