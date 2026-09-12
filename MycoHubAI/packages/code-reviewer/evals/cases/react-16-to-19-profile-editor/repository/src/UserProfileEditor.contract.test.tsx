import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UserProfileEditor } from "./UserProfileEditor";

const firstProfile = { id: "profile-1", name: "Ada", email: "ada@example.com" };
const secondProfile = { id: "profile-2", name: "Grace", email: "grace@example.com" };

describe("UserProfileEditor behavior contract", () => {
  it("resynchronizes both draft fields when the profile prop identity changes", () => {
    const { rerender } = render(
      <UserProfileEditor profile={firstProfile} onSave={vi.fn()} onReconnect={vi.fn()} />,
    );

    rerender(<UserProfileEditor profile={secondProfile} onSave={vi.fn()} onReconnect={vi.fn()} />);

    expect(screen.getByLabelText("Name")).toHaveValue("Grace");
    expect(screen.getByLabelText("Email")).toHaveValue("grace@example.com");
  });

  it("preserves the sibling draft field while editing either field", async () => {
    const user = userEvent.setup();
    render(<UserProfileEditor profile={firstProfile} onSave={vi.fn()} onReconnect={vi.fn()} />);

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");

    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("handles one online event after rerender and none after unmount", () => {
    const onReconnect = vi.fn();
    const { rerender, unmount } = render(
      <UserProfileEditor profile={firstProfile} onSave={vi.fn()} onReconnect={onReconnect} />,
    );

    rerender(<UserProfileEditor profile={firstProfile} onSave={vi.fn()} onReconnect={onReconnect} />);
    fireEvent(window, new Event("online"));
    expect(onReconnect).toHaveBeenCalledTimes(1);

    unmount();
    fireEvent(window, new Event("online"));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
