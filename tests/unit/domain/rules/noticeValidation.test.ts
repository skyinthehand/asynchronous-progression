import { describe, expect, it } from "vitest";
import { hasEmergencyContact } from "../../../../src/domain/rules/noticeValidation.js";

describe("hasEmergencyContact", () => {
  it("returns false for empty text", () => {
    expect(hasEmergencyContact("")).toBe(false);
    expect(hasEmergencyContact("   ")).toBe(false);
  });

  it("returns false when no contact information is present", () => {
    expect(hasEmergencyContact("よろしくお願いします。")).toBe(false);
  });

  it("detects a Japanese phone number", () => {
    expect(hasEmergencyContact("緊急時は080-1234-5678まで")).toBe(true);
  });

  it("detects an email address", () => {
    expect(hasEmergencyContact("お問い合わせ: staff@example.com")).toBe(true);
  });

  it("detects a contact keyword without a phone/email", () => {
    expect(hasEmergencyContact("緊急連絡はDiscordのTOチャンネルへ")).toBe(true);
  });
});
