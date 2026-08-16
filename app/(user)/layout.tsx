import { RequireUser } from "@/components/layout/RequireUser";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return <RequireUser>{children}</RequireUser>;
}
