import { AskForm } from '@/components/ask-form';

/**
 * Ask a question about Aotearoa New Zealand public data and read the answer
 * with the datasets it came from.
 *
 * @returns The homepage section
 */
export default function HomePage() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16 scroll-mt-20"
    >
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold">NZ Data Answer</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Ask about Aotearoa New Zealand public data. The answer names the datasets it came from,
          reports where a source failed, and shows what the model call cost.
        </p>
      </header>
      <AskForm />
    </main>
  );
}
