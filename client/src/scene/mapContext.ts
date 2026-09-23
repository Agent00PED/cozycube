import { createContext, useContext } from "react";
import type { MapId } from "@shared/types";

/** Which world is mounted, for props that dress differently per world (Mochi). */
export const MapIdContext = createContext<MapId>("cozy_lounge");
export const useMapId = () => useContext(MapIdContext);
