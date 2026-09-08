import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import SafeImage from "@/components/SafeImage";

describe("SafeImage", () => {
  it("renders the photo when a source is given", () => {
    const { container } = render(<SafeImage src="/photo.jpg" alt="A photo" />);
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("swaps to a placeholder when the photo fails to load", () => {
    const { container } = render(<SafeImage src="/missing.jpg" alt="A photo" />);
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
  });

  it("uses a custom fallback when provided", () => {
    const { container, getByText } = render(
      <SafeImage src="/missing.jpg" alt="A photo" fallback={<span>MJ</span>} />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(getByText("MJ")).toBeTruthy();
  });

  it("renders no img at all when there is no source", () => {
    const { container } = render(<SafeImage src={null} alt="A photo" />);
    expect(container.querySelector("img")).toBeNull();
  });
});
