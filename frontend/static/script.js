document.addEventListener('DOMContentLoaded', function () {
  var menuToggle = document.getElementById('menu-toggle');
  var wrapper = document.getElementById('wrapper');
  if (wrapper) {
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
      wrapper.classList.add('toggled');
    }
  }
  if (menuToggle && wrapper) {
    menuToggle.addEventListener('click', function (e) {
      e.preventDefault();
      wrapper.classList.toggle('toggled');
      localStorage.setItem('sidebar-collapsed', wrapper.classList.contains('toggled'));
    });
  }

  var devicesContainer = document.getElementById('devices');
  if (devicesContainer) {
    function adjustCardWidths() {
      var cards = devicesContainer.querySelectorAll('.card');
      if (cards.length === 0) return;
      var maxWidth = 0;
      cards.forEach(function(card) {
        maxWidth = Math.max(maxWidth, card.offsetWidth);
      });
      cards.forEach(function(card) {
        card.style.minWidth = maxWidth + 'px';
      });
    }

    function loadDevices() {
      fetch('/api/mikrotiks')
        .then(res => res.json())
        .then(data => {
          devicesContainer.innerHTML = '';
          data.forEach(d => {
            var col = document.createElement('div');
            col.className = 'col-auto mb-3';
            col.innerHTML = '<div class="card"><div class="card-body text-center">' +
              '<h5 class="card-title">' + d.nombre + '</h5>' +
              '<span class="status-dot ' + (d.status === 'Online' ? 'text-success' : 'text-danger') + '">&#9679;</span>' +
              '</div></div>';
            devicesContainer.appendChild(col);
          });
          adjustCardWidths();
        });
    }
    loadDevices();
    setInterval(loadDevices, 5000);
  }

  var visibleToggles = document.querySelectorAll('.visible-toggle');
  if (visibleToggles.length > 0) {
    visibleToggles.forEach(function(cb) {
      cb.addEventListener('change', function() {
        var id = this.getAttribute('data-id');
        fetch('/mikrotiks/' + id + '/visible', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'visible=' + (this.checked ? '1' : '0')
        });
      });
    });
  }

  document.querySelectorAll('.datatable').forEach(function(el) {
    var options = {
      dom: '<"row mb-3 justify-content-end"<"col-auto"f><"col-auto ms-2"B>>rtip',
      buttons: [{ extend: 'colvis', text: 'Columnas', columns: ':not(:last-child)' }]
    };

    if (el.id === 'usersTable') {
      options.dom = '<"row mb-3 justify-content-end"<"col-auto"f>>rtip';
      options.buttons = [];
    }

    new DataTable(el, options);
  });
});
