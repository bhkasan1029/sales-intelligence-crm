import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Link
        href="/login"
        className="rounded-lg bg-[#1A1A1A] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1A1A1A]/90"
      >
        Get started
      </Link>
    </div>
  );
}
