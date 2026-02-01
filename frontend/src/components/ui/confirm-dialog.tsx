import { useState, useCallback, createContext, useContext, type ReactNode } from 'react'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx.confirm
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    open: boolean
    options: ConfirmOptions
    resolve: ((value: boolean) => void) | null
  }>({ open: false, options: { title: '' }, resolve: null })

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, options, resolve })
    })
  }, [])

  const handleClose = (result: boolean) => {
    state.resolve?.(result)
    setState({ open: false, options: { title: '' }, resolve: null })
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => handleClose(false)} />
          <div className="relative bg-background border border-border rounded-lg shadow-lg p-6 w-full max-w-md mx-4 animate-in fade-in zoom-in-95">
            <h2 className="text-lg font-semibold">{state.options.title}</h2>
            {state.options.description && (
              <p className="text-sm text-muted-foreground mt-2">{state.options.description}</p>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => handleClose(false)}
                className="px-4 py-2 text-sm rounded-md border border-input bg-background hover:bg-muted"
              >
                {state.options.cancelLabel || 'Cancelar'}
              </button>
              <button
                onClick={() => handleClose(true)}
                className={`px-4 py-2 text-sm rounded-md font-medium ${
                  state.options.variant === 'destructive'
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {state.options.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
