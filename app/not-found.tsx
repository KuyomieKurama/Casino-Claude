import { Compass } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { NotFoundSearch } from "@/components/feedback/NotFoundSearch";

export default function NotFound() {
  return (
    <div className="anim-panel-in mx-auto max-w-xl pt-12">
      <EmptyState
        className="edge-light"
        icon={<Compass aria-hidden="true" />}
        headingLevel={1}
        title="Diese Seite gibt es nicht."
        text="Die Adresse ist falsch geschrieben oder das Spiel existiert nicht. Zurück in die Lobby, oder direkt suchen."
        action={<LinkButton href="/casino" variant="primary">Zur Lobby</LinkButton>}
      >
        <NotFoundSearch />
      </EmptyState>
    </div>
  );
}
