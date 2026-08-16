import type { Metadata } from "next";
import { Dashboard } from "@/components/user/Dashboard";

export const metadata: Metadata = { title: "Übersicht" };

export default function Page() {
  return <Dashboard />;
}
