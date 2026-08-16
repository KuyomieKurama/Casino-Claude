import type { Metadata } from "next";
import { HistoryPage } from "@/components/wallet/HistoryPage";

export const metadata: Metadata = { title: "Spielhistorie" };

export default function Page() {
  return <HistoryPage />;
}
