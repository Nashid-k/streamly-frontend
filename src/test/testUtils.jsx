import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext.jsx";
import { AppContext } from "../context/auth";
import { PreferencesProvider } from "../context/PreferencesContext";
import { ToastProvider } from "../components/Toast.jsx";

/* Page Object-style test harness for this suite.
   ─────────────────────────────────────────────
   The team evaluated POM vs Screenplay for test structure (2026-09). Both are
   browser-E2E patterns; this repo has NO E2E layer (vitest + Testing Library,
   jsdom). POM wins here at its natural size: one module per page/test-surface
   owning the wiring needed to mount it, tests express behaviour only.
   Screenplay (Actor/Task/Question) earns its abstraction in large E2E suites
   with re-sequenced interactions — nothing here justifies that layer. The
   role-based queries Testing Library mandates already carry the Screenplay
   philosophy (tests read as intent, not selectors). If a Playwright layer
   lands later, each page's helper extends into a true POM without rewriting
   the assertions.

   This module is the SHARED half (providers every surface needs); page
   modules add their own thin renderPage() on top (see each page's test). */

/* Query client tuned for jsdom tests:
   - retry: false — a failing query must not retry past the act() window;
   - gcTime: Infinity — garbage collection is asynchronous; a 0 gcTime can
     collect a query between renders and fire subscribers outside act(),
     which React 19 surfaces as an act() warning. Long-lived clients are
     also closer to production (main.jsx keeps one client for the app). */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/* Provider stack copied from main.jsx (QueryClient > Auth > Preferences >
   I18n > Toast), wrapped in a MemoryRouter. Every provider is
   react-query-independent, so the order is a faithful mirror, not a guess.

   - route: initial MemoryRouter entry (default "/").
   - authValue: raw context value — renders AppContext.Provider directly for
     tests that need a synthetic session WITHOUT AuthProvider's sync/network
     side effects (watchlist, account rows). Omit for the real provider. */
export function createAppProviderWrapper({ route = "/", authValue } = {}) {
  const queryClient = createTestQueryClient();
  const AuthLayer = authValue
    ? ({ children }) => <AppContext.Provider value={authValue}>{children}</AppContext.Provider>
    : AuthProvider;
  function Wrapper({ children }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <QueryClientProvider client={queryClient}>
          <AuthLayer>
            <PreferencesProvider>
              <ToastProvider>{children}</ToastProvider>
            </PreferencesProvider>
          </AuthLayer>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  // Exposed so callers of the wrapper directly (renderWithProviders) can hand
  // the mounted client to assertions about cache/refetch behaviour.
  Wrapper.queryClient = queryClient;
  return Wrapper;
}

/* render() with the full app provider stack. Returns Testing Library's
   result plus the query client (a test asserting cache behaviour, refetch
   windows or invalidation needs the same client the tree is mounted with).
   A caller-supplied `wrapper` wins and no query client is reported. */
export function renderWithProviders(ui, { route, authValue, wrapper, ...renderOptions } = {}) {
  const options = { ...renderOptions };
  let queryClient;
  if (wrapper) {
    options.wrapper = wrapper;
  } else {
    const Wrapper = createAppProviderWrapper({ route, authValue });
    queryClient = Wrapper.queryClient;
    options.wrapper = Wrapper;
  }
  const result = render(ui, options);
  return { ...result, queryClient };
}
