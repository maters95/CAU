'use strict';

// Navigation logic for Main page
const btnCollate = document.getElementById('go-to-index');
const btnGenerate = document.getElementById('generate-reports');
const btnConfig = document.getElementById('go-to-settings');
const btnLogs = document.getElementById('go-to-logs');

btnCollate.addEventListener('click', () => {
  window.location.href = 'index.html';
});
btnGenerate.addEventListener('click', () => {
  window.location.href = 'reports.html';
});
btnConfig.addEventListener('click', () => {
  window.location.href = 'settings.html';
});
btnLogs.addEventListener('click', () => {
  window.location.href = 'logs.html';
});

console.log('Main navigation updated.');