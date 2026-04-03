import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect }          from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSenderList }   from "@/lib/senders/queries";
import SenderTable           from "@/components/dashboard/SenderTable";

export const dynamic = "force-dynamic";

export default async function SendersPage() {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) redirect("/sign-in");

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!user) redirect("/sign-in");

  const senders = await fetchSenderList(user.id as string);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Senders</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage inbox behavior by sender instead of one email at a time.
        </p>
      </div>

      {/* Table */}
      <SenderTable senders={senders} />
    </div>
  );
}
