export function renderSearchSuggestions({ locations = [], state = 'hidden', onSelect }) {
  const menu = document.querySelector('#search-suggestions');
  menu.replaceChildren();

  if (state === 'hidden') {
    menu.hidden = true;
    return;
  }

  menu.hidden = false;

  if (state === 'loading') {
    menu.append(createStatusItem('Recherche de villes…', 'loading'));
    return;
  }

  if (state === 'empty') {
    menu.append(createStatusItem('Cette ville n’a pas été trouvée.', 'empty'));
    return;
  }

  if (state === 'error') {
    menu.append(createStatusItem('La recherche est momentanément indisponible.', 'error'));
    return;
  }

  locations.forEach((location) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'search-option';
    item.setAttribute('role', 'option');
    item.innerHTML = `<span class="search-option__pin" aria-hidden="true">⌖</span><span class="search-option__content"><strong></strong><small></small></span>`;
    item.querySelector('strong').textContent = location.name;
    item.querySelector('small').textContent = [location.admin1, location.country].filter(Boolean).join(', ');
    item.addEventListener('click', () => onSelect(location));
    menu.append(item);
  });
}

export function renderFavorites(favorites, activeLocation, { onSelect, onRemove }) {
  const list = document.querySelector('#favorites-list');
  const empty = document.querySelector('#favorites-empty');
  list.replaceChildren();
  empty.hidden = favorites.length > 0;

  favorites.forEach((location) => {
    const chip = document.createElement('div');
    chip.className = 'favorite-chip';
    if (sameLocation(location, activeLocation)) chip.classList.add('is-active');

    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'favorite-chip__select';
    selectButton.setAttribute('aria-label', `Afficher la météo à ${location.name}`);
    selectButton.innerHTML = '<span aria-hidden="true">★</span><strong></strong><small></small>';
    selectButton.querySelector('strong').textContent = location.name;
    selectButton.querySelector('small').textContent = location.country;
    selectButton.addEventListener('click', () => onSelect(location));

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'favorite-chip__remove';
    removeButton.setAttribute('aria-label', `Supprimer ${location.name} des favoris`);
    removeButton.textContent = '×';
    removeButton.addEventListener('click', () => onRemove(location));

    chip.append(selectButton, removeButton);
    list.append(chip);
  });
}

export function renderFavoriteToggle(isSaved) {
  const button = document.querySelector('#favorite-toggle');
  const label = button.querySelector('span');
  button.classList.toggle('is-saved', isSaved);
  button.setAttribute('aria-pressed', String(isSaved));
  button.setAttribute('aria-label', isSaved ? 'Retirer cette ville des favoris' : 'Ajouter cette ville aux favoris');
  label.textContent = isSaved ? 'Enregistrée' : 'Enregistrer';
}

export function showLocationStatus(message, type = 'info') {
  const status = document.querySelector('#location-status');
  status.textContent = message;
  status.dataset.type = type;
  status.hidden = !message;
}

function createStatusItem(message, state) {
  const item = document.createElement('p');
  item.className = `search-status search-status--${state}`;
  item.textContent = message;
  return item;
}

function sameLocation(first, second) {
  return first && second
    && Math.abs(Number(first.latitude) - Number(second.latitude)) < 0.0001
    && Math.abs(Number(first.longitude) - Number(second.longitude)) < 0.0001;
}
