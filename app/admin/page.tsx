import type { Metadata } from "next";
import { AdminGate } from "@/components/admin/AdminGate";

export const metadata: Metadata = { title: "Admin (Demo)" };

export default function AdminPage() {
  return <AdminGate />;
}
