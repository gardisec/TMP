import { toast } from 'react-hot-toast';

const API_BASE_URL = '/api';

let isRefreshing = false;

const getCSRFToken = () => {
  const value = `; ${document.cookie}`;
  const parts = value.split('; csrf_access_token=');
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};

const refreshToken = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/refresh`, {
            method: 'POST',
            credentials: 'include',
        });
        if (!response.ok) {
            throw new Error('Ошибка обновления сессии');
        }
        return await response.json();
    } catch (error) {
        console.error('Невозможно обновить токен:', error);
        window.dispatchEvent(new Event('logout-event'));
        throw error;
    }
};

const fetchWithAuth = async (url, options = {}, isPublic = false) => {
  const makeRequest = async () => {
    const csrfToken = getCSRFToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method?.toUpperCase())) {
      if (csrfToken) headers['X-CSRF-TOKEN'] = csrfToken;
    }
    return await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  };
  
  let response = await makeRequest();

  if (response.status === 401 && !isRefreshing && !isPublic) {
    console.log('Попытка обновить токен.');
    isRefreshing = true;
    try {
        await refreshToken();
        console.log('Токен успешно обновлен.');
        response = await makeRequest();
    } finally {
        isRefreshing = false;
    }
  }

  if (response.status === 204) {
    return { success: true };
  }

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401 && !isPublic) {
        toast.error('Ваша сессия истекла. Пожалуйста, войдите снова.');
        window.dispatchEvent(new Event('logout-event'));
    }
    else if (response.status === 403) {
        toast.error(data.error || 'Доступ запрещен. У вас нет прав для этого действия.');
    }
    
    const error = new Error(data.error || data.message || `Ошибка запроса: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  
  return data;
};


export const login = (username, password) => {
    return fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
    }).then(res => res.json());
};

export const register = (username, password) => {
    return fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
    }).then(res => res.json());
};

export const logout = () => fetchWithAuth('/logout', { method: 'POST' });

export const getCurrentUser = () => fetchWithAuth('/me', {}, true);

export const updateUser = (userId, data) => fetchWithAuth(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
});

export const fetchShips = (page = 1, perPage = 10) => fetchWithAuth(`/ships?page=${page}&per_page=${perPage}`);

export const fetchShipDetails = (shipId) => fetchWithAuth(`/ships/${shipId}`);

export const deleteShip = (shipId) => fetchWithAuth(`/ships/${shipId}`, { method: 'DELETE' });

export const addShip = (shipData) => fetchWithAuth('/ships', { method: 'POST', body: JSON.stringify(shipData),});

export const fetchShipComponents = (shipId, page = 1, perPage = 10) => fetchWithAuth(`/ships/${shipId}/components?page=${page}&per_page=${perPage}`);

export const addShipComponent = (shipId, componentData) => fetchWithAuth(`/ships/${shipId}/components`, { method: 'POST', body: JSON.stringify(componentData),});

export const fetchComponentDetails = (componentId) => fetchWithAuth(`/components/${componentId}`);

export const deleteComponent = (componentId) => fetchWithAuth(`/components/${componentId}`, { method: 'DELETE' });

export const fetchComponentUpdates = (componentId, page = 1, perPage = 5) => fetchWithAuth(`/components/${componentId}/updates?page=${page}&per_page=${perPage}`);

export const updateComponentStatus = (componentId, updateData) => fetchWithAuth(`/components/${componentId}/update_status`, { method: 'POST', body: JSON.stringify(updateData),});

export const fetchExpiringComponents = (page = 1, perPage = 10) => fetchWithAuth(`/expiring_components?page=${page}&per_page=${perPage}`);

export const fetchComponentTypes = () => fetchWithAuth('/component_types');

export const subscribeToComponentType = (data) => fetchWithAuth('/subscribe_component_type', { method: 'POST', body: JSON.stringify(data),});

export const unsubscribeFromComponentType = (data) => fetchWithAuth('/unsubscribe_component_type', { method: 'POST', body: JSON.stringify(data),});

export const fetchUserSubscriptions = () => fetchWithAuth('/subscriptions');