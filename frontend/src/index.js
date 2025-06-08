import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import TestPage from './TestPage';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <TestPage />
  </React.StrictMode>
);
