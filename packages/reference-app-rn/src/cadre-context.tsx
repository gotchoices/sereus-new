/**
 * cadre-context.tsx — React context provider for shared CadreNode state.
 *
 * Wraps the useCadre hook state in a context so all tabs/screens share
 * a single source of truth for connection status, strands, etc.
 */

import { createContext, useContext } from 'react';
import { useCadreInternal, type UseCadreResult } from './use-cadre';

const CadreContext = createContext<UseCadreResult | null>(null);

export function CadreProvider({ children }: { children: React.ReactNode }) {
	const cadre = useCadreInternal();
	return (
		<CadreContext.Provider value={cadre}>
			{children}
		</CadreContext.Provider>
	);
}

export function useCadre(): UseCadreResult {
	const ctx = useContext(CadreContext);
	if (!ctx) throw new Error('useCadre must be used within a <CadreProvider>');
	return ctx;
}
