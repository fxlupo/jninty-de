import { Link } from "react-router-dom";
import Card from "../components/ui/Card";

export default function NotFoundPage() {
  return (
    <div className="p-4">
      <h1 className="font-display text-2xl font-bold text-text-heading">
        Seite nicht gefunden
      </h1>
      <Card className="mt-4">
        <p className="text-text-secondary">
          Die gesuchte Seite existiert nicht.
        </p>
        <Link
          to="/"
          className="mt-3 inline-block text-sm font-medium text-text-heading hover:text-text-heading"
        >
          Zurück zum Dashboard
        </Link>
      </Card>
    </div>
  );
}
