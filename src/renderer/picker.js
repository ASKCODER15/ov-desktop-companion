(function () {
  const api = window.petFishAPI;
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) api.pickSpotResult(e.screenX, e.screenY);
    else api.cancelSpotPicker();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') api.cancelSpotPicker();
  });
})();
