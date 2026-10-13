import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AccountProvider } from './account';
import { DataProvider } from './data';
import App from './App';
import './styles.css';
import './competition-styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><DataProvider><AccountProvider><App /></AccountProvider></DataProvider></BrowserRouter></React.StrictMode>,
);
