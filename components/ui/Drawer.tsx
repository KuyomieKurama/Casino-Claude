"use client";

import { Modal, type ModalProps } from "./Modal";

export type DrawerProps = Omit<ModalProps, "presentation" | "size">;

/** Drawer: von unten auf Mobil, von rechts ab Tablet. Gleiche Semantik wie Modal. */
export function Drawer(props: DrawerProps) {
  return <Modal {...props} presentation="drawer" />;
}
