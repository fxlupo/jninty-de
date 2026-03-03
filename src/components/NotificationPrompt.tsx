import Button from "./ui/Button";

export default function NotificationPrompt({
  onEnable,
  onDismiss,
}: {
  onEnable: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-green-200 bg-cream-50 p-4 shadow-lg md:bottom-6">
      <p className="font-display text-sm font-semibold text-green-800">
        Get reminders for your garden tasks?
      </p>
      <p className="mt-1 text-xs text-soil-600">
        We&apos;ll notify you about tasks due today and frost warnings.
      </p>
      <div className="mt-3 flex gap-2">
        <Button onClick={onEnable}>Enable Reminders</Button>
        <Button variant="ghost" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}
