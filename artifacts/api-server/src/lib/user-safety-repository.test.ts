// Unit tests for the block / report repository methods (#16, migration 050).
// The Supabase client is a recording fake: nothing here reaches a database.
// The RLS behaviour itself is covered by supabase/verify/050_verify.sql.
import { describe, expect, it } from "vitest";
import { createSupabaseUserRepository } from "@workspace/pin-repository";

type Result = { data: unknown; error: { code?: string; message: string } | null };
type Call = { table: string; ops: [string, ...unknown[]][] };

/** A chainable stand-in for the PostgREST builder that replays queued results. */
function fakeClient(results: Result[]) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "insert", "delete", "eq", "is", "order", "single", "maybeSingle"]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (r: Result) => void) => resolve(results.shift() ?? { data: null, error: null });
      return builder;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { repo: createSupabaseUserRepository(client as any), calls };
}

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const MSG = "00000000-0000-4000-8000-00000000ae51";

describe("blockUser / unblockUser", () => {
  it("inserts a block row for the blocker", async () => {
    const { repo, calls } = fakeClient([{ data: null, error: null }]);
    await repo.blockUser(A, B);
    expect(calls[0].table).toBe("user_blocks");
    expect(calls[0].ops[0]).toEqual(["insert", { blocker_id: A, blocked_id: B }]);
  });

  it("treats an existing block as success", async () => {
    const { repo } = fakeClient([{ data: null, error: { code: "23505", message: "duplicate key" } }]);
    await expect(repo.blockUser(A, B)).resolves.toBeUndefined();
  });

  it("surfaces other errors, such as an RLS refusal", async () => {
    const { repo } = fakeClient([{ data: null, error: { code: "42501", message: "row-level security" } }]);
    await expect(repo.blockUser(A, B)).rejects.toThrow("row-level security");
  });

  it("deletes only the blocker's row for that user", async () => {
    const { repo, calls } = fakeClient([{ data: null, error: null }]);
    await repo.unblockUser(A, B);
    expect(calls[0].table).toBe("user_blocks");
    expect(calls[0].ops).toEqual([["delete"], ["eq", "blocker_id", A], ["eq", "blocked_id", B]]);
  });
});

describe("getBlockedUsers", () => {
  it("maps rows and embedded profiles, newest first", async () => {
    const { repo, calls } = fakeClient([{
      data: [
        { blocked_id: B, created_at: "2026-10-19T10:00:00Z", blocked: { username: "pinfan", avatar_url: null } },
        { blocked_id: "c3", created_at: "2026-10-18T10:00:00Z", blocked: null },
      ],
      error: null,
    }]);
    const blocks = await repo.getBlockedUsers(A);
    expect(calls[0].ops).toContainEqual(["eq", "blocker_id", A]);
    expect(calls[0].ops).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(blocks).toEqual([
      { blockedUserId: B, username: "pinfan", avatarUrl: undefined, createdAt: "2026-10-19T10:00:00Z" },
      { blockedUserId: "c3", username: undefined, avatarUrl: undefined, createdAt: "2026-10-18T10:00:00Z" },
    ]);
  });
});

describe("reportUser", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "r1", reporter_id: A, reported_user_id: B, message_id: null, reason: null,
    created_at: "2026-10-19T10:00:00Z", ...over,
  });

  it("files a profile report with a trimmed reason", async () => {
    const { repo, calls } = fakeClient([{ data: row({ reason: "spam" }), error: null }]);
    const report = await repo.reportUser(A, { reportedUserId: B, reason: "  spam  " });
    expect(calls[0].table).toBe("user_reports");
    expect(calls[0].ops[0]).toEqual(["insert", { reporter_id: A, reported_user_id: B, message_id: null, reason: "spam" }]);
    expect(report).toMatchObject({ id: "r1", target: "profile", reportedUserId: B, reason: "spam" });
    expect(report.messageId).toBeUndefined();
  });

  it("files a message report", async () => {
    const { repo, calls } = fakeClient([{ data: row({ message_id: MSG }), error: null }]);
    const report = await repo.reportUser(A, { reportedUserId: B, messageId: MSG, reason: "   " });
    expect(calls[0].ops[0]).toEqual(["insert", { reporter_id: A, reported_user_id: B, message_id: MSG, reason: null }]);
    expect(report).toMatchObject({ target: "message", messageId: MSG });
  });

  it("returns the existing profile report when it was already filed", async () => {
    const { repo, calls } = fakeClient([
      { data: null, error: { code: "23505", message: "duplicate key" } },
      { data: row({ id: "existing" }), error: null },
    ]);
    const report = await repo.reportUser(A, { reportedUserId: B });
    expect(report.id).toBe("existing");
    expect(calls[1].ops).toEqual([
      ["select", "*"], ["eq", "reporter_id", A], ["eq", "reported_user_id", B], ["is", "message_id", null], ["maybeSingle"],
    ]);
  });

  it("returns the existing message report when it was already filed", async () => {
    const { repo, calls } = fakeClient([
      { data: null, error: { code: "23505", message: "duplicate key" } },
      { data: row({ id: "existing", message_id: MSG }), error: null },
    ]);
    const report = await repo.reportUser(A, { reportedUserId: B, messageId: MSG });
    expect(report).toMatchObject({ id: "existing", target: "message" });
    expect(calls[1].ops).toContainEqual(["eq", "message_id", MSG]);
  });

  it("surfaces an RLS refusal", async () => {
    const { repo } = fakeClient([{ data: null, error: { code: "42501", message: "row-level security" } }]);
    await expect(repo.reportUser(A, { reportedUserId: B, messageId: MSG })).rejects.toThrow("row-level security");
  });
});

describe("getUserReports / dismissUserReport", () => {
  it("maps both report targets", async () => {
    const { repo } = fakeClient([{
      data: [
        { id: "r2", reporter_id: A, reported_user_id: B, message_id: MSG, reason: "abuse", created_at: "2026-10-19T11:00:00Z" },
        { id: "r1", reporter_id: A, reported_user_id: B, message_id: null, reason: null, created_at: "2026-10-19T10:00:00Z" },
      ],
      error: null,
    }]);
    const reports = await repo.getUserReports();
    expect(reports.map((r) => [r.id, r.target])).toEqual([["r2", "message"], ["r1", "profile"]]);
    expect(reports[1].reason).toBeUndefined();
  });

  it("deletes one report by id", async () => {
    const { repo, calls } = fakeClient([{ data: null, error: null }]);
    await repo.dismissUserReport("r1");
    expect(calls[0].table).toBe("user_reports");
    expect(calls[0].ops).toEqual([["delete"], ["eq", "id", "r1"]]);
  });
});
