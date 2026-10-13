import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Между проверками дерево должно очищаться: иначе поиск по тексту
// натыкается на остатки прошлого экрана.
afterEach(cleanup);
