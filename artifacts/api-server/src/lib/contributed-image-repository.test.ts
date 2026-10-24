// createContributedImage must read the inserted row back with the pin join,
// so the returned image carries pinhuntId (#459). Recording fake: no database.
import { describe, expect, it } from "vitest";
import { createSupabaseUserRepository } from "@workspace/pin-repository";

function fakeClient() {
  const imageSelects: string[] = [];
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "insert", "eq", "single", "maybeSingle"]) {
        builder[op] = (...args: unknown[]) => {
          if (op === "select" && table === "pin_images") imageSelects.push(String(args[0] ?? ""));
          return builder;
        };
      }
      builder.then = (resolve: (r: unknown) => void) => {
        if (table === "pins") return resolve({ data: { id: "pin-uuid" }, error: null });
        const joined = imageSelects.some((s) => s.includes("pin:pins!pin_id"));
        return resolve({
          data: {
            id: "img-1",
            pin_id: "pin-uuid",
            uploaded_by: "user-1",
            image_url: "user-1/PHUK-00000001/1.jpg",
            status: "pending",
            contributor_consent_at: "2026-10-24T00:00:00Z",
            created_at: "2026-10-24T00:00:00Z",
            ...(joined ? { pin: { pinhunt_id: "PHUK-00000001", title: "Test Pin", image_url: null } } : {}),
          },
          error: null,
        });
      };
      return builder;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSupabaseUserRepository(client as any);
}

describe("createContributedImage", () => {
  it("returns the image with its linked pin's pinhuntId", async () => {
    const image = await fakeClient().createContributedImage("user-1", "PHUK-00000001", {
      storagePath: "user-1/PHUK-00000001/1.jpg",
      consentGranted: true,
    });
    expect(image.pinhuntId).toBe("PHUK-00000001");
    expect(image.pinTitle).toBe("Test Pin");
  });
});
