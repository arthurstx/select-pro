"use client";

import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type IconComponent = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

interface AuthInputProps extends React.ComponentProps<"input"> {
  icon: IconComponent;
}

export function AuthInput({ icon: Icon, className, ...props }: AuthInputProps) {
  return (
    <div className="relative">
      <Icon
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input className={cn("h-11 pl-9", className)} {...props} />
    </div>
  );
}

export function AuthPasswordInput({
  icon: Icon = LockIcon,
  className,
  ...props
}: React.ComponentProps<"input"> & { icon?: IconComponent }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Icon
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        type={visible ? "text" : "password"}
        className={cn("h-11 pr-11 pl-9", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px]"
      >
        {visible ? (
          <EyeOffIcon className="size-4" aria-hidden />
        ) : (
          <EyeIcon className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
