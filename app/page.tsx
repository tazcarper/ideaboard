import { CreateBoardButton } from "@/components/CreateBoardButton";
import { RecentBoards } from "@/components/RecentBoards";
import { SignInButton } from "@/components/SignInButton";
import { UserMenu } from "@/components/UserMenu";
import { getUser } from "@/lib/auth";

type Search = { auth_error?: string; next?: string };

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const { auth_error, next } = await searchParams;
  const user = await getUser();

  const meta = (user?.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
  const displayName = meta.full_name ?? meta.name ?? null;
  const avatarUrl = meta.avatar_url ?? meta.picture ?? null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      {user ? (
        <div className="absolute right-4 top-4">
          <UserMenu name={displayName} email={user.email ?? null} avatarUrl={avatarUrl} />
        </div>
      ) : null}

      <main className="flex w-full max-w-xl flex-col items-center gap-10 text-center">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            IdeaBoard
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            A collaborative whiteboard. Create a board, share the link, brainstorm together.
          </p>
        </div>

        {auth_error ? (
          <p
            role="status"
            className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
          >
            Sign-in failed: {auth_error}
          </p>
        ) : null}

        {user ? <CreateBoardButton /> : <SignInButton next={next ?? "/"} />}

        {user ? <RecentBoards /> : null}
      </main>
    </div>
  );
}
