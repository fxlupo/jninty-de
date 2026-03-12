import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmModal from "./ConfirmModal";

describe("ConfirmModal", () => {
  it("renders title and message when open", () => {
    render(
      <ConfirmModal
        isOpen={true}
        title="Cancel Subscription"
        message="Are you sure you want to cancel?"
        confirmLabel="Yes, Cancel"
        variant="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Cancel Subscription")).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to cancel?")).toBeInTheDocument();
    expect(screen.getByText("Yes, Cancel")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <ConfirmModal
        isOpen={false}
        title="Cancel Subscription"
        message="Are you sure?"
        confirmLabel="Confirm"
        variant="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText("Cancel Subscription")).not.toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        title="Cancel"
        message="Sure?"
        confirmLabel="Confirm"
        variant="danger"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        title="Cancel"
        message="Sure?"
        confirmLabel="Confirm"
        variant="danger"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByText("Never Mind"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Escape key is pressed", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        title="Cancel"
        message="Sure?"
        confirmLabel="Confirm"
        variant="danger"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        title="Cancel"
        message="Sure?"
        confirmLabel="Confirm"
        variant="danger"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    // Click the backdrop (the outer overlay div)
    await user.click(screen.getByText("Cancel").closest("div.fixed")!);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not dismiss on Escape when loading", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        title="Cancel"
        message="Sure?"
        confirmLabel="Confirm"
        variant="danger"
        isLoading={true}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("shows loading state when isLoading is true", () => {
    render(
      <ConfirmModal
        isOpen={true}
        title="Cancel"
        message="Sure?"
        confirmLabel="Confirm"
        variant="danger"
        isLoading={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Confirm")).toBeDisabled();
  });
});
