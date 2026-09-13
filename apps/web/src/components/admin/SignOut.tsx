"use client";

export function SignOut() {
  return (
    <button type="button" onClick={async () => { await fetch("/api/admin/logout", { method: "POST" }); location.href = "/admin"; }} className="font-medium text-lapis hover:underline">
      Sign out
    </button>
  );
}
