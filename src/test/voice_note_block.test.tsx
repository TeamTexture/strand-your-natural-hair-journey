import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import VoiceNoteBlock from "@/components/VoiceNoteBlock";

const LONG =
  "Honestly my scalp felt a lot calmer today than it did last week, I think because I did not rush the rinse. " +
  "The conditioner had way more slip than I expected and my hair drank it up, especially at the back. " +
  "I noticed a few short broken pieces on the towel around my hairline.";

describe("VoiceNoteBlock", () => {
  beforeEach(cleanup);

  it("collapses a long transcript behind See more and expands in place", () => {
    render(<VoiceNoteBlock transcript={LONG} />);
    const preview = screen.getByText(LONG, { exact: false });
    expect(preview.className).toContain("line-clamp-3");
    fireEvent.click(screen.getByRole("button", { name: "See more" }));
    expect(screen.getByRole("button", { name: "See less" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See less" }));
    expect(screen.getByRole("button", { name: "See more" })).toBeTruthy();
  });

  it("shows a play control only when a recording exists", () => {
    const { unmount } = render(<VoiceNoteBlock transcript={LONG} audioUrl="https://example.test/a.webm" />);
    expect(screen.getByRole("button", { name: "Play recording" })).toBeTruthy();
    unmount();
    render(<VoiceNoteBlock transcript={LONG} />);
    expect(screen.queryByRole("button", { name: /recording/i })).toBeNull();
  });

  it("renders nothing without a transcript or a recording", () => {
    const { container } = render(<VoiceNoteBlock transcript="" audioUrl={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("keeps the transcript text untouched", () => {
    render(<VoiceNoteBlock transcript={LONG} />);
    fireEvent.click(screen.getByRole("button", { name: "See more" }));
    expect(document.body.textContent).toContain("I did not rush the rinse");
  });
});
