import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PreferencesProvider } from "../context/PreferencesContext";
import { NotificationsProvider } from "../context/NotificationsContext";
import { useNotifications } from "../context/notifications";

function Probe() {
  const { notifications, unreadCount, addNotification, markRead, markAllRead, clear } = useNotifications();
  return (
    <>
      <output data-testid="count">{notifications.length}</output>
      <output data-testid="unread">{unreadCount}</output>
      <button type="button" onClick={() => addNotification({ id: "n1", type: "movie_added", title: "T", message: "m", createdAt: Date.now(), isRead: false })}>
        add
      </button>
      <button type="button" onClick={() => markRead("n1")}>read</button>
      <button type="button" onClick={() => markAllRead()}>readall</button>
      <button type="button" onClick={() => clear()}>clear</button>
    </>
  );
}

function wrap(ui) {
  return (
    <PreferencesProvider>
      <NotificationsProvider>{ui}</NotificationsProvider>
    </PreferencesProvider>
  );
}

beforeEach(() => localStorage.clear());

describe("NotificationsProvider", () => {
  it("starts empty", () => {
    render(wrap(<Probe />));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByTestId("unread").textContent).toBe("0");
  });

  it("adds and persists a notification", () => {
    render(wrap(<Probe />));
    act(() => screen.getByText("add").click());
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("unread").textContent).toBe("1");
    expect(localStorage.getItem("aios_notifications_v1")).toContain("n1");
  });

  it("dedupes by id", () => {
    render(wrap(<Probe />));
    act(() => screen.getByText("add").click());
    act(() => screen.getByText("add").click());
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("marks read and clears", () => {
    render(wrap(<Probe />));
    act(() => screen.getByText("add").click());
    act(() => screen.getByText("read").click());
    expect(screen.getByTestId("unread").textContent).toBe("0");
    act(() => screen.getByText("clear").click());
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("caps at 20", () => {
    function Many() {
      const { addNotification } = useNotifications();
      return <button type="button" onClick={() => { for (let i = 0; i < 25; i += 1) addNotification({ id: `m${i}`, type: "movie_added", title: "t", message: "m", createdAt: Date.now(), isRead: false }); }}>many</button>;
    }
    render(wrap(<Many />));
    act(() => screen.getByText("many").click());
    // re-render a probe to read count
    // count via storage
    const stored = JSON.parse(localStorage.getItem("aios_notifications_v1"));
    expect(stored.length).toBe(20);
  });

  it("gates by master toggle", () => {
    localStorage.setItem("setting-notifications", "false");
    render(wrap(<Probe />));
    act(() => screen.getByText("add").click());
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("gates list-adds by per-type toggle", () => {
    localStorage.setItem("setting-notificationsListAdds", "false");
    render(wrap(<Probe />));
    // override the probe's type by reusing same id/type movie_added
    act(() => screen.getByText("add").click());
    expect(screen.getByTestId("count").textContent).toBe("0");
  });
});
