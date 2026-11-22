import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import WhereToWatch from "../components/detail/WhereToWatch";

describe("WhereToWatch component", () => {
  it("renders null when watchProviders is empty or null", () => {
    const { container: c1 } = render(<WhereToWatch watchProviders={null} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<WhereToWatch watchProviders={{}} />);
    expect(c2.firstChild).toBeNull();
  });

  it("renders grouped Stream, Rent, and Buy sections with provider cards", () => {
    const mockProviders = {
      US: {
        link: "https://www.themoviedb.org/movie/550/watch?locale=en-US",
        flatrate: [
          { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg" },
          { provider_id: 9, provider_name: "Prime Video", logo_path: "/prime.jpg" },
        ],
        rent: [
          { provider_id: 2, provider_name: "Apple TV", logo_path: "/appletv.jpg" },
        ],
        buy: [
          { provider_id: 3, provider_name: "Google Play Movies", logo_path: "/gplay.jpg" },
        ],
      },
    };

    render(<WhereToWatch watchProviders={mockProviders} />);

    expect(screen.getByRole("region", { name: /where to watch/i })).toBeInTheDocument();
    expect(screen.getByText("Stream")).toBeInTheDocument();
    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("Buy")).toBeInTheDocument();

    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("Prime Video")).toBeInTheDocument();
    expect(screen.getByText("Apple TV")).toBeInTheDocument();
    expect(screen.getByText("Google Play Movies")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /justwatch via tmdb/i });
    expect(link).toHaveAttribute("href", "https://www.themoviedb.org/movie/550/watch?locale=en-US");
  });

  it("deduplicates providers within the same bucket", () => {
    const mockProviders = {
      US: {
        flatrate: [
          { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg" },
        ],
        ads: [
          { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg" },
        ],
      },
    };

    render(<WhereToWatch watchProviders={mockProviders} />);

    const netflixItems = screen.getAllByText("Netflix");
    expect(netflixItems).toHaveLength(1);
  });
});
