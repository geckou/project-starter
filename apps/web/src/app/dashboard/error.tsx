'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-bold">Something went wrong</h2>
      <p className="text-gray-500">{error.message}</p>
      <button
        onClick={() => reset()}
        className="rounded bg-primary-600 px-4 py-2 text-white hover:bg-primary-700"
      >
        Try again
      </button>
    </main>
  );
}
