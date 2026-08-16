import type { Metadata } from "next";
import { SecurityPage } from "@/components/user/SecurityPage";

export const metadata: Metadata = { title: "Sicherheit" };

export default function Page() {
  return <SecurityPage />;
}
