"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  hasExistingValue?: boolean;
  onChange?: (value: string | undefined) => void;
}

export function MaskedInput({
  name,
  label,
  placeholder,
  required,
  hasExistingValue,
  onChange,
}: Props) {
  const [editing, setEditing] = useState(!hasExistingValue);
  const [value, setValue] = useState("");

  if (!editing) {
    return (
      <div className="space-y-1">
        <label className="block text-sm font-medium">
          {label}
          {required && " *"}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-tertiary font-mono">••••••••</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs h-auto px-1 py-0 text-secondary hover:text-primary"
            onClick={() => {
              setEditing(true);
              onChange?.("");
            }}
          >
            Replace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">
        {label}
        {required && " *"}
        <Input
          type="password"
          name={name}
          placeholder={placeholder}
          value={value}
          required={required}
          onChange={(e) => {
            setValue(e.target.value);
            onChange?.(e.target.value);
          }}
          className="font-mono text-xs mt-1"
        />
      </label>
    </div>
  );
}
