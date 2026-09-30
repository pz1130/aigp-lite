export function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4 select-none group">
      {/* Logo mark — gradient indigo badge */}
      <div className="relative w-7 h-7 shrink-0">
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-accent to-accent-hover shadow-sm shadow-[rgba(50,168,82,0.25)]" />
        <div className="absolute inset-[2.5px] rounded-[5px] bg-gradient-to-br from-white/20 to-transparent" />
        <div className="absolute inset-[4px] rounded-[4px] bg-white/10" />
        <div className="absolute top-[2px] left-[2px] right-[4px] h-px rounded-full bg-white/40" />
      </div>
      {/* Brand text */}
      <div className="flex flex-col leading-none space-y-0.5">
        <span className="text-[13px] font-bold text-primary tracking-tight">
          AIGP
        </span>
        <span className="text-[9px] font-medium text-tertiary/50 uppercase tracking-[0.12em] leading-none">
          Governance
        </span>
      </div>
    </div>
  );
}
