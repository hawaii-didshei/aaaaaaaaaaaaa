document.getElementById('open-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://fortport.ru/settings' });
});

document.getElementById('link-settings').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://fortport.ru/settings' });
});