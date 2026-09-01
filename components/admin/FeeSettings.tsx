"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck, IdCard, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toMessage, unwrap } from "@/lib/action-result";
import {
  updateShippingFee,
  updateIdVerificationFee,
} from "@/lib/actions/settings";
import { peso } from "@/lib/money";

/**
 * The delivery already inside every price.
 *
 * A PSA birth certificate is ₱685 — ₱500 for the document and ₱185 to get it
 * to the customer. Nothing about that changes here; the figure is recorded so
 * combining orders knows what a second delivery would have cost, and can stop
 * charging for one that never happens.
 */
export function ShippingFeeSetting(props: { initial: string; canEdit: boolean }) {
  return (
    <FeeSetting
      {...props}
      icon={<Truck className="h-4 w-4 text-[#2a78d6]" />}
      title="Shipping included in every price"
      note="Each price above is the document plus one delivery. This is the delivery part. It doesn't change what anyone is charged on its own — it is what the board takes off when two orders are combined into one parcel, since a second delivery is not owed."
      hint={(v) => `Two documents in one parcel: ${v} off.`}
      save={updateShippingFee}
    />
  );
}

/**
 * What it costs to find a number the customer has lost.
 *
 * TIN and PhilHealth both ask whether the account is new or existing. An
 * existing one nobody can find the number for means a trip to the agency to
 * look it up, and this is what that trip is charged at — added to the order
 * automatically the moment that answer is given, so nobody quotes a price and
 * then has to go back for more.
 */
export function IdVerificationFeeSetting(props: {
  initial: string;
  canEdit: boolean;
}) {
  return (
    <FeeSetting
      {...props}
      icon={<IdCard className="h-4 w-4 text-violet-600" />}
      title="ID number verification"
      note="Added to a TIN or PhilHealth order when the customer says they already have an account but cannot find the number. It pays for looking it up at the agency, and is charged once per ID."
      hint={(v) => `An order needing one lookup costs ${v} more.`}
      save={updateIdVerificationFee}
    />
  );
}

function FeeSetting({
  initial,
  canEdit,
  icon,
  title,
  note,
  hint,
  save: saveFee,
}: {
  initial: string;
  canEdit: boolean;
  icon: React.ReactNode;
  title: string;
  note: string;
  hint: (formatted: string) => string;
  save: (value: string) => Promise<ReturnType<typeof updateShippingFee>> | any;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await saveFee(value));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            ₱
          </span>
          <Input
            inputMode="decimal"
            value={value}
            disabled={!canEdit || pending}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
            className="h-9 w-32 pl-6"
          />
        </div>
        {canEdit && (
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : saved ? (
              <>
                <Check className="h-3.5 w-3.5" /> Saved
              </>
            ) : (
              "Save"
            )}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {hint(peso(Number(value) || 0))}
        </span>
      </div>
      {!canEdit && (
        <p className="mt-2 text-xs text-muted-foreground">
          Only an admin can change this.
        </p>
      )}
      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
