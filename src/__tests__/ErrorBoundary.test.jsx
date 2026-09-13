import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';

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
});
