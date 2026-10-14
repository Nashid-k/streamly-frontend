import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AmbientBackground from "../components/AmbientBackground";

/* The ambient layer is used two ways: self-closing (`<AmbientBackground src=…/>`)
   on most pages, and WRAPPING (`<AmbientBackground>…content…</AmbientBackground>`)
   on the Explore/Public collection pages. A component that renders the fixed
   backdrop but ignores `children` drops every wrapped page's content — the
   exact "blank collection page" regression this pins. */
describe("AmbientBackground", () => {
  it("renders wrapped children above the fixed backdrop", () => {
    render(
      <AmbientBackground fallback>
        <h1>Collection content</h1>
      </AmbientBackground>,
    );
    expect(screen.getByText("Collection content")).toBeInTheDocument();
  });

  it("stays renderable (self-closing) with no children", () => {
    const { container } = render(<AmbientBackground fallback />);
    expect(container.querySelector(".ambient-sky")).toBeInTheDocument();
  });
});
