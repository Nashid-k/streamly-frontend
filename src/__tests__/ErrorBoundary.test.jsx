import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';
import { isChunkLoadError } from '../utils/chunkRecovery';

// Component that throws on render
function ThrowingComponent({ shouldThrow }) {
  if (shouldThrow) throw new Error('Test error');
  return <div>Child content</div>;
}

// Suppress console.error for expected test errors
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalError;
});

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Oops!/)).toBeInTheDocument();
    expect(screen.getByText(/Return to Home/)).toBeInTheDocument();
  });

  it('shows updating UI for chunk load errors', () => {
    function ChunkError() {
      throw new Error('Failed to fetch dynamically imported module');
    }
    render(
      <ErrorBoundary>
        <ChunkError />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Updating Application/)).toBeInTheDocument();
  });

  it('shows updating UI for import script errors', () => {
    function ImportError() {
      throw new Error('Importing a module script failed');
    }
    render(
      <ErrorBoundary>
        <ImportError />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Updating Application/)).toBeInTheDocument();
  });

  it('shows updating UI for the Vite 7 / Firefox chunk wording', () => {
    function Vite7ChunkError() {
      throw new TypeError('error loading dynamically imported module https://example.com/assets/HomePage-abc123.js');
    }
    render(
      <ErrorBoundary>
        <Vite7ChunkError />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Updating Application/)).toBeInTheDocument();
  });

  it('stays on the Updating screen when the reload loop-guard suppresses recovery', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    sessionStorage.setItem('chunk_reload_time', '999_000'); // 1s ago → throttled
    function ChunkError() {
      throw new Error('Failed to fetch dynamically imported module');
    }
    render(
      <ErrorBoundary>
        <ChunkError />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Updating Application/)).toBeInTheDocument();
    sessionStorage.removeItem('chunk_reload_time');
    Date.now.mockRestore();
  });

  it('offers a manual cache-wipe reload when recovery is suppressed', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    sessionStorage.setItem('chunk_reload_time', '999_000'); // 1s ago → throttled
    function ChunkError() {
      throw new Error('error loading dynamically imported module');
    }
    render(
      <ErrorBoundary>
        <ChunkError />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /Reload App/i })).toBeInTheDocument();
    sessionStorage.removeItem('chunk_reload_time');
    Date.now.mockRestore();
  });

  it('isChunkLoadError covers every browser wording and rejects other errors', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Failed to load module script: bad MIME type'))).toBe(true);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});
