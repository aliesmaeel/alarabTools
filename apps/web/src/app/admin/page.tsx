import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  if (await isAdmin()) redirect("/admin/providers");
  return (
    <div className="flex justify-center pt-10">
      <LoginForm />
    </div>
  );
}
