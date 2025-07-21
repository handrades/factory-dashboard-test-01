import { createContext } from 'react';
import type { FactoryContextType } from './factory-types';

export const FactoryContext = createContext<FactoryContextType | undefined>(undefined);