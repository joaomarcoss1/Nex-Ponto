import { Suspense } from "react";
import { AdminMfa } from "@/components/admin/AdminMfa";

export default function Page() {
  return (
    <Suspense>
      <AdminMfa />
    </Suspense>
  );
}
