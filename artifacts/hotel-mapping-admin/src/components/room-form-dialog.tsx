import { useState, useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const ROOM_TYPES = [
  { value: "standard", label: "Standard" },
  { value: "superior", label: "Superior" },
  { value: "deluxe", label: "Deluxe" },
  { value: "suite", label: "Suite" },
  { value: "villa", label: "Villa" },
  { value: "apartment", label: "Apartment" },
  { value: "studio", label: "Studio" },
] as const;

export const VIEW_TYPES = [
  { value: "sea", label: "Sea View" },
  { value: "garden", label: "Garden View" },
  { value: "pool", label: "Pool View" },
  { value: "city", label: "City View" },
  { value: "mountain", label: "Mountain View" },
  { value: "none", label: "No View" },
] as const;

export const BED_TYPES = [
  "single",
  "double",
  "queen",
  "king",
  "twin",
  "sofa",
  "bunk",
  "futon",
] as const;

export const COMMON_AMENITIES = [
  "WiFi",
  "Air Conditioning",
  "Mini Bar",
  "TV",
  "Safe",
  "Balcony",
  "Bathtub",
  "Shower",
  "Jacuzzi",
  "Coffee Machine",
  "Kitchenette",
  "Washing Machine",
  "Iron",
  "Hair Dryer",
  "Sea View",
  "Pool Access",
  "Room Service",
  "Smart TV",
  "Nespresso",
  "Terrace",
] as const;

export interface RoomFormValues {
  canonicalName: string;
  hotelId: string;
  roomType: string;
  bedConfig: { count: number; type: string }[];
  areaSqm: string;
  maxOccupancy: number;
  amenities: string[];
  viewType: string;
}

export interface RoomFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  hotels: { id: string; name: string }[];
  initialValues?: Partial<RoomFormValues>;
  onSubmit: (values: RoomFormValues) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function RoomFormDialog({
  open,
  onOpenChange,
  mode,
  hotels,
  initialValues,
  onSubmit,
  isSubmitting,
}: RoomFormDialogProps) {
  const defaultValues: RoomFormValues = {
    canonicalName: "",
    hotelId: hotels[0]?.id ?? "",
    roomType: "standard",
    bedConfig: [{ count: 1, type: "double" }],
    areaSqm: "",
    maxOccupancy: 2,
    amenities: [],
    viewType: "",
    ...initialValues,
  };

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RoomFormValues>({ defaultValues });

  const { fields, append, remove } = useFieldArray({ control, name: "bedConfig" });
  const amenities = watch("amenities");
  const [amenityInput, setAmenityInput] = useState("");

  useEffect(() => {
    if (open) {
      reset({ ...defaultValues, ...initialValues });
      setAmenityInput("");
    }
  }, [open, initialValues]);

  const addAmenity = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (!amenities.includes(trimmed)) {
      setValue("amenities", [...amenities, trimmed]);
    }
    setAmenityInput("");
  };

  const removeAmenity = (amenity: string) => {
    setValue("amenities", amenities.filter((a) => a !== amenity));
  };

  const toggleCommonAmenity = (amenity: string) => {
    if (amenities.includes(amenity)) {
      removeAmenity(amenity);
    } else {
      setValue("amenities", [...amenities, amenity]);
    }
  };

  const handleFormSubmit = handleSubmit(async (data) => {
    await onSubmit(data);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New Master Room" : "Edit Room Details"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a new canonical room to the master registry."
              : "Update the canonical room details. Changes apply immediately to the master registry."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleFormSubmit} className="space-y-6 py-2">
          {/* BASIC INFO */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Basic Info</h3>

            <div className="space-y-1.5">
              <Label htmlFor="canonicalName">Canonical Name <span className="text-destructive">*</span></Label>
              <Input
                id="canonicalName"
                placeholder="e.g. Deluxe King Room Sea View"
                {...register("canonicalName", { required: "Name is required", minLength: { value: 1, message: "Name cannot be empty" } })}
                className={cn(errors.canonicalName && "border-destructive")}
              />
              {errors.canonicalName && (
                <p className="text-xs text-destructive">{errors.canonicalName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Hotel <span className="text-destructive">*</span></Label>
                <Controller
                  control={control}
                  name="hotelId"
                  rules={{ required: "Hotel is required" }}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={mode === "edit"}
                    >
                      <SelectTrigger className={cn(errors.hotelId && "border-destructive")}>
                        <SelectValue placeholder="Select hotel" />
                      </SelectTrigger>
                      <SelectContent>
                        {hotels.map((h) => (
                          <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.hotelId && <p className="text-xs text-destructive">{errors.hotelId.message}</p>}
                {mode === "edit" && (
                  <p className="text-xs text-muted-foreground">Hotel cannot be changed after creation</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Room Type <span className="text-destructive">*</span></Label>
                <Controller
                  control={control}
                  name="roomType"
                  rules={{ required: "Room type is required" }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className={cn(errors.roomType && "border-destructive")}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROOM_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.roomType && <p className="text-xs text-destructive">{errors.roomType.message}</p>}
              </div>
            </div>
          </div>

          <Separator />

          {/* PHYSICAL DETAILS */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Physical Details</h3>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="areaSqm">Area (m²)</Label>
                <Input
                  id="areaSqm"
                  type="number"
                  min="1"
                  step="0.5"
                  placeholder="e.g. 42"
                  {...register("areaSqm", {
                    validate: (v) => {
                      if (!v) return true;
                      const n = Number(v);
                      return (!isNaN(n) && n > 0) || "Must be a positive number";
                    },
                  })}
                  className={cn(errors.areaSqm && "border-destructive")}
                />
                {errors.areaSqm && <p className="text-xs text-destructive">{errors.areaSqm.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="maxOccupancy">Max Occupancy <span className="text-destructive">*</span></Label>
                <Input
                  id="maxOccupancy"
                  type="number"
                  min="1"
                  max="20"
                  {...register("maxOccupancy", {
                    required: "Required",
                    min: { value: 1, message: "Min 1" },
                    valueAsNumber: true,
                  })}
                  className={cn(errors.maxOccupancy && "border-destructive")}
                />
                {errors.maxOccupancy && <p className="text-xs text-destructive">{errors.maxOccupancy.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>View Type</Label>
                <Controller
                  control={control}
                  name="viewType"
                  render={({ field }) => (
                    <Select value={field.value || "__none"} onValueChange={(v) => field.onChange(v === "__none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="No view type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">None</SelectItem>
                        {VIEW_TYPES.map((v) => (
                          <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* BED CONFIGURATION */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Bed Configuration</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => append({ count: 1, type: "double" })}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Bed
              </Button>
            </div>

            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md">
                No beds configured — click "Add Bed" to start
              </p>
            )}

            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="w-20">
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        {...register(`bedConfig.${index}.count` as const, { valueAsNumber: true, min: 1 })}
                        className="h-8 text-center"
                      />
                    </div>
                    <span className="text-sm text-muted-foreground shrink-0">×</span>
                    <Controller
                      control={control}
                      name={`bedConfig.${index}.type` as const}
                      render={({ field: f }) => (
                        <Select value={f.value} onValueChange={f.onChange}>
                          <SelectTrigger className="h-8 flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BED_TYPES.map((bt) => (
                              <SelectItem key={bt} value={bt} className="capitalize">{bt.charAt(0).toUpperCase() + bt.slice(1)} Bed</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* AMENITIES */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Amenities</h3>

            {/* Common amenity quick-add chips */}
            <div className="flex flex-wrap gap-1.5">
              {COMMON_AMENITIES.map((a) => {
                const selected = amenities.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleCommonAmenity(a)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                    )}
                  >
                    {a}
                  </button>
                );
              })}
            </div>

            {/* Custom amenity input */}
            <div className="flex gap-2">
              <Input
                value={amenityInput}
                onChange={(e) => setAmenityInput(e.target.value)}
                placeholder="Custom amenity…"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addAmenity(amenityInput); }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => addAmenity(amenityInput)}
                disabled={!amenityInput.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Selected amenities */}
            {amenities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2.5 rounded-md border bg-muted/30 min-h-[40px]">
                {amenities.map((a) => (
                  <Badge key={a} variant="secondary" className="gap-1 pl-2 pr-1">
                    {a}
                    <button
                      type="button"
                      onClick={() => removeAmenity(a)}
                      className="ml-0.5 rounded-full hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? mode === "create" ? "Creating…" : "Saving…"
                : mode === "create" ? "Create Room" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
