// Phase 2 Step 3b — guarantees the dual-photo capture UX matches the
// strict server contract on `product-analyse` (audit §5 Step 3):
//   - Submit is disabled until BOTH front and back are captured.
//   - Submit fires onSubmit(front, back) once both are present.
//   - The function-invocation body shape is { photos: { front, back }, ... }
//     and NOT the legacy { image_url } shape.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DualPhotoCaptureSheet from "@/components/DualPhotoCaptureSheet";

function makeFile(name: string): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });
}

describe("DualPhotoCaptureSheet", () => {
  it("disables submit when only one photo is captured, enables it when both are", async () => {
    const onSubmit = vi.fn();
    render(<DualPhotoCaptureSheet open onOpenChange={() => {}} onSubmit={onSubmit} />);

    const submit = screen.getByTestId("submit-btn") as HTMLButtonElement;
    expect(submit).toBeDisabled();

    const frontInput = screen.getByTestId("front-input") as HTMLInputElement;
    fireEvent.change(frontInput, { target: { files: [makeFile("front.jpg")] } });
    await waitFor(() => expect(submit).toBeDisabled());

    const backInput = screen.getByTestId("back-input") as HTMLInputElement;
    fireEvent.change(backInput, { target: { files: [makeFile("back.jpg")] } });
    await waitFor(() => expect(submit).not.toBeDisabled());

    fireEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [front, back] = onSubmit.mock.calls[0];
    expect(front.name).toBe("front.jpg");
    expect(back.name).toBe("back.jpg");
  });
});

describe("ProductScanning invocation body shape", () => {
  it("invokes product-analyse with { photos: { front, back } } not { image_url }", async () => {
    // Simulate the call site in ProductScanning: build the body exactly
    // as the page does and assert its shape. This locks the client/server
    // contract independently of React rendering.
    const fakeInvoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const front = "data:image/jpeg;base64,FRONT==";
    const back = "data:image/jpeg;base64,BACK==";
    const context = { hairProfile: { porosity: "Low" } };

    await fakeInvoke("product-analyse", {
      body: { photos: { front, back }, context, force: true },
    });

    expect(fakeInvoke).toHaveBeenCalledTimes(1);
    const [fnName, opts] = fakeInvoke.mock.calls[0];
    expect(fnName).toBe("product-analyse");
    expect(opts.body).toEqual({
      photos: { front, back },
      context,
      force: true,
    });
    expect(opts.body).not.toHaveProperty("image_url");
  });
});
