import { CdnImageAdapter } from "../../api/cdnImageAdapter";

function ProductionCompaniesBlock({ companies }) {
  if (!companies || companies.length === 0) return null;

  const normalized = companies
    .map((c, i) => {
      if (!c) return null;
      if (typeof c === "string") return null;
      /* Optimized at render like the rest of the app's imagery: raw paths and
         full TMDB URLs both leave as w300 WebP via the shared adapter. */
      const logoPath = c.logoUrl || c.logo_path;
      const fullLogoUrl = logoPath ? CdnImageAdapter.getUrl(logoPath, "w300") : null;
      if (!fullLogoUrl) return null;
      return {
        id: c.id || `pc-${i}`,
        name: c.name || "Production",
        logoUrl: fullLogoUrl,
      };
    })
    .filter(Boolean);

  if (normalized.length === 0) return null;

  const displayCompanies = normalized.slice(0, 6);

  return (
    <div className="mt-4 grid gap-2 grid-cols-2">
      {displayCompanies.map((company) => (
        <div
          key={company.id}
          title={company.name}
          className="flex items-center justify-center h-10 px-2"
        >
          <img
            loading="lazy"
            src={company.logoUrl}
            alt={company.name}
            className="w-auto max-h-7 max-w-full object-contain brightness-0 invert opacity-50"
          />
        </div>
      ))}
    </div>
  );
}

export default ProductionCompaniesBlock;