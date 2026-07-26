import { createContext, useContext } from "react";

export const PreferencesContext = createContext(null);
export const NavigationContext = createContext(null);

export function usePreferences() {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error("PreferencesContext is unavailable");
  return preferences;
}

export function useAppNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("NavigationContext is unavailable");
  return navigation;
}
