"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { PHONE_COUNTRY_OPTIONS, normalizeToE164, splitE164, type CountryCode } from "@gas-station/utils";
import { Label } from "./label";

/**
 * The one phone-number input used everywhere a profile's phone is
 * collected (customers, employees, managers, owners) — country selector
 * (default Egypt, always changeable) + national-number field, normalized to
 * E.164 via @gas-station/utils's normalizeToE164() on every change. Never
 * forces the user to type a country code themselves.
 *
 * Works two ways, matching how this app's forms are already built:
 *  - Controlled: pass `value`/`onChange`, read the E.164 result (or null
 *    while invalid/empty) straight from onChange — used by client-state
 *    wizards (the booking wizard's "create customer" panel, the public
 *    join flow).
 *  - Native form participant: pass `name` (and optionally `defaultValue`
 *    for an edit form) and nothing else — a hidden input keeps the E.164
 *    value in sync for a plain `<form action={formAction}>` to submit,
 *    matching employee-form.tsx's existing uncontrolled-field pattern.
 */
export interface PhoneInputProps {
  id?: string;
  name?: string;
  label?: string;
  defaultValue?: string | null;
  value?: string | null;
  onChange?: (e164: string | null) => void;
  required?: boolean;
  disabled?: boolean;
}

export function PhoneInput({ id, name, label, defaultValue, value, onChange, required, disabled }: PhoneInputProps) {
  const isControlled = value !== undefined;
  const initial = useMemo(() => splitE164(isControlled ? value : defaultValue), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [national, setNational] = useState(initial.national);

  const e164 = useMemo(() => normalizeToE164(national, country), [national, country]);
  const showError = national.trim().length > 0 && e164 === null;

  function handleCountryChange(e: ChangeEvent<HTMLSelectElement>) {
    const nextCountry = e.target.value as CountryCode;
    setCountry(nextCountry);
    onChange?.(normalizeToE164(national, nextCountry));
  }

  function handleNationalChange(e: ChangeEvent<HTMLInputElement>) {
    const nextNational = e.target.value;
    setNational(nextNational);
    onChange?.(normalizeToE164(nextNational, country));
  }

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="flex gap-2">
        <select
          aria-label="Country"
          value={country}
          onChange={handleCountryChange}
          disabled={disabled}
          className="w-40 shrink-0 rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:bg-slate-100"
        >
          {PHONE_COUNTRY_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name} (+{option.callingCode})
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          value={national}
          onChange={handleNationalChange}
          required={required}
          disabled={disabled}
          placeholder="1012345678"
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:bg-slate-100"
        />
      </div>
      {showError && <p className="mt-1 text-xs text-red-700">Enter a valid phone number for the selected country.</p>}
      {name && <input type="hidden" name={name} value={e164 ?? ""} />}
    </div>
  );
}
