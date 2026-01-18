/**
 * Ordering Store
 * Manages custom ordering of items in the sidebar (notes, folders)
 * Stores ordering as arrays of IDs per context
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OrderingState {
  // Map of context -> array of IDs in order
  // Context examples: 'favourites', 'cluttered', 'folder-notes-{folderId}', 'root-folders', 'folder-children-{folderId}'
  orders: Record<string, string[]>;
  
  // Actions
  setOrder: (context: string, orderedIds: string[]) => void;
  getOrder: (context: string) => string[];
  reorderItem: (context: string, itemId: string, newIndex: number) => void;
  insertAfter: (context: string, itemId: string, afterId: string) => void;
  insertBefore: (context: string, itemId: string, beforeId: string) => void;
  removeFromOrder: (context: string, itemId: string) => void;
  addToOrder: (context: string, itemId: string, index?: number) => void;
}

// Safe localStorage wrapper for browser/Node.js compatibility
const getLocalStorage = (): any => {
  try {
    // Check if we're in a browser environment
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      return (globalThis as any).localStorage;
    }
    return null;
  } catch {
    return null;
  }
};

const safeStorage = {
  getItem: (name: string) => {
    try {
      const storage = getLocalStorage();
      return storage ? storage.getItem(name) : null;
    } catch (error) {
      // Error handled
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      const storage = getLocalStorage();
      if (storage) {
        storage.setItem(name, value);
      }
    } catch (error) {
      // Error handled
    }
  },
  removeItem: (name: string) => {
    try {
      const storage = getLocalStorage();
      if (storage) {
        storage.removeItem(name);
      }
    } catch (error) {
      // Error handled
    }
  },
};

export const useOrderingStore = create<OrderingState>()(
  persist(
    (set, get) => ({
      orders: {},
      
      setOrder: (context, orderedIds) => {
        set((state) => ({
          orders: {
            ...state.orders,
            [context]: orderedIds,
          },
        }));
      },
      
      getOrder: (context) => {
        return get().orders[context] || [];
      },
      
      reorderItem: (context, itemId, newIndex) => {
        const currentOrder = get().orders[context] || [];
        const oldIndex = currentOrder.indexOf(itemId);
        
        if (oldIndex === -1) {
          // Item not in order yet, add it
          const newOrder = [...currentOrder];
          newOrder.splice(newIndex, 0, itemId);
          get().setOrder(context, newOrder);
          return;
        }
        
        // Remove from old position and insert at new position
        const newOrder = [...currentOrder];
        newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, itemId);
        
        get().setOrder(context, newOrder);
      },
      
      insertAfter: (context, itemId, afterId) => {
        const currentOrder = get().orders[context] || [];
        
        // Remove item if it exists
        const withoutItem = currentOrder.filter(id => id !== itemId);
        
        // Find position of afterId
        const afterIndex = withoutItem.indexOf(afterId);
        
        if (afterIndex === -1) {
          // afterId not found, add to end
          get().setOrder(context, [...withoutItem, itemId]);
        } else {
          // Insert after the target
          const newOrder = [...withoutItem];
          newOrder.splice(afterIndex + 1, 0, itemId);
          get().setOrder(context, newOrder);
        }
      },
      
      insertBefore: (context, itemId, beforeId) => {
        const currentOrder = get().orders[context] || [];
        
        // Remove item if it exists
        const withoutItem = currentOrder.filter(id => id !== itemId);
        
        // Find position of beforeId
        const beforeIndex = withoutItem.indexOf(beforeId);
        
        if (beforeIndex === -1) {
          // beforeId not found, add to beginning
          get().setOrder(context, [itemId, ...withoutItem]);
        } else {
          // Insert before the target
          const newOrder = [...withoutItem];
          newOrder.splice(beforeIndex, 0, itemId);
          get().setOrder(context, newOrder);
        }
      },
      
      removeFromOrder: (context, itemId) => {
        const currentOrder = get().orders[context] || [];
        const newOrder = currentOrder.filter(id => id !== itemId);
        get().setOrder(context, newOrder);
      },
      
      addToOrder: (context, itemId, index) => {
        const currentOrder = get().orders[context] || [];
        
        // Don't add if already exists
        if (currentOrder.includes(itemId)) return;
        
        if (index !== undefined) {
          const newOrder = [...currentOrder];
          newOrder.splice(index, 0, itemId);
          get().setOrder(context, newOrder);
        } else {
          // Add to end
          get().setOrder(context, [...currentOrder, itemId]);
        }
      },
    }),
    {
      name: 'clutter-ordering-storage',
      storage: safeStorage as any,
      version: 1,
    }
  )
);


