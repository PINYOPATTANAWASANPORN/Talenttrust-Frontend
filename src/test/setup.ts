import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => cleanup());
