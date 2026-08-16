export type UserRole = "user" | "admin";

export type User = {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  createdAt: string;
  // Kein Passwortfeld, in keiner Form (Regel 5).
};
