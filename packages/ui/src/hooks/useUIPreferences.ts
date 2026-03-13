import { useState, useEffect, useCallback } from 'react';

/**
 * UI Preferences that persist across app launches
 */
interface UIPreferences {
  sidebarCollapsed: boolean;
  // Add more preferences here as needed:
  // windowWidth?: number;
  // fontSize?: number;
  // etc.
}

const DEFAULT_PREFERENCES: UIPreferences = {
  sidebarCollapsed: false,
};

const STORAGE_KEY = 'clutter-ui-preferences';

/**
 * Hook to manage persistent UI preferences using localStorage
 * 
 * Automatically saves to localStorage when preferences change
 * and loads them on mount
 */
export function useUIPreferences() {
  const [preferences, setPreferences] = useState<UIPreferences>(() => {
    // Load from localStorage on initial mount
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_PREFERENCES, ...parsed };
      }
    } catch (error) {
      // Error handled
      // Silently fail and use defaults
    }
    return DEFAULT_PREFERENCES;
  });

  // Save to localStorage whenever preferences change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      // Error handled
      // Silently fail
    }
  }, [preferences]);

  // Setter for sidebar collapsed state
  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setPreferences((prev) => ({ ...prev, sidebarCollapsed: collapsed }));
  }, []);

  // Toggle sidebar collapsed state
  const toggleSidebarCollapsed = useCallback(() => {
    setPreferences((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
  }, []);

  return {
    preferences,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
  };
}


