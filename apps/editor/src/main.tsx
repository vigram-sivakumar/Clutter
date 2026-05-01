/**
 * Entry point for Engine Demo
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './design-system/tokens.css';
import './design-system/theme.css';
import './styles/base.css';
import './styles/app-layout.css';
import './styles/topbar.css';
import './styles/editor.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
