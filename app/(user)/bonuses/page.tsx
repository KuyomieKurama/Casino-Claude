import type { Metadata } from "next";
import { BonusesPage } from "@/components/user/BonusesPage";

export const metadata: Metadata = { title: "Boni" };

export default function Page() {
  return <BonusesPage />;
}
