import { useContext } from 'react';
import { FactoryContext } from './factory-context';

export const useFactory = () => {
  const context = useContext(FactoryContext);
  if (!context) {
    throw new Error('useFactory must be used within a FactoryProvider');
  }
  return context;
};