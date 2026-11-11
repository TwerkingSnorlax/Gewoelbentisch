export type Tool = 'hand' | 'room' | 'brush' | 'eraser' | 'door' | 'light';

export const TOOLS: { id: Tool; key: string; icon: string }[] = [
  { id: 'hand', key: '1', icon: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-7v-1a1.5 1.5 0 0 1 3 0V12m0-6.5a1.5 1.5 0 0 1 3 0V12m0-4.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-4.6-2.2L4.5 15a1.6 1.6 0 0 1 2.4-2l1.1 1.2' },
  { id: 'room', key: '2', icon: 'M4 4h16v16H4z M4 9h16 M9 4v16' },
  { id: 'brush', key: '3', icon: 'M18 3l3 3-9.5 9.5-3-3zM8.5 12.5 6 15c-1.5 1.5-3 1.5-3 4 2.5 0 4-.5 5-1.5l3.5-3.5' },
  { id: 'eraser', key: '4', icon: 'M16 3l5 5-11 11H5l-2-2 13-14zM8.5 9.5l6 6 M10 19h11' },
  { id: 'door', key: '5', icon: 'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17 M3 21h18 M14 12h.01' },
  { id: 'light', key: '6', icon: 'M12 2c1 3 4 4.5 4 8.5A4 4 0 0 1 12 15a4 4 0 0 1-4-4.5C8 7.5 10 6 12 2z M9 18h6 M10 21h4' },
];
