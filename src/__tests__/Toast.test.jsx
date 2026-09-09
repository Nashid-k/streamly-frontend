import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../components/Toast';

// Component that uses the toast hook
function ToastTrigger() {
  const { toast } = useToast();
  return (
    <button onClick={() => toast('success', 'It worked!')}>
      Show Toast
    </button>
  );
}

function ObjectToastTrigger() {
  const { toast } = useToast();
  return (
    <button onClick={() => toast({ type: 'success', title: 'Saved', message: 'Your list was updated.' })}>
      Show Object Toast
    </button>
  );
}

// Suppress console.error for expected test warnings
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalError;
  vi.useRealTimers();
});

describe('Toast', () => {
  it('throws when useToast is used outside provider', () => {
    // Suppress the error boundary console output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ToastTrigger />)).toThrow('useToast must be used within a ToastProvider');
    spy.mockRestore();
  });

  it('renders children inside provider', () => {
    render(
      <ToastProvider>
        <div>Test content</div>
      </ToastProvider>
    );
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('shows toast when triggered', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );

    act(() => {
      screen.getByText('Show Toast').click();
    });

    expect(screen.getByText('It worked!')).toBeInTheDocument();
  });

  it('supports the object form used by page and card actions', () => {
    render(
      <ToastProvider>
        <ObjectToastTrigger />
      </ToastProvider>
    );

    act(() => {
      screen.getByText('Show Object Toast').click();
    });

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Your list was updated.')).toBeInTheDocument();
  });

  it('shows correct type styling', () => {
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );

    act(() => {
      screen.getByText('Show Toast').click();
    });

    const toastEl = screen.getByText('It worked!').closest('[role="alert"]');
    expect(toastEl).toHaveClass('toast-success');
  });

  it('limits visible toasts to 5', () => {
    vi.useFakeTimers();
    function ManyToasts() {
      const { toast } = useToast();
      return (
        <button onClick={() => {
          for (let i = 0; i < 10; i++) {
            toast('info', `Toast ${i}`);
          }
        }}>
          Fire
        </button>
      );
    }

    render(
      <ToastProvider>
        <ManyToasts />
      </ToastProvider>
    );

    act(() => {
      screen.getByText('Fire').click();
    });

    // Should only show last 5 (slice(-4) + the new one = 5)
    const toasts = screen.queryAllByText(/Toast/);
    expect(toasts.length).toBeLessThanOrEqual(5);
  });
});
