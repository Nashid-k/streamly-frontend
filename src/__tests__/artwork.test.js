import { describe, expect, it } from "vitest";
import { pickImageWidth, artworkWidth } from "../utils/artwork";

describe("artwork", () => {
  it("uses the high rung when hdThumbs is on/undefined", () => {
    expect(pickImageWidth("card", { hdThumbs: true })).toBe("w500");
    expect(pickImageWidth("card", {})).toBe("w500");
    expect(pickImageWidth("card", null)).toBe("w500");
  });

  it("uses the low rung when hdThumbs is false", () => {
    expect(pickImageWidth("card", { hdThumbs: false })).toBe("w342");
  });

  it("honours the kind ladder", () => {
    expect(artworkWidth("hero", true)).toBe("w1280");
    expect(artworkWidth("hero", false)).toBe("w780");
    expect(artworkWidth("rail", false)).toBe("w500");
    expect(artworkWidth("unknown-kind", true)).toBe("w500");
  });
});
