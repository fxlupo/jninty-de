import Button from "./ui/Button";

export default function NotificationPrompt({
  onEnable,
  onDismiss,
}: {
  onEnable: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-green-200 bg-surface p-4 shadow-lg md:bottom-6">
      <p className="font-display text-sm font-semibold text-text-heading">
        Erinnerungen fuer Gartenaufgaben aktivieren?
      </p>
      <p className="mt-1 text-xs text-text-secondary">
        Du bekommst Hinweise zu heute faelligen Aufgaben und Frostwarnungen.
      </p>
      <div className="mt-3 flex gap-2">
        <Button onClick={onEnable}>Erinnerungen aktivieren</Button>
        <Button variant="ghost" onClick={onDismiss}>
          Jetzt nicht
        </Button>
      </div>
    </div>
  );
}
