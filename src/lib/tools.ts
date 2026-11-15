import type { LayerId } from './map';

export type Tool = 'hand' | 'select' | 'room' | 'brush' | 'eraser' | 'door' | 'light' | 'object';

export const TOOLS: { id: Tool; key: string; icon: string; layer?: LayerId }[] = [
  { id: 'hand', key: '1', icon: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-7v-1a1.5 1.5 0 0 1 3 0V12m0-6.5a1.5 1.5 0 0 1 3 0V12m0-4.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-4.6-2.2L4.5 15a1.6 1.6 0 0 1 2.4-2l1.1 1.2' },
  { id: 'select', key: '2', icon: 'M5 3l14 8-6 1.5L10 19z', layer: 'objects' },
  { id: 'room', key: '3', icon: 'M4 4h16v16H4z M4 9h16 M9 4v16', layer: 'floor' },
  { id: 'brush', key: '4', icon: 'M18 3l3 3-9.5 9.5-3-3zM8.5 12.5 6 15c-1.5 1.5-3 1.5-3 4 2.5 0 4-.5 5-1.5l3.5-3.5', layer: 'floor' },
  { id: 'eraser', key: '5', icon: 'M16 3l5 5-11 11H5l-2-2 13-14zM8.5 9.5l6 6 M10 19h11', layer: 'floor' },
  { id: 'door', key: '6', icon: 'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17 M3 21h18 M14 12h.01', layer: 'doors' },
  { id: 'light', key: '7', icon: 'M12 2c1 3 4 4.5 4 8.5A4 4 0 0 1 12 15a4 4 0 0 1-4-4.5C8 7.5 10 6 12 2z M9 18h6 M10 21h4', layer: 'lights' },
  { id: 'object', key: '8', icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12 4 7.5', layer: 'objects' },
];
