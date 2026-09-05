import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import VoiceNoteBlock from "@/components/VoiceNoteBlock";

const LONG =
  "Honestly my scalp felt a lot calmer today than it did last week, I think because I did not rush the rinse. " +
  "The conditioner had way more slip than I expected and my hair drank it up, especially at the back. " +
  "I noticed a few short broken pieces on the towel around my hairline.";

/** Long enough to run past the three-paragraph preview. */
const VERY_LONG = [
  LONG,
  "So the next day my hair still felt soft and I did not need to add anything else.",
  "Then I put it away in two twists and slept in a bonnet, which held really well.",
  "Also I want to remember that the leave-in went on while my hair was still dripping.",
  "Overall this is the version of wash day I want to repeat next time.",
].join(" ");

describe("VoiceNoteBlock", () => {
  beforeEach(cleanup);

  it("shows a play control only when a recording exists", () => {
    const { unmount } = render(
      <VoiceNoteBlock transcript={LONG} audioUrl="https://example.test/a.webm" />,
    );
    expect(screen.getByRole("button", { name: "Play recording" })).toBeTruthy();
    unmount();
    render(<VoiceNoteBlock transcript={LONG} />);
    expect(screen.queryByRole("button", { name: /recording/i })).toBeNull();
  });

  it("renders nothing without a transcript, a recording or chips", () => {
    const { container } = render(<VoiceNoteBlock transcript="" audioUrl={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("keeps the member's own wording", () => {
    render(<VoiceNoteBlock transcript={LONG} />);
    expect(document.body.textContent).toContain("I did not rush the rinse");
  });

  it("previews a long transcript behind Read all and keeps the raw text reachable", () => {
    render(<VoiceNoteBlock transcript={VERY_LONG} />);
    const readAll = screen.getByRole("button", { name: "Read all" });
    fireEvent.click(readAll);
    expect(document.body.textContent).toContain("Overall this is the version of wash day");
    fireEvent.click(screen.getByRole("button", { name: "Original transcript" }));
    expect(document.body.textContent).toContain(VERY_LONG.slice(0, 40));
    expect(screen.getByRole("button", { name: "Read less" })).toBeTruthy();
  });

  it("renders captured attributes as chips", () => {
    render(<VoiceNoteBlock transcript={LONG} chips={["Low tension", "Heat styling: No heat styling"]} />);
    expect(screen.getByText("Low tension")).toBeTruthy();
    expect(screen.getByText("Heat styling: No heat styling")).toBeTruthy();
  });
});
