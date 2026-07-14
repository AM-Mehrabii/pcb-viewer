import { useEffect, useMemo } from "react"
import { createContext } from "react"
import { createStore, type State, type StateProps } from "../global-store"

export const StoreContext = createContext(null)

export type PcbViewerStore = ReturnType<typeof createStore>

export const ContextProviders = ({
  children,
  initialState,
  disablePcbGroups,
  onStoreReady,
}: {
  children?: any
  initialState?: Partial<StateProps>
  disablePcbGroups?: boolean
  onStoreReady?: (store: PcbViewerStore) => void
}) => {
  const store = useMemo(
    () => createStore(initialState, disablePcbGroups),
    [disablePcbGroups],
  )

  useEffect(() => {
    onStoreReady?.(store)
  }, [store, onStoreReady])

  return (
    <StoreContext.Provider value={store as any}>
      {children}
    </StoreContext.Provider>
  )
}

export type { State as PcbViewerState }
