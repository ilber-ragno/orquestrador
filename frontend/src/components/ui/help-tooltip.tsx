import { useState, useRef, useEffect } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface HelpContent {
  title: string
  description: string
  example?: string
  suggestion?: string
}

interface HelpTooltipProps {
  content: HelpContent
  className?: string
}

export function HelpTooltip({ content, className }: HelpTooltipProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center rounded-full p-0 ml-1 text-muted-foreground/50 hover:text-primary transition-colors focus:outline-none focus:text-primary"
        aria-label="Ajuda"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          ref={ref}
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 rounded-lg border border-border bg-card p-3 shadow-lg animate-in fade-in-0 zoom-in-95"
          role="tooltip"
        >
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2.5 h-2.5 rotate-45 bg-card border-r border-b border-border" />
          </div>
          <p className="text-xs font-semibold text-foreground mb-1">{content.title}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{content.description}</p>
          {content.example && (
            <div className="mt-2 px-2 py-1.5 rounded bg-muted/50">
              <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Exemplo:</p>
              <p className="text-[11px] text-foreground font-mono">{content.example}</p>
            </div>
          )}
          {content.suggestion && (
            <div className="mt-2 flex items-start gap-1.5">
              <span className="text-[10px] text-primary font-medium shrink-0">Dica:</span>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{content.suggestion}</p>
            </div>
          )}
        </div>
      )}
    </span>
  )
}

// Helper that reads from the centralized help texts database
import { helpTexts } from '@/lib/help-texts'

interface FieldHelpProps {
  field: string
  className?: string
}

export function FieldHelp({ field, className }: FieldHelpProps) {
  const content = helpTexts[field]
  if (!content) return null
  return <HelpTooltip content={content} className={className} />
}
