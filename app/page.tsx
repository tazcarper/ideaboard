import { CreateBoardButton } from "@/components/CreateBoardButton";
import { RecentBoards } from "@/components/RecentBoards";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-10 text-center">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            IdeaBoard
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            A collaborative whiteboard. Create a board, share the link, brainstorm together.
          </p>
        </div>

        <CreateBoardButton />

        <RecentBoards />
      </main>
    </div>
  );
}
