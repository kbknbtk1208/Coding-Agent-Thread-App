export const reviewTheme = {
  shell:
    'relative min-h-screen overflow-hidden bg-[#020202] text-[#f4f1ea] selection:bg-[#FFA16C]/25 selection:text-white',
  backdrop:
    'pointer-events-none absolute inset-0 opacity-[0.36] [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_24%,transparent_76%,rgba(255,255,255,0.02))] [background-size:42px_42px,42px_42px,100%_100%] [background-position:0_0,0_0,0_0]',
  page: 'relative flex h-screen flex-col',
  header:
    'border-b border-white/10 bg-[rgba(7,7,7,0.9)] backdrop-blur-xl shadow-[0_1px_0_rgba(255,255,255,0.03)]',
  surface:
    'rounded-[14px] border border-white/10 bg-white/[0.03] shadow-[0_1px_0_rgba(255,255,255,0.04),0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-sm',
  surfaceSoft: 'rounded-[12px] border border-white/10 bg-white/[0.025]',
  surfaceInset:
    'rounded-[12px] border border-white/10 bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  surfaceDashed: 'rounded-[12px] border border-dashed border-white/10 bg-white/[0.02]',
  headerLabel: 'text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8b949e]',
  meta: 'text-xs text-[#8b949e]',
  body: 'text-sm leading-6 text-[#d0d5db]',
  muted: 'text-[#8b949e]',
  title: 'text-sm font-semibold text-[#f8f7f4]',
  detail: 'text-xs leading-5 text-[#b3b9c2]',
  field:
    'rounded-[10px] border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white placeholder:text-[#6f7780] focus:border-[#FFA16C]/55 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
  fieldCompact:
    'rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 text-sm text-white placeholder:text-[#6f7780] focus:border-[#FFA16C]/55 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
  textarea:
    'w-full resize-none rounded-[10px] border border-white/10 bg-black/35 px-3 py-3 text-sm text-white placeholder:text-[#6f7780] focus:border-[#FFA16C]/55 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
  pill: 'rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-[#d0d5db]',
  pillAccent:
    'rounded-full border border-[#FFA16C]/20 bg-[#FFA16C]/10 px-2.5 py-1 text-[11px] text-[#ffd9c0]',
  pillInfo:
    'rounded-full border border-[#479FFA]/20 bg-[#479FFA]/10 px-2.5 py-1 text-[11px] text-[#dcecff]',
  pillSuccess:
    'rounded-full border border-[#4EBE96]/20 bg-[#4EBE96]/10 px-2.5 py-1 text-[11px] text-[#d7f5e8]',
  pillDanger:
    'rounded-full border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-2.5 py-1 text-[11px] text-[#ffd9d9]',
  chip: 'rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#d0d5db]',
  chipAccent:
    'rounded-full border border-[#FFA16C]/20 bg-[#FFA16C]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#ffd9c0]',
  chipInfo:
    'rounded-full border border-[#479FFA]/20 bg-[#479FFA]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#dcecff]',
  chipSuccess:
    'rounded-full border border-[#4EBE96]/20 bg-[#4EBE96]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#d7f5e8]',
  chipDanger:
    'rounded-full border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#ffd9d9]',
  primaryButton:
    'rounded-[10px] bg-[#FFA16C] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#ffb98d] disabled:cursor-not-allowed disabled:bg-[#FFA16C]/60',
  secondaryButton:
    'rounded-[10px] border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-[#d0d5db] transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-60',
  tabButton:
    'rounded-[10px] border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white',
  tabButtonActiveAccent: 'border-[#FFA16C]/30 bg-[#FFA16C]/12 text-[#ffd9c0]',
  tabButtonActiveInfo: 'border-[#479FFA]/30 bg-[#479FFA]/12 text-[#dcecff]',
  tabButtonActiveSuccess: 'border-[#4EBE96]/30 bg-[#4EBE96]/12 text-[#d7f5e8]',
  border: 'border-white/10',
  divider: 'border-white/10',
  accentText: 'text-[#FFA16C]',
  infoText: 'text-[#479FFA]',
  successText: 'text-[#4EBE96]',
  dangerText: 'text-[#FF5C5C]',
} as const;
