import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center">
      <h1 className="text-2xl font-semibold">Board not found</h1>
      <p className="text-zinc-600">That board does not exist or has been deleted.</p>
      <Link href="/" className="text-blue-600 hover:underline">
        Back to home
      </Link>
    </div>
  );
}
