export default function HunterEmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-zinc-700">
      <p className="text-base font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-600 dark:text-zinc-400">{body}</p>
    </div>
  );
}
