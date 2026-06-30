/**
 * Entry point for Engine Demo
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

import './design-system/tokens.css';
import './design-system/theme.css';
import './styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
