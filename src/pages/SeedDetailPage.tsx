import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { usePouchQuery } from "../hooks/usePouchQuery.ts";
import { parseISO, differenceInDays } from "date-fns";
import { seedRepository, plantRepository, plantingRepository, seasonRepository } from "../db/index.ts";
import { QUANTITY_UNIT_LABELS } from "../constants/seedLabels";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { ChevronLeftIcon, SeedIcon } from "../components/icons";
import Skeleton from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { getBySpecies } from "../services/knowledgeBase";
import type { PlantType } from "../validation/plantInstance.schema";
import { formatDate } from "../lib/locale";

export default function SeedDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const seed = usePouchQuery(
    () => (id ? seedRepository.getById(id).then((s) => s ?? null) : Promise.resolve(null)),
    [id],
  );

  // "I Planted Some" modal state
  const [showPlantModal, setShowPlantModal] = useState(false);
  const [plantAmount, setPlantAmount] = useState("");
  const [createPlant, setCreatePlant] = useState(true);
  const [planting, setPlanting] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (seed === undefined) {
    return (
      <div className="mx-auto max-w-2xl p-4" role="status" aria-label="Saatgut wird geladen">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (seed === null) {
    return (
      <div className="mx-auto max-w-2xl p-4 text-center">
        <p className="text-lg font-medium text-text-secondary">Saatgut nicht gefunden</p>
        <Link
          to="/seeds"
          className="mt-2 inline-block text-sm text-text-heading hover:underline"
        >
          Zurueck zum Saatgutlager
        </Link>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0]!;
  const isExpired = seed.expiryDate != null && seed.expiryDate < today;
  const daysUntilExpiry =
    seed.expiryDate != null
      ? differenceInDays(parseISO(seed.expiryDate), new Date())
      : null;
  const isExpiringSoon =
    daysUntilExpiry != null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30;

  async function handlePlantFromSeed() {
    if (!seed || !id) return;
    const amount = Number(plantAmount);
    if (!amount || amount <= 0) {
      toast("Bitte einen gueltigen Wert eingeben", "error");
      return;
    }
    if (amount > seed.quantityRemaining) {
      toast("Nicht genug Saatgut vorhanden", "error");
      return;
    }

    setPlanting(true);
    try {
      // Deduct quantity
      await seedRepository.deductQuantity(id, amount);

      // Optionally create PlantInstance + Planting
      if (createPlant) {
        const activeSeason = await seasonRepository.getActive();
        const knowledge = getBySpecies(seed.species);
        const plantType: PlantType = knowledge?.plantType ?? "other";
        const plant = await plantRepository.create({
          species: seed.species,
          type: plantType,
          isPerennial: knowledge?.isPerennial ?? false,
          source: "seed",
          seedId: id,
          status: "active",
          tags: [],
          ...(seed.variety != null ? { variety: seed.variety } : {}),
        });

        if (activeSeason) {
          const todayISO = new Date().toISOString().split("T")[0]!;
          await plantingRepository.create({
            plantInstanceId: plant.id,
            seasonId: activeSeason.id,
            datePlanted: todayISO,
          });
        }
      }

      toast(
        createPlant
          ? "Saatgut abgezogen und Pflanze angelegt"
          : "Saatgut abgezogen",
        "success",
      );

      setShowPlantModal(false);
      setPlantAmount("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Saatgut konnte nicht verbucht werden";
      toast(message, "error");
    } finally {
      setPlanting(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await seedRepository.softDelete(id);
      toast("Saatgut geloescht", "success");
      void navigate("/seeds", { replace: true });
    } catch {
      toast("Saatgut konnte nicht geloescht werden", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void navigate("/seeds")}
          className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
          aria-label="Zurueck zum Saatgutlager"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="flex-1 truncate font-display text-2xl font-bold text-text-heading">
          {seed.name}
        </h1>
      </div>

      {/* Status badges */}
      <div className="mt-3 flex flex-wrap gap-2">
        {isExpired && <Badge variant="danger">Abgelaufen</Badge>}
        {isExpiringSoon && !isExpired && (
          <Badge variant="warning">
            Laeuft in {String(daysUntilExpiry)} Tagen ab
          </Badge>
        )}
      </div>

      {/* Seed info */}
      <Card className="mt-4">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-green-50">
            <SeedIcon className="h-8 w-8 text-text-link" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm italic text-text-secondary">{seed.species}</p>
            {seed.variety && (
              <p className="text-sm text-text-secondary">Sorte: {seed.variety}</p>
            )}
            {seed.brand && (
              <p className="text-sm text-text-secondary">Marke: {seed.brand}</p>
            )}
            {seed.supplier && (
              <p className="text-sm text-text-secondary">
                Anbieter: {seed.supplier}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Quantity & dates */}
      <Card className="mt-3">
        <h2 className="font-display text-base font-semibold text-text-heading">
          Bestand und Daten
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <span className="text-xs text-text-secondary">Restmenge</span>
            <p className="text-lg font-semibold text-text-primary">
              {String(seed.quantityRemaining)}{" "}
              <span className="text-sm font-normal text-text-secondary">
                {QUANTITY_UNIT_LABELS[seed.quantityUnit].toLowerCase()}
              </span>
            </p>
          </div>
          {seed.germinationRate != null && (
            <div>
              <span className="text-xs text-text-secondary">Keimrate</span>
              <p className="text-lg font-semibold text-text-primary">
                {String(seed.germinationRate)}%
              </p>
            </div>
          )}
          {seed.purchaseDate && (
            <div>
              <span className="text-xs text-text-secondary">Gekauft</span>
              <p className="text-sm font-medium text-text-primary">
                {formatDate(parseISO(seed.purchaseDate), "d. MMM yyyy")}
              </p>
            </div>
          )}
          {seed.expiryDate && (
            <div>
              <span className="text-xs text-text-secondary">Ablauf</span>
              <p
                className={`text-sm font-medium ${isExpired ? "text-terracotta-600" : "text-text-primary"}`}
              >
                {formatDate(parseISO(seed.expiryDate), "d. MMM yyyy")}
              </p>
            </div>
          )}
          {seed.cost != null && (
            <div>
              <span className="text-xs text-text-secondary">Kosten</span>
              <p className="text-sm font-medium text-text-primary">
                {seed.cost.toFixed(2)} €
              </p>
            </div>
          )}
          {seed.storageLocation && (
            <div>
              <span className="text-xs text-text-secondary">Lagerort</span>
              <p className="text-sm font-medium text-text-primary">
                {seed.storageLocation}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Notes */}
      {seed.notes && (
        <Card className="mt-3">
          <h2 className="font-display text-base font-semibold text-text-heading">
            Notizen
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
            {seed.notes}
          </p>
        </Card>
      )}

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => setShowPlantModal(true)}>
          Aus diesem Saatgut pflanzen
        </Button>
        <Button
          variant="secondary"
          onClick={() => void navigate(`/seeds/${seed.id}/edit`)}
        >
          Bearbeiten
        </Button>
        <Button variant="ghost" onClick={() => setShowDeleteConfirm(true)}>
          Loeschen
        </Button>
      </div>

      {/* "I Planted Some" modal */}
      {showPlantModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-soil-900/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPlantModal(false);
          }}
        >
          <div className="w-full max-w-sm rounded-xl bg-surface-elevated p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold text-text-heading">
              Saatgut verwenden
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              Wie viel hast du ausgesaet?
            </p>

            <div className="mt-4">
              <label
                htmlFor="plant-amount"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Menge ({QUANTITY_UNIT_LABELS[seed.quantityUnit].toLowerCase()})
              </label>
              <Input
                id="plant-amount"
                type="number"
                min="0"
                step={
                  seed.quantityUnit === "grams" ||
                  seed.quantityUnit === "ounces"
                    ? "0.1"
                    : "1"
                }
                max={String(seed.quantityRemaining)}
                value={plantAmount}
                onChange={(e) => setPlantAmount(e.target.value)}
                placeholder={`Max: ${String(seed.quantityRemaining)}`}
              />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                id="create-plant-toggle"
                role="switch"
                aria-checked={createPlant}
                onClick={() => setCreatePlant(!createPlant)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 ${
                  createPlant ? "bg-green-600" : "bg-brown-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-surface-elevated shadow-sm transition-transform ${
                    createPlant ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <label
                htmlFor="create-plant-toggle"
                className="text-sm text-text-secondary"
              >
                Neuen Pflanzeneintrag anlegen
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                onClick={() => void handlePlantFromSeed()}
                disabled={planting}
              >
                {planting ? "Speichert..." : "Bestaetigen"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowPlantModal(false)}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-soil-900/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDeleteConfirm(false);
          }}
        >
          <div className="w-full max-w-sm rounded-xl bg-surface-elevated p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold text-text-primary">
              Saatgut loeschen?
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              Dadurch wird &ldquo;{seed.name}&rdquo; aus deinem Saatgutlager entfernt.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="bg-terracotta-500 hover:bg-terracotta-600"
              >
                {deleting ? "Loescht..." : "Loeschen"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
