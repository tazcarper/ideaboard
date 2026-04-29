type Props = {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export function UserMenu({ name, email, avatarUrl }: Props) {
  const display = name ?? email ?? "Account";
  return (
    <form action="/auth/sign-out" method="post" className="flex items-center gap-3">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-zinc-300" />
      )}
      <div className="flex flex-col text-left">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{display}</span>
        <button
          type="submit"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 text-left"
        >
          Sign out
        </button>
      </div>
    </form>
  );
}
