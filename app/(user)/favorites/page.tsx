import type { Metadata } from "next";
import { FavoritesPage } from "@/components/game/FavoritesPage";

export const metadata: Metadata = { title: "Favoriten" };

export default function Page() {
  return <FavoritesPage />;
}
